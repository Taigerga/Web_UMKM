import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { Decimal } from "@prisma/client-runtime-utils";

export type Forecast = {
  date: string;
  predictedQty: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
};

@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute forecast untuk semua products di store.
   * Menggunakan exponential smoothing.
   */
  async computeForecast(storeId: string): Promise<{ productCount: number; forecastsCreated: number }> {
    const products = await this.prisma.products.findMany({
      where: { storeId, deletedAt: null },
    });

    let forecastsCreated = 0;

    for (const product of products) {
      const forecasts = await this.forecastProduct(storeId, product.id);
      if (forecasts && forecasts.length > 0) {
        forecastsCreated += forecasts.length;
      }
    }

    return { productCount: products.length, forecastsCreated };
  }

  /**
   * Forecast single product untuk next 30 hari.
   */
  async forecastProduct(storeId: string, productId: string): Promise<Forecast[]> {
    // Get last 90 days of order items
    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    const orderItems = await this.prisma.orderItems.findMany({
      where: {
        productId,
        order: {
          storeId,
          orderDate: { gte: last90Days },
        },
      },
      include: { order: true },
      orderBy: { order: { orderDate: "asc" } },
    });

    if (orderItems.length === 0) {
      return [];
    }

    // Aggregate by day
    const dailyQty = new Map<string, number>();
    for (const item of orderItems) {
      const date = item.order.orderDate.toISOString().split("T")[0];
      dailyQty.set(date, (dailyQty.get(date) || 0) + Number(item.qty));
    }

    // Create time series (fill gaps with 0)
    const startDate = last90Days;
    const timeSeries: number[] = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      timeSeries.push(dailyQty.get(dateStr) || 0);
    }

    // Simple exponential smoothing with trend
    const predictions = this.exponentialSmoothing(timeSeries, 30);

    // Store in database
    const forecastRecords: Forecast[] = [];
    const now = new Date();

    for (let i = 0; i < predictions.length; i++) {
      const forecastDate = new Date(now);
      forecastDate.setDate(forecastDate.getDate() + i + 1);

      const pred = predictions[i];
      const forecastRecord: Forecast = {
        date: forecastDate.toISOString().split("T")[0],
        predictedQty: Math.max(0, Math.round(pred.value * 100) / 100),
        confidence: 0.95,
        lowerBound: Math.max(0, Math.round((pred.value * 0.8) * 100) / 100),
        upperBound: Math.round((pred.value * 1.2) * 100) / 100,
      };

      await this.prisma.forecastResults.upsert({
        where: {
          productId_forecastDate: {
            productId,
            forecastDate: new Date(forecastRecord.date),
          },
        },
        create: {
          storeId,
          productId,
          forecastDate: new Date(forecastRecord.date),
          predictedQty: new Decimal(forecastRecord.predictedQty),
          confidence: new Decimal(forecastRecord.confidence),
          lowerBound: new Decimal(forecastRecord.lowerBound),
          upperBound: new Decimal(forecastRecord.upperBound),
        },
        update: {
          predictedQty: new Decimal(forecastRecord.predictedQty),
          confidence: new Decimal(forecastRecord.confidence),
          lowerBound: new Decimal(forecastRecord.lowerBound),
          upperBound: new Decimal(forecastRecord.upperBound),
        },
      });

      forecastRecords.push(forecastRecord);
    }

    return forecastRecords;
  }

  /**
   * Get forecast untuk product.
   */
  async getForecast(storeId: string, productId: string): Promise<Forecast[]> {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    const results = await this.prisma.forecastResults.findMany({
      where: {
        productId,
        forecastDate: {
          gte: new Date(),
        },
      },
      orderBy: { forecastDate: "asc" },
      take: 30,
    });

    return results.map((r) => ({
      date: r.forecastDate.toISOString().split("T")[0],
      predictedQty: Number(r.predictedQty),
      confidence: Number(r.confidence),
      lowerBound: Number(r.lowerBound || 0),
      upperBound: Number(r.upperBound || 0),
    }));
  }

  /**
   * Simple exponential smoothing dengan trend (Holt's method).
   * Input: array of historical quantities
   * Output: array of predictions
   */
  private exponentialSmoothing(
    timeSeries: number[],
    forecastSteps: number,
    alpha: number = 0.3,
    beta: number = 0.2,
  ): Array<{ value: number }> {
    if (timeSeries.length < 2) {
      // Not enough data, return average
      const avg = timeSeries[0] || 0;
      return Array(forecastSteps).fill({ value: avg });
    }

    // Initialize level and trend
    let level = timeSeries[0];
    let trend = (timeSeries[1] - timeSeries[0]) / 1;

    // Fit the model
    for (let i = 1; i < timeSeries.length; i++) {
      const y = timeSeries[i];
      const prevLevel = level;
      level = alpha * y + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    // Generate forecasts
    const forecasts: Array<{ value: number }> = [];
    for (let i = 1; i <= forecastSteps; i++) {
      forecasts.push({ value: Math.max(0, level + i * trend) });
    }

    return forecasts;
  }
}
