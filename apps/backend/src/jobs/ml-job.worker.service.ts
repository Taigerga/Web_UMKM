// src/jobs/ml-job.worker.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { MlClientService } from "../ml/ml-client.service.js";
import { MlJobService } from "./ml-job.service.js";
import { RedisService } from "../cache/redis.service.js";

@Injectable()
export class MlJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlJobWorkerService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
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
      await this.jobService.fail(job.id, msg);
      this.logger.error(`job ${job.id} failed: ${msg}`);
    }
  }

  private async execute(job: any) {
    const params = (job.inputParams as any) ?? {};
    switch (job.jobType) {
      case "forecast":
        return await this.mlClient.forecast(params.horizonDays ?? params.horizon_days ?? 30);
      case "segmentation":
        return await this.mlClient.segmentation();
      case "market-basket":
      case "basket":
        return await this.mlClient.basket(params.topK ?? params.top_k ?? 20);
      case "churn":
        return await this.mlClient.churn(params.topK ?? params.top_k ?? 50);
      case "anomaly":
        return await this.mlClient.anomaly();
      default:
        throw new Error(`Unknown jobType: ${job.jobType}`);
    }
  }
}
