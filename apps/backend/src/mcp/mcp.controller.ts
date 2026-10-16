import { Injectable } from "@nestjs/common";
import { McpController, Tool } from "@rekog/mcp-nest";
import { JwtService } from "@nestjs/jwt";
import { z } from "zod";
import { PrismaService } from "../database/prisma.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { MlJobService } from "../jobs/ml-job.service.js";
import { AppConfig } from "../config/configuration.js";

const accessTokenField = z.string().min(1).describe("JWT access token user");
const storeScopedParams = z.object({
  accessToken: accessTokenField,
  storeId: z.string().min(1),
});

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
    name: "list_stores",
    description: "Daftar toko yang dapat diakses user (tenant-safe).",
    parameters: z.object({ accessToken: accessTokenField }),
  })
  async listStores({ accessToken }: { accessToken: string }) {
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
    description: "Ringkasan penjualan terfilter storeId (tenant-safe).",
    parameters: storeScopedParams.extend({ period: z.enum(["7d", "30d", "90d"]).optional() }),
  })
  async getSalesSummary(input: { accessToken: string; storeId: string; period?: "7d" | "30d" | "90d" }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const result = await this.analytics.getProfitability(input.storeId);
    return { content: [{ type: "json" as const, json: result }] };
  }

  @Tool({
    name: "get_profitability",
    description: "Profitability by product/category; data scoped to storeId.",
    parameters: storeScopedParams,
  })
  async getProfitability(input: { accessToken: string; storeId: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const result = await this.analytics.getProfitability(input.storeId);
    return { content: [{ type: "json" as const, json: result }] };
  }

  @Tool({
    name: "queue_analysis_job",
    description: "Antre pekerjaan ML per store. Job tidak boleh lintas tenant.",
    parameters: storeScopedParams.extend({ jobType: z.enum(["forecast", "segmentation", "market-basket", "churn", "anomaly"]) }),
  })
  async queueAnalysisJob(input: { accessToken: string; storeId: string; jobType: string }) {
    const user = await this.resolveUser(input.accessToken);
    await this.ensureStoreAccess(user.sub, input.storeId);
    const job = await this.mlJobs.createJob(input.storeId, input.jobType, {}, `mcp:${user.sub}:${Date.now()}`);
    return { content: [{ type: "json" as const, json: job }] };
  }
}
