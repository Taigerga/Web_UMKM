import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { ForecastModule } from "../forecast/forecast.module.js";
import { CacheModule } from "../cache/cache.module.js";
import { MlModule } from "../ml/ml.module.js";
import { JobsService } from "./jobs.service.js";
import { MlJobService } from "./ml-job.service.js";
import { MlJobWorkerService } from "./ml-job.worker.service.js";

@Module({
  imports: [PrismaModule, ForecastModule, CacheModule, MlModule],
  providers: [JobsService, MlJobService, MlJobWorkerService],
  exports: [MlJobService, MlJobWorkerService],
})
export class JobsModule {}
