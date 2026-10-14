// src/jobs/ml-job.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class MlJobService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(storeId: string, jobType: string, inputParams: any = {}, idempotencyKey?: string) {
    const key = idempotencyKey ?? `${storeId}:${jobType}:${JSON.stringify(inputParams ?? {})}`;
    const existing = await this.prisma.mlJobs.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
    return this.prisma.mlJobs.create({
      data: {
        storeId,
        jobType,
        status: "queued",
        inputParams: inputParams ?? {},
        idempotencyKey: key,
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
