import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator.js";
import { Role } from "../common/types/prisma-enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { MlClientService } from "../ml/ml-client.service.js";

@ApiBearerAuth("bearer")
@ApiTags("admin-ml")
@Controller("admin")
export class AdminMlController {
  constructor(private readonly prisma: PrismaService, private readonly mlClient: MlClientService) {}

  @Get("ml-jobs")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Monitor semua ML job lintas toko (ADMIN)" })
  async listMlJobs(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    const take = limit ? Number(limit) : 50;
    const skip = offset ? Number(offset) : 0;
    const [items, total] = await Promise.all([
      this.prisma.mlJobs.findMany({ where, orderBy: { createdAt: "desc" }, take, skip, select: { id: true, storeId: true, jobType: true, status: true, createdAt: true, startedAt: true, completedAt: true, errorMessage: true } }),
      this.prisma.mlJobs.count({ where }),
    ]);
    return { data: items, meta: { total, limit: take, offset: skip } };
  }

  @Get("ml-models")
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Status kesehatan ML service dan model (ADMIN)" })
  async mlModels() {
    let health: any = null;
    try {
      health = await this.mlClient.health();
    } catch (e) {
      health = { status: "unavailable", error: e instanceof Error ? e.message : String(e) };
    }
    return { data: health };
  }
}
