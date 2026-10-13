import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

export type SalesSummary = {
  totalSales: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  avgItemsPerOrder: number;
  period: "7d" | "30d" | "ytd";
};

export type SalesTrend = {
  date: string;
  sales: number;
  orderCount: number;
  itemCount: number;
};

export type TopProduct = {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
};

export type CustomerSegment = {
  segment: string;
  customerCount: number;
  totalSpent: number;
  avgSpent: number;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesSummary(storeId: string, period: "7d" | "30d" | "ytd" = "30d"): Promise<SalesSummary> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        orderDate: { gte: startDate },
      },
      include: { items: true },
    });

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalItems = orders.reduce((sum, o) => sum + o.items.length, 0);

    return {
      totalSales,
      totalOrders,
      totalItems,
      avgOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
      avgItemsPerOrder: totalOrders > 0 ? totalItems / totalOrders : 0,
      period,
    };
  }

  async getSalesTrend(storeId: string, period: "7d" | "30d" | "90d" = "30d"): Promise<SalesTrend[]> {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await this.prisma.orders.findMany({
      where: {
        storeId,
        orderDate: { gte: startDate },
      },
      include: { items: true },
    });

    const grouped = new Map<string, { sales: number; orderCount: number; itemCount: number }>();
    for (const order of orders) {
      const date = order.orderDate.toISOString().split("T")[0];
      if (!grouped.has(date)) {
        grouped.set(date, { sales: 0, orderCount: 0, itemCount: 0 });
      }
      const entry = grouped.get(date)!;
      entry.sales += Number(order.total) || 0;
      entry.orderCount += 1;
      entry.itemCount += order.items.length;
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        sales: data.sales,
        orderCount: data.orderCount,
        itemCount: data.itemCount,
      }));
  }

  async getTopProducts(storeId: string, limit: number = 10): Promise<TopProduct[]> {
    const results = await this.prisma.orderItems.groupBy({
      by: ["productId"],
      where: {
        order: { storeId },
        productId: { not: null },
      },
      _sum: { qty: true, price: true },
      _count: { id: true },
      orderBy: { _sum: { price: "desc" } },
      take: limit,
    });

    const products = await this.prisma.products.findMany({
      where: {
        id: { in: results.map((r) => r.productId!).filter(Boolean) },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return results
      .filter((r) => r.productId)
      .map((r) => {
        const product = productMap.get(r.productId!);
        return {
          productId: r.productId!,
          sku: product?.sku || "",
          name: product?.name || "",
          totalQty: Number(r._sum.qty) || 0,
          totalRevenue: Number(r._sum.price) || 0,
          orderCount: r._count.id || 0,
        };
      });
  }

  async getCustomerSegments(storeId: string): Promise<CustomerSegment[]> {
    const customers = await this.prisma.customers.findMany({
      where: { storeId },
      include: {
        orders: {
          include: { items: true },
        },
      },
    });

    const segments = new Map<string, { customerCount: number; totalSpent: number }>();

    for (const customer of customers) {
      const spent = customer.orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const segment = customer.segment || "unclassified";

      if (!segments.has(segment)) {
        segments.set(segment, { customerCount: 0, totalSpent: 0 });
      }
      const entry = segments.get(segment)!;
      entry.customerCount += 1;
      entry.totalSpent += spent;
    }

    return Array.from(segments.entries()).map(([segment, data]) => ({
      segment,
      customerCount: data.customerCount,
      totalSpent: data.totalSpent,
      avgSpent: data.customerCount > 0 ? data.totalSpent / data.customerCount : 0,
    }));
  }

  async getInventoryStatus(storeId: string): Promise<any[]> {
    const products = await this.prisma.products.findMany({
      where: { storeId, deletedAt: null },
      include: {
        orderItems: {
          include: { order: true },
        },
        margins: true,
      },
    });

    const last90Days = new Date();
    last90Days.setDate(last90Days.getDate() - 90);

    return products.map((p) => {
      const itemsIn90d = p.orderItems.filter((oi) => oi.order.orderDate >= last90Days);
      const totalQtySold = itemsIn90d.reduce((sum, oi) => sum + Number(oi.qty), 0);
      const turnoverRate = itemsIn90d.length > 0 ? totalQtySold / 90 : 0; // avg qty per day

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        totalQtySold90d: totalQtySold,
        orderCount90d: itemsIn90d.length,
        turnoverRate,
        marginPercent: p.margins?.marginPercent || null,
      };
    });
  }
}
