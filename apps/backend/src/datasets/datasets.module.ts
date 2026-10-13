import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { StoresModule } from "../stores/stores.module.js";
import { DatasetsController } from "./datasets.controller.js";
import { DatasetsService } from "./datasets.service.js";

@Module({
  imports: [PrismaModule, StoresModule],
  controllers: [DatasetsController],
  providers: [DatasetsService],
  exports: [DatasetsService],
})
export class DatasetsModule {}
