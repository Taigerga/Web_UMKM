import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { StoreAccess } from "../common/decorators/store-access.decorator.js";
import { ReportsService } from "./reports.service.js";

@Controller("stores/:storeId/reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get("sales-summary")
  @StoreAccess()
  async getSalesSummary(
    @Param("storeId") storeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateSalesSummaryPDF(storeId);
    res.set({
      "Content-Type": "text/html",
      "Content-Disposition": `attachment; filename="sales_report_${new Date().toISOString().split("T")[0]}.html"`,
    });
    res.send(buffer);
  }

  @Get("detailed")
  @StoreAccess()
  async getDetailed(
    @Param("storeId") storeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateDetailedExcel(storeId);
    res.set({
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="detailed_report_${new Date().toISOString().split("T")[0]}.csv"`,
    });
    res.send(buffer);
  }

  @Get("forecast/:productId")
  @StoreAccess()
  async getForecast(
    @Param("storeId") storeId: string,
    @Param("productId") productId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.generateForecastPDF(storeId, productId);
    res.set({
      "Content-Type": "text/html",
      "Content-Disposition": `attachment; filename="forecast_${productId}_${new Date().toISOString().split("T")[0]}.html"`,
    });
    res.send(buffer);
  }
}
