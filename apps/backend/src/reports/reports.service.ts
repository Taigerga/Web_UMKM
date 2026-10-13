import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import * as fs from "node:fs";
import * as path from "node:path";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateSalesSummaryPDF(storeId: string, period: "7d" | "30d" | "90d" = "30d"): Promise<Buffer> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new Error("Store not found");

    const orders = await this.prisma.orders.findMany({
      where: { storeId, orderDate: { gte: startDate } },
      include: { items: true, customer: true },
    });

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);

    // Simple text-based PDF report (using Node.js buffer)
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sales Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .summary { background-color: #e8f4f8; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Laporan Penjualan - ${store.name}</h1>
  <p>Periode: ${period === "7d" ? "7 hari" : period === "30d" ? "30 hari" : "90 hari"}</p>
  <p>Tanggal: ${new Date().toLocaleDateString("id-ID")}</p>
  
  <div class="summary">
    <h2>Ringkasan</h2>
    <p><strong>Total Penjualan:</strong> Rp ${(totalSales / 1_000_000).toFixed(2)}jt</p>
    <p><strong>Total Pesanan:</strong> ${totalOrders}</p>
    <p><strong>Total Item:</strong> ${totalItems}</p>
    <p><strong>Rata-rata per Pesanan:</strong> Rp ${totalOrders > 0 ? (totalSales / totalOrders / 1_000_000).toFixed(2) : 0}jt</p>
  </div>

  <h2>Detail Pesanan (10 Terakhir)</h2>
  <table>
    <tr>
      <th>Tanggal</th>
      <th>Pelanggan</th>
      <th>Channel</th>
      <th>Total</th>
      <th>Item</th>
    </tr>
    ${orders
      .slice(-10)
      .reverse()
      .map(
        (o) => `
    <tr>
      <td>${o.orderDate.toLocaleDateString("id-ID")}</td>
      <td>${o.customer?.name || "-"}</td>
      <td>${o.channel || "-"}</td>
      <td>Rp ${(Number(o.total) / 1_000_000).toFixed(2)}jt</td>
      <td>${o.items.length}</td>
    </tr>
    `,
      )
      .join("")}
  </table>
</body>
</html>
    `;

    // Return HTML as buffer (browser will convert to PDF)
    return Buffer.from(html, "utf-8");
  }

  async generateDetailedExcel(storeId: string): Promise<Buffer> {
    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new Error("Store not found");

    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    const orders = await this.prisma.orders.findMany({
      where: { storeId, orderDate: { gte: last90Days } },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "desc" },
    });

    // CSV format (can be opened in Excel)
    let csv = "Tanggal,Pesanan ID,Pelanggan,Channel,Produk,SKU,Qty,Harga,Subtotal,Total Pesanan\n";

    for (const order of orders) {
      for (const item of order.items) {
        csv += [
          order.orderDate.toLocaleDateString("id-ID"),
          order.id,
          order.customer?.name || "-",
          order.channel || "-",
          item.product?.name || "-",
          item.product?.sku || "-",
          item.qty,
          item.price,
          Number(item.qty) * Number(item.price),
          Number(order.total),
        ]
          .map((v) => `"${v}"`)
          .join(",");
        csv += "\n";
      }
    }

    return Buffer.from(csv, "utf-8");
  }

  async generateForecastPDF(storeId: string, productId: string): Promise<Buffer> {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    const forecasts = await this.prisma.forecastResults.findMany({
      where: { productId, forecastDate: { gte: new Date() } },
      orderBy: { forecastDate: "asc" },
      take: 30,
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Forecast Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Forecast Penjualan - ${product.name}</h1>
  <p>SKU: ${product.sku}</p>
  <p>Periode: 30 hari ke depan</p>
  <p>Tanggal: ${new Date().toLocaleDateString("id-ID")}</p>

  <table>
    <tr>
      <th>Tanggal</th>
      <th>Prediksi (Qty)</th>
      <th>Confidence</th>
      <th>Lower Bound</th>
      <th>Upper Bound</th>
    </tr>
    ${forecasts
      .map(
        (f) => `
    <tr>
      <td>${f.forecastDate.toLocaleDateString("id-ID")}</td>
      <td>${Number(f.predictedQty).toFixed(2)}</td>
      <td>${(Number(f.confidence) * 100).toFixed(0)}%</td>
      <td>${Number(f.lowerBound || 0).toFixed(2)}</td>
      <td>${Number(f.upperBound || 0).toFixed(2)}</td>
    </tr>
    `,
      )
      .join("")}
  </table>
</body>
</html>
    `;

    return Buffer.from(html, "utf-8");
  }
}
