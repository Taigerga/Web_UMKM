// src/jobs/ml-job.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class MlJobService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Buat job baru - atau kembalikan job yang SAMA MASIH HIDUP (queued/running)
   * untuk mencegah submit ganda.
   *
   * Versi lama membuat kunci otomatis `storeId:jobType:{}` dan dedupe-nya
   * berlaku FOREVER: job forecast yang sudah completed/failed menahan kunci
   * itu, sehingga klik "Jalankan Analisis" berikutnya tanpa membuat job baru
   * - selamanya mengembalikan job lama. Job "fetch failed" milik pengguna
   * 20 Okt tampak macet gagal persis karena ini, walau worker dan layanan ML
   * sudah sehat. Sekarang: kunci otomatis hanya mencegah job kembar yang
   * masih antre/berjalan; job selesai atau gagal tidak lagi menghalangi
   * job baru (kunci disimpan NULL - MySQL mengizinkan banyak NULL di index
   * unik). Kunci EKSPLISIT dari pemanggil tetap ikut semantik idempotensi
   * klasik: kunci yang sama mengembalikan job yang sama apa pun statusnya.
   */
  async createJob(storeId: string, jobType: string, inputParams: any = {}, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.mlJobs.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
    } else {
      const active = await this.prisma.mlJobs.findFirst({
        where: { storeId, jobType, status: { in: ["queued", "running"] } },
      });
      if (active) return active;
    }
    return this.prisma.mlJobs.create({
      data: {
        storeId,
        jobType,
        status: "queued",
        inputParams: inputParams ?? {},
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  }

  async getJob(storeId: string, jobId: string) {
    const job = await this.prisma.mlJobs.findFirst({ where: { id: jobId, storeId } });
    if (!job) throw new NotFoundException("Job not found");
    return job;
  }

  async listJobs(storeId: string, status?: string, limit = 50, offset = 0) {
    const where: any = { storeId };
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.mlJobs.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      this.prisma.mlJobs.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async markRunning(jobId: string) {
    return this.prisma.mlJobs.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date() },
    });
  }

  async complete(jobId: string, result: any) {
    return this.prisma.mlJobs.update({
      where: { id: jobId },
      data: { status: "completed", result, completedAt: new Date(), errorMessage: null },
    });
  }

  async fail(jobId: string, errorMessage: string) {
    return this.prisma.mlJobs.update({
      where: { id: jobId },
      data: { status: "failed", errorMessage, completedAt: new Date() },
    });
  }
}
