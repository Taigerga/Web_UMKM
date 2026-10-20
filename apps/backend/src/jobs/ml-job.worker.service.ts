// src/jobs/ml-job.worker.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { MlClientService } from "../ml/ml-client.service.js";
import { MlDataService } from "../ml/ml-data.service.js";
import { MlJobService } from "./ml-job.service.js";
import { RedisService } from "../cache/redis.service.js";

@Injectable()
export class MlJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlJobWorkerService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
    private readonly mlData: MlDataService,
    private readonly jobService: MlJobService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => void this.tick(), 5_000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async tick() {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await this.prisma.mlJobs.updateMany({
      where: { status: "running", startedAt: { lt: tenMinAgo } },
      data: { status: "failed", errorMessage: "Job timeout (>10 minutes)", completedAt: new Date() },
    });

    let job: any = null;
    try {
      job = await this.prisma.$transaction(async (tx: any) => {
        const rows: any[] = await tx.$queryRaw`
          SELECT id FROM ml_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;
        if (!rows || !rows.length) return null;
        const id = rows[0].id as string;
        await tx.mlJobs.update({
          where: { id },
          data: { status: "running", workerId: process.pid.toString(), startedAt: new Date() },
        });
        return await tx.mlJobs.findUnique({ where: { id } });
      });
    } catch (e) {
      this.logger.warn(`lock/select failed: ${e instanceof Error ? e.message : e}`);
      return;
    }

    if (!job) return;

    try {
      const result = await this.execute(job);
      await this.jobService.complete(job.id, result);
      await this.redis.invalidateStoreMetrics(job.storeId);
      this.logger.debug(`job ${job.id} completed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      // GALAT SEMENTARA bukan akhir job: kalau layanan ML mati sesaat
      // (uvicorn --reload yang memantau seluruh repo menolak koneksi
      // beberapa detik setiap kali ada berkas berubah di mana pun -
      // laporan pengguna 20 Okt "fetch failed terus"), job yang kebetulan
      // dieksekusi tepat di jendela itu lama tampil gagal permanen padahal
      // infrastruktur kembali normal detik berikutnya. Antre KEMBALI selama
      // job masih muda; lewat jendela ini dinyatakan gagal betulan supaya
      // pengguna melihat keputusan akhir, bukan job mengantre selamanya.
      // Galat data (ML 400: toko belum layak, jobType tak dikenal) tidak
      // masuk pola ini - gagalnya tetap segera.
      const isTransient =
        /Layanan ML tidak merespons|circuit open|fetch failed|ECONNREFUSED|ETIMEDOUT|aborted|failed: 5\d\d/i.test(msg);
      const ageMs = job.createdAt ? Date.now() - new Date(job.createdAt).getTime() : Infinity;
      if (isTransient && ageMs < 5 * 60 * 1000) {
        await this.prisma.mlJobs.update({
          where: { id: job.id },
          data: { status: "queued", workerId: null, startedAt: null },
        });
        this.logger.warn(
          `job ${job.id} galat sementara - antre lagi (umur ${Math.round(ageMs / 1000)} dtk): ${msg}`,
        );
        return;
      }

      await this.jobService.fail(job.id, msg);
      this.logger.error(`job ${job.id} failed: ${msg}`);
    }
  }

  private async execute(job: any) {
    const params = (job.inputParams as any) ?? {};
    // Setiap inferensi per-toko membangun input dari data toko itu sendiri
    // (Promt §13.2). Kalau toko belum punya data, Python menjawab 400 dan
    // job ditandai gagal dengan pesan jelas - status "belum layak", bukan
    // hasil dikarang.
    switch (job.jobType) {
      case "forecast": {
        const input = await this.mlData.forecastInput(
          job.storeId,
          params.horizonDays ?? params.horizon_days ?? 30,
        );
        return await this.mlClient.forecastRun(input);
      }
      case "segmentation": {
        const input = await this.mlData.segmentationInput(job.storeId);
        return await this.mlClient.segmentationRun(input);
      }
      case "market-basket":
      case "basket": {
        const input = await this.mlData.basketInput(job.storeId);
        return await this.mlClient.basketRun(input, params.topK ?? params.top_k ?? 20);
      }
      case "churn": {
        const input = await this.mlData.churnInput(job.storeId);
        return await this.mlClient.churnRun(input, params.topK ?? params.top_k ?? 50);
      }
      case "anomaly": {
        const input = await this.mlData.anomalyInput(job.storeId);
        return await this.mlClient.anomalyRun(input);
      }
      default:
        throw new Error(`Unknown jobType: ${job.jobType}`);
    }
  }
}
