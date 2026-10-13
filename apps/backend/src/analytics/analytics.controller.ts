import { Controller, Get, Param, Query } from "@nestjs/common";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { AnalyticsService } from "./analytics.service.js";

@Controller("stores/:storeId/analytics")
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get("summary")
  @StoreAccess()
  async getSummary(
    @Param("storeId") storeId: string,
    @Query("period") period: "7d" | "30d" | "ytd" = "30d",
  ) {
    return {
      data: await this.service.getSalesSummary(storeId, period),
    };
  }

  @Get("trend")
  @StoreAccess()
  async getTrend(
    @Param("storeId") storeId: string,
    @Query("period") period: "7d" | "30d" | "90d" = "30d",
  ) {
    return {
      data: await this.service.getSalesTrend(storeId, period),
    };
  }

  @Get("top-products")
  @StoreAccess()
  async getTopProducts(@Param("storeId") storeId: string, @Query("limit") limit: string = "10") {
    return {
      data: await this.service.getTopProducts(storeId, parseInt(limit, 10)),
    };
  }

  @Get("customer-segments")
  @StoreAccess()
  async getCustomerSegments(@Param("storeId") storeId: string) {
    return {
      data: await this.service.getCustomerSegments(storeId),
    };
  }

  @Get("inventory")
  @StoreAccess()
  async getInventory(@Param("storeId") storeId: string) {
    return {
      data: await this.service.getInventoryStatus(storeId),
    };
  }
}
