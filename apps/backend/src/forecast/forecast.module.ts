import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { ForecastService } from "./forecast.service.js";
import { ForecastController } from "./forecast.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [ForecastController],
  providers: [ForecastService],
  exports: [ForecastService],
})
export class ForecastModule {}
