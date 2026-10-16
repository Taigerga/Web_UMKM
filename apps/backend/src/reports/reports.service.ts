import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import ExcelJS from "exceljs";
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


  async generateSalesSummaryXlsx(
    storeId: string,
    period: "7d" | "30d" | "90d" = "30d",
  ): Promise<Buffer> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new Error("Store not found");

    const orders = await this.prisma.orders.findMany({
      where: { storeId, orderDate: { gte: startDate } },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("Ringkasan");
    summary.columns = [{ header: "Metrik", key: "metric", width: 34 }, { header: "Nilai", key: "value", width: 22 }];
    summary.getRow(1).font = { bold: true };

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrderCount = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);
    const avgOrderValue = totalOrderCount > 0 ? totalSales / totalOrderCount : 0;

    summary.addRows([
      { metric: "Toko", value: store.name },
      { metric: "Periode", value: period === "7d" ? "7 hari" : period === "30d" ? "30 hari" : "90 hari" },
      { metric: "Tanggal laporan", value: new Date().toLocaleDateString("id-ID") },
      { metric: "Total penjualan", value: totalSales },
      { metric: "Total pesanan", value: totalOrderCount },
      { metric: "Total item", value: totalItems },
      { metric: "Rata-rata per pesanan", value: avgOrderValue },
    ]);
    for (let row = 4; row <= 7; row++) summary.getCell(`B${row}`).numFmt = '#,##0';

    const channels = new Map<string, { sales: number; orders: number }>();
    for (const order of orders) {
      const key = order.channel || "unknown";
      const current = channels.get(key) ?? { sales: 0, orders: 0 };
      current.sales += Number(order.total) || 0;
      current.orders += 1;
      channels.set(key, current);
    }

    const salesByChannel = workbook.addWorksheet("Penjualan per Channel");
    salesByChannel.columns = [
      { header: "Channel", key: "channel", width: 24 },
      { header: "Total Penjualan", key: "sales", width: 18 },
      { header: "Jumlah Pesanan", key: "orders", width: 18 },
    ];
    salesByChannel.getRow(1).font = { bold: true };
    let rowOffset = 2;
    for (const [channel, value] of channels.entries()) {
      salesByChannel.addRow({ channel, sales: value.sales, orders: value.orders });
      salesByChannel.getCell(`B${rowOffset}`).numFmt = '#,##0';
      rowOffset += 1;
    }

    const productSheet = workbook.addWorksheet("Penjualan per Produk");
    productSheet.columns = [
      { header: "Produk", key: "name", width: 28 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Qty Terjual", key: "qty", width: 12 },
      { header: "Total Penjualan", key: "sales", width: 18 },
    ];
    productSheet.getRow(1).font = { bold: true };
    const productTotals = new Map<string, { name: string; sku: string; qty: number; sales: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!item.productId) continue;
        const current = productTotals.get(item.productId) ?? {
          name: item.product?.name || "-",
          sku: item.product?.sku || "-",
          qty: 0,
          sales: 0,
        };
        current.qty += Number(item.qty) || 0;
        current.sales += Number(item.qty) * Number(item.price);
        productTotals.set(item.productId, current);
      }
    }
    for (const value of productTotals.values()) {
      const row = productSheet.addRow({ name: value.name, sku: value.sku, qty: value.qty, sales: value.sales });
      row.getCell(3).numFmt = '#,##0';
      row.getCell(4).numFmt = '#,##0';
    }

    const recentOrders = workbook.addWorksheet("Pesanan");
    recentOrders.columns = [
      { header: "Tanggal", key: "date", width: 14 },
      { header: "Pesanan ID", key: "id", width: 28 },
      { header: "Pelanggan", key: "customer", width: 24 },
      { header: "Channel", key: "channel", width: 14 },
      { header: "Item", key: "items", width: 8 },
      { header: "Total", key: "total", width: 16 },
    ];
    recentOrders.getRow(1).font = { bold: true };
    for (const order of orders.slice(-25).reverse()) {
      const row = recentOrders.addRow({
        date: order.orderDate.toLocaleDateString("id-ID"),
        id: order.id,
        customer: order.customer?.name || "-",
        channel: order.channel || "-",
        items: order.items.length,
        total: Number(order.total) || 0,
      });
      row.getCell(6).numFmt = '#,##0';
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateSalesSummaryPdf(storeId: string, period: "7d" | "30d" | "90d" = "30d"): Promise<Buffer> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new Error("Store not found");

    const orders = await this.prisma.orders.findMany({
      where: { storeId, orderDate: { gte: startDate } },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "asc" },
    });

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);
    const pdfModule: any = await import("pdfkit");
    const PDFDocument = pdfModule.default;

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text(`Laporan Penjualan - ${store.name}`, { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).text(`Periode: ${period === "7d" ? "7 hari" : period === "30d" ? "30 hari" : "90 hari"}`, { align: "center" });
      doc.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
      doc.moveDown(1);

      doc.fontSize(12).text("Ringkasan", { underline: true });
      doc.fontSize(10);
      doc.text(`Total penjualan: Rp ${totalSales.toLocaleString("id-ID")}`);
      doc.text(`Total pesanan: ${totalOrders}`);
      doc.text(`Total item: ${totalItems}`);
      doc.text(`Rata-rata per pesanan: Rp ${totalOrders > 0 ? (totalSales / totalOrders).toLocaleString("id-ID") : "0"}`);
      doc.moveDown(1);

      doc.fontSize(12).text("10 Pesanan Terakhir", { underline: true });
      doc.moveDown(0.3);

      const rows = ["Tanggal", "Pelanggan", "Channel", "Item", "Total"].map((header, index) => ({
        header,
        x: [50, 120, 260, 360, 430][index],
      }));
      doc.font("Helvetica-Bold").fontSize(9);
      for (const row of rows) doc.text(row.header, row.x, doc.y, { continued: true, width: 0 });
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(9);

      const recent = orders.slice(-10).reverse();
      for (const order of recent) {
        const y = doc.y;
        doc.text(order.orderDate.toLocaleDateString("id-ID"), 50, y, { width: 65 });
        doc.text(order.customer?.name || "-", 120, y, { width: 135 });
        doc.text(order.channel || "-", 260, y, { width: 95 });
        doc.text(String(order.items.length), 360, y, { width: 60 });
        doc.text(`Rp ${Number(order.total).toLocaleString("id-ID")}`, 430, y, { width: 120 });
        doc.moveDown(0.2);
      }

      doc.end();
    });
  }

  async generateDetailedXlsx(storeId: string): Promise<Buffer> {
    const store = await this.prisma.stores.findFirst({ where: { id: storeId } });
    if (!store) throw new Error("Store not found");

    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    const orders = await this.prisma.orders.findMany({
      where: { storeId, orderDate: { gte: last90Days } },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { orderDate: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const orderSheet = workbook.addWorksheet("Pesanan");
    orderSheet.columns = [
      { header: "Tanggal", key: "date", width: 13 },
      { header: "Pesanan ID", key: "id", width: 28 },
      { header: "Pelanggan", key: "customer", width: 24 },
      { header: "Channel", key: "channel", width: 14 },
      { header: "Total", key: "total", width: 16 },
    ];
    orderSheet.getRow(1).font = { bold: true };
    for (const order of orders) {
      const row = orderSheet.addRow({
        date: order.orderDate.toLocaleDateString("id-ID"),
        id: order.id,
        customer: order.customer?.name || "-",
        channel: order.channel || "-",
        total: Number(order.total) || 0,
      });
      row.getCell(5).numFmt = '#,##0';
    }

    const itemSheet = workbook.addWorksheet("Item Pesanan");
    itemSheet.columns = [
      { header: "Tanggal", key: "date", width: 13 },
      { header: "Pesanan ID", key: "orderId", width: 28 },
      { header: "Produk", key: "product", width: 28 },
      { header: "SKU", key: "sku", width: 18 },
      { header: "Qty", key: "qty", width: 10 },
      { header: "Harga", key: "price", width: 12 },
      { header: "Subtotal", key: "subtotal", width: 16 },
    ];
    itemSheet.getRow(1).font = { bold: true };
    for (const order of orders) {
      for (const item of order.items) {
        const row = itemSheet.addRow({
          date: order.orderDate.toLocaleDateString("id-ID"),
          orderId: order.id,
          product: item.product?.name || "-",
          sku: item.product?.sku || "-",
          qty: Number(item.qty),
          price: Number(item.price),
          subtotal: Number(item.qty) * Number(item.price),
        });
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0';
        row.getCell(7).numFmt = '#,##0';
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateForecastPdf(storeId: string, productId: string): Promise<Buffer> {
    const product = await this.prisma.products.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) throw new Error("Product not found");

    const forecasts = await this.prisma.forecastResults.findMany({
      where: { productId, forecastDate: { gte: new Date() } },
      orderBy: { forecastDate: "asc" },
      take: 30,
    });

    const pdfModule: any = await import("pdfkit");
    const PDFDocument = pdfModule.default;

    return await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4", layout: "landscape" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(16).text(`Forecast Penjualan - ${product.name}`, { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).text(`SKU: ${product.sku}  |  Periode: 30 hari ke depan  |  Tanggal: ${new Date().toLocaleDateString("id-ID")}`, { align: "center" });
      doc.moveDown(1);

      doc.font("Helvetica-Bold").fontSize(9);
      const headers = ["Tanggal", "Prediksi", "Confidence", "Lower", "Upper"];
      const x = [50, 170, 290, 410, 530];
      headers.forEach((header, i) => doc.text(header, x[i], doc.y, { continued: true, width: 0 }));
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(9);

      for (const forecast of forecasts) {
        const y = doc.y;
        doc.text(forecast.forecastDate.toLocaleDateString("id-ID"), 50, y, { width: 115 });
        doc.text(Number(forecast.predictedQty).toFixed(2), 170, y, { width: 115 });
        doc.text(`${(Number(forecast.confidence) * 100).toFixed(0)}%`, 290, y, { width: 115 });
        doc.text(Number(forecast.lowerBound || 0).toFixed(2), 410, y, { width: 115 });
        doc.text(Number(forecast.upperBound || 0).toFixed(2), 530, y, { width: 115 });
        doc.moveDown(0.2);
      }

      doc.end();
    });
  }
}
