import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { ReportsService } from "./reports.service.js";
import { ReportsController } from "./reports.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
