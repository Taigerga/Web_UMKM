// src/jobs/jobs.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { ForecastService } from "../forecast/forecast.service.js";
import { RedisService } from "../cache/redis.service.js";

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private nightlyTimer: NodeJS.Timeout | null = null;
  private monthlyTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecast: ForecastService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.scheduleNightly();
    this.scheduleMonthlyCleanup();
  }

  onModuleDestroy() {
    if (this.nightlyTimer) clearTimeout(this.nightlyTimer);
    if (this.monthlyTimer) clearTimeout(this.monthlyTimer);
  }

  private scheduleNightly() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    this.nightlyTimer = setTimeout(() => {
      void this.computeNightlyForecasts().finally(() => this.scheduleNightly());
    }, delay);
    this.logger.log(`Next nightly forecast at ${next.toISOString()}`);
  }

  private scheduleMonthlyCleanup() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 3, 0, 0));
    const delay = next.getTime() - now.getTime();
    this.monthlyTimer = setTimeout(() => {
      void this.cleanupOldForecasts().finally(() => this.scheduleMonthlyCleanup());
    }, delay);
    this.logger.log(`Next forecast cleanup at ${next.toISOString()}`);
  }

  async computeNightlyForecasts() {
    this.logger.log("Starting nightly forecast computation...");
    const startTime = Date.now();
    try {
      const stores = await this.prisma.stores.findMany({ where: { status: "ACTIVE" } });
      let totalStores = 0;
      let totalForecasts = 0;
      for (const store of stores) {
        try {
          const result = await this.forecast.computeForecast(store.id);
          totalStores += 1;
          totalForecasts += result.forecastsCreated;
          await this.redis.invalidateStoreMetrics(store.id);
        } catch (error) {
          this.logger.error(`Failed to compute forecast for store ${store.id}:`, error);
        }
      }
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`Nightly forecast completed in ${duration}s: ${totalStores} stores, ${totalForecasts} forecasts`);
    } catch (error) {
      this.logger.error("Nightly forecast job failed:", error);
    }
  }

  async cleanupOldForecasts() {
    this.logger.log("Starting old forecast cleanup...");
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);
      const deleted = await this.prisma.forecastResults.deleteMany({ where: { forecastDate: { lt: cutoffDate } } });
      this.logger.log(`Cleaned up ${deleted.count} old forecast records`);
    } catch (error) {
      this.logger.error("Forecast cleanup job failed:", error);
    }
  }
}
