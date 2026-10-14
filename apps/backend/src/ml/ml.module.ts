// src/ml/ml.module.ts
import { Module } from "@nestjs/common";
import { MlClientService } from "./ml-client.service.js";

@Module({
  providers: [MlClientService],
  exports: [MlClientService],
})
export class MlModule {}
