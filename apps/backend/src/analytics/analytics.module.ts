import { Module } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service.js";
import { AnalyticsController } from "./analytics.controller.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { CacheModule } from "../cache/cache.module.js";

@Module({
  imports: [JobsModule, CacheModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
