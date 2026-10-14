import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { MlModule } from "../ml/ml.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminMlController } from "./admin-ml.controller.js";
import { AdminService } from "./admin.service.js";

@Module({
  imports: [PrismaModule, AuthModule, MlModule],
  controllers: [AdminController, AdminMlController],
  providers: [AdminService],
})
export class AdminModule {}
