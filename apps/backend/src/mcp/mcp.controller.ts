import { Injectable } from "@nestjs/common";
import { McpController, Tool } from "@rekog/mcp-nest";
import { JwtService } from "@nestjs/jwt";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { MlJobService } from "../jobs/ml-job.service.js";

const accessTokenField = z.string().min(1).describe("JWT access token user");
const storeScopedParams = z.object({
  accessToken: accessTokenField,
  storeId: z.string().min(1),
});

/**
 * MCP tools BisnisInsight.
 *
 * Setiap tool WAJIB memvalidasi `accessToken` dan keanggotaan `storeId`
 * sebelum menyentuh data. Tidak ada tool yang menerima storeId tanpa
 * pembuktian user - itu syarat gate "MCP tidak boleh bocor lintas-toko".
 */
@McpController({ server: "bisnis-insight" })
@Injectable()
export class BisnisInsightMcpController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly mlJobs: MlJobService,
  ) {}

  private async resolveUser(accessToken: string) {
    const payload = await this.jwt.verifyAsync(accessToken);
    if (!payload?.sub) throw new Error("Access token invalid");
    return payload as { sub: string; email?: string; role?: string };
  }

  private async ensureStoreAccess(userId: string, storeId: string): Promise<void> {
    const membership = await this.prisma.storeMembers.findFirst({ where: { userId, storeId } });
    if (!membership) throw new Error("Store access denied (tenant isolation)");
  }

  @Tool({
    name: "list_my_stores",
    description: "Daftar toko yang dapat diakses user yang login (tenant-safe).",
    parameters: z.object({ accessToken: accessTokenField }),
  })
  async listMyStores({ accessToken }: { accessToken: string }) {
    const user = await this.resolveUser(accessToken);
    const memberships = await this.prisma.storeMembers.findMany({
      where: { userId: user.sub },
      include: { store: true },
      orderBy: { joinedAt: "asc" },
    });
    return {
      content: [
        {
          type: "json" as const,
          json: memberships.map((m) => ({
            storeId: m.store.id,
            name: m.store.name,
            city: m.store.city,
            role: m.role,
          })),
        },
      ],
    };
  }

  @Tool({
    name: "get_sales_summary",
    description: "Ringkasan penjualan dan margin untuk storeId milik user.",
    parameters: storeScopedParams,
  })
  async getSalesSummary(input: { accessToken: string; storeId: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const result = await this.analytics.getProfitability(input.storeId);
    return { content: [{ type: "json" as const, json: result }] };
  }

  @Tool({
    name: "get_top_products",
    description: "Produk terlaris menurut omzet, scoped ke storeId.",
    parameters: storeScopedParams.extend({ limit: z.number().int().min(1).max(100).optional() }),
  })
  async getTopProducts(input: { accessToken: string; storeId: string; limit?: number }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const products = await this.analytics.getProductPerformance(input.storeId, input.limit ?? 20);
    return { content: [{ type: "json" as const, json: products }] };
  }

  @Tool({
    name: "get_customer_segments",
    description: "Distribusi pelanggan per segmen dari data pelanggan store.",
    parameters: storeScopedParams,
  })
  async getCustomerSegments(input: { accessToken: string; storeId: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const grouped = await this.prisma.customers.groupBy({
      by: ["segment"],
      where: { storeId: input.storeId },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    return {
      content: [
        {
          type: "json" as const,
          json: {
            total,
            segments: grouped.map((row) => ({
              segment: row.segment ?? "Unsegmented",
              count: row._count._all,
              pct: total > 0 ? Number(((row._count._all / total) * 100).toFixed(1)) : 0,
            })),
          },
        },
      ],
    };
  }

  @Tool({
    name: "list_at_risk_customers",
    description: "Pelanggan berisiko churn berdasarkan recency (tanpa belanja >= 90 hari).",
    parameters: storeScopedParams.extend({ olderThanDays: z.number().int().min(1).max(3650).optional() }),
  })
  async listAtRiskCustomers(input: { accessToken: string; storeId: string; olderThanDays?: number }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const threshold = input.olderThanDays ?? 90;
    const rows = await this.analytics.getCustomerValue(input.storeId, 500);
    const atRisk = rows
      .filter((row: any) => (row.recencyDays ?? 0) >= threshold)
      .sort((a: any, b: any) => b.recencyDays - a.recencyDays)
      .slice(0, 100);
    return { content: [{ type: "json" as const, json: { thresholdDays: threshold, customers: atRisk } }] };
  }

  @Tool({
    name: "get_anomalies",
    description: "Hasil deteksi anomali terakhir untuk storeId.",
    parameters: storeScopedParams,
  })
  async getAnomalies(input: { accessToken: string; storeId: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const job = await this.prisma.mlJobs.findFirst({
      where: { storeId: input.storeId, jobType: "anomaly", status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    return {
      content: [
        {
          type: "json" as const,
          json: job?.result ?? { status: "not_available", message: "Belum ada job anomali yang selesai untuk toko ini." },
        },
      ],
    };
  }

  @Tool({
    name: "get_forecast",
    description: "Hasil forecast terakhir untuk storeId.",
    parameters: storeScopedParams,
  })
  async getForecast(input: { accessToken: string; storeId: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const job = await this.prisma.mlJobs.findFirst({
      where: { storeId: input.storeId, jobType: "forecast", status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    if (job?.result) return { content: [{ type: "json" as const, json: job.result }] };
    const rows = await this.prisma.forecastResults.findMany({
      where: { storeId: input.storeId, forecastDate: { gte: new Date() } },
      orderBy: { forecastDate: "asc" },
      take: 90,
    });
    return {
      content: [
        {
          type: "json" as const,
          json: rows.length ? rows : { status: "not_available", message: "Belum ada forecast tersimpan." },
        },
      ],
    };
  }

  @Tool({
    name: "run_analysis",
    description: "Antre pekerjaan ML per toko. Job selalu terikat storeId user.",
    parameters: storeScopedParams.extend({
      jobType: z.enum(["forecast", "segmentation", "market-basket", "churn", "anomaly"]),
    }),
  })
  async runAnalysis(input: { accessToken: string; storeId: string; jobType: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const job = await this.mlJobs.createJob(input.storeId, input.jobType, {}, `mcp:${user.sub}:${Date.now()}`);
    return { content: [{ type: "json" as const, json: job }] };
  }
}
