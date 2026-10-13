import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../database/prisma.service.js";
import { ForecastService } from "../forecast/forecast.service.js";
import { RedisService } from "../cache/redis.service.js";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forecast: ForecastService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Nightly forecast computation (2 AM UTC)
   */
  @Cron("0 2 * * *")
  async computeNightlyForecasts() {
    this.logger.log("Starting nightly forecast computation...");
    const startTime = Date.now();

    try {
      const stores = await this.prisma.stores.findMany({
        where: { status: "ACTIVE" },
      });

      let totalStores = 0;
      let totalForecasts = 0;

      for (const store of stores) {
        try {
          const result = await this.forecast.computeForecast(store.id);
          totalStores += 1;
          totalForecasts += result.forecastsCreated;
          
          // Invalidate cache for this store
          await this.redis.invalidateStoreMetrics(store.id);
          
          this.logger.debug(`Forecast computed for store ${store.id}: ${result.forecastsCreated} forecasts`);
        } catch (error) {
          this.logger.error(`Failed to compute forecast for store ${store.id}:`, error);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(
        `Nightly forecast completed in ${duration}s: ${totalStores} stores, ${totalForecasts} forecasts`,
      );
    } catch (error) {
      this.logger.error("Nightly forecast job failed:", error);
    }
  }

  /**
   * Cleanup old forecast results (monthly, 1st day at 3 AM)
   */
  @Cron("0 3 1 * *")
  async cleanupOldForecasts() {
    this.logger.log("Starting old forecast cleanup...");

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60); // Keep last 60 days

      const deleted = await this.prisma.forecastResults.deleteMany({
        where: {
          forecastDate: { lt: cutoffDate },
        },
      });

      this.logger.log(`Cleaned up ${deleted.count} old forecast records`);
    } catch (error) {
      this.logger.error("Forecast cleanup job failed:", error);
    }
  }
}
