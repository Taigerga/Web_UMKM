import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../database/prisma.module.js";
import { ForecastModule } from "../forecast/forecast.module.js";
import { CacheModule } from "../cache/cache.module.js";
import { JobsService } from "./jobs.service.js";

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, ForecastModule, CacheModule],
  providers: [JobsService],
})
export class JobsModule {}
