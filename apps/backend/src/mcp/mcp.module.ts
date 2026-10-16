import { BisnisInsightMcpController } from "./mcp.controller.js";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { JwtModule } from "@nestjs/jwt";
import { AppConfigModule } from "../config/config.module.js";
import { APP_CONFIG } from "../config/configuration.js";
import type { AppConfig } from "../config/configuration.js";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    AnalyticsModule,
    JobsModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
      }),
    }),
  ],
  controllers: [BisnisInsightMcpController],
  providers: [BisnisInsightMcpController],
  exports: [BisnisInsightMcpController],
})
export class McpModule {}
