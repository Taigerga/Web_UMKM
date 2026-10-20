// src/ml/ml-data.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

/**
 * Pengumpul input inferensi ML per-toko (Promt §13.2).
 *
 * ## Kenapa data dikirim, bukan cukup memanggil artefak global
 *
 * Artefak global dilatih dari dataset penelitian. Kalau job per-toko hanya
 * memanggil artefak itu, hasil `forecasts`/`segments` di dashboard toko A
 * sebenarnya diperhitungkan dari toko lain - hasil ML per toko harus berasal
 * dari deret penjualan toko itu sendiri.
 *
 * Semua query di sini ter-scope `storeId` (dipanggil dari worker yang sudah
 * yakin job itu milik toko), dan mengembalikan payload siap-kirim ke endpoint
 * `POST /<jenis>/run` di Python service.
 */

type DailySeriesInput = {
  series: { date: string; sales: number }[];
};

type SegmentationInput = {
  customers: { customer_id: string; recency: number; frequency: number; monetary: number }[];
};

type BasketInput = {
  transactions: { order_id: string; product: string }[];
};

type ChurnInput = {
  customers: { customer_id: string; recency: number; frequency: number; monetary: number }[];
};

@Injectable()
export class MlDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lihat `orders` toko (tanggal + total) sekali, lalu agregat di memori. */
  private async ordersFor(storeId: string) {
    return await this.prisma.orders.findMany({
      where: { storeId },
      select: { id: true, orderDate: true, total: true, customerId: true },
    });
  }

  /** Deret harian padat: tanggal tanpa penjualan tetap muncul dengan 0. */
  private static denseDailySeries(
    orders: { orderDate: Date; total: unknown }[],
  ): DailySeriesInput["series"] {
    if (orders.length === 0) return [];
    // Normalisasi ke tengah malam UTC supaya perulangan hari tidak melompat
    // karena jam transaksi (terjadi skip hari terakhir bila tidak dinormalkan).
    const utcMidnight = (d: Date) => {
      const copy = new Date(d.getTime());
      copy.setUTCHours(0, 0, 0, 0);
      return copy;
    };
    const perDay = new Map<string, number>();
    let cursor = orders[0].orderDate;
    let max = orders[0].orderDate;
    for (const o of orders) {
      if (o.orderDate < cursor) cursor = o.orderDate;
      if (o.orderDate > max) max = o.orderDate;
    }
    cursor = utcMidnight(cursor);
    max = utcMidnight(max);
    for (const o of orders) {
      const key = o.orderDate.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + (Number(o.total) || 0));
    }
    const series: DailySeriesInput["series"] = [];
    while (cursor <= max) {
      const key = cursor.toISOString().slice(0, 10);
      series.push({ date: key, sales: Math.round((perDay.get(key) ?? 0) * 100) / 100 });
      const next = new Date(cursor);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next;
    }
    return series;
  }

  /** Baris RFM per pelanggan; acuan = max(orderDate) + 1 hari (kebiasaan rfm_table). */
  private static rfmRows(
    orders: { id: string; customerId: string | null; orderDate: Date; total: unknown }[],
  ): SegmentationInput["customers"] {
    if (orders.length === 0) return [];
    let maxDate = orders[0].orderDate;
    for (const o of orders) if (o.orderDate > maxDate) maxDate = o.orderDate;
    const reference = maxDate.getTime() + 86_400_000;

    const perCustomer = new Map<string, { last: number; frequency: Map<string, number>; monetary: number }>();
    for (const o of orders) {
      if (!o.customerId) continue;
      const entry = perCustomer.get(o.customerId) ?? {
        last: 0,
        frequency: new Map<string, number>(),
        monetary: 0,
      };
      entry.last = Math.max(entry.last, o.orderDate.getTime());
      entry.frequency.set(o.id, 1);
      entry.monetary += Number(o.total) || 0;
      perCustomer.set(o.customerId, entry);
    }

    const rows: SegmentationInput["customers"] = [];
    for (const [customerId, entry] of perCustomer) {
      rows.push({
        customer_id: customerId,
        recency: Math.round((reference - entry.last) / 86_400_000),
        frequency: entry.frequency.size,
        monetary: Math.round(entry.monetary * 100) / 100,
      });
    }
    return rows;
  }

  /** `POST /forecast/run` - deret penjualan harian toko. */
  async forecastInput(storeId: string, horizonDays = 30): Promise<DailySeriesInput & { horizon_days: number }> {
    const orders = await this.ordersFor(storeId);
    return {
      series: MlDataService.denseDailySeries(orders),
      horizon_days: horizonDays,
    };
  }

  /** `POST /anomaly/run` - deret penjualan harian toko. */
  async anomalyInput(storeId: string): Promise<DailySeriesInput> {
    const orders = await this.ordersFor(storeId);
    return { series: MlDataService.denseDailySeries(orders) };
  }

  /** `POST /segmentation/run` - baris RFM pelanggan toko. */
  async segmentationInput(storeId: string): Promise<SegmentationInput> {
    const orders = await this.ordersFor(storeId);
    return { customers: MlDataService.rfmRows(orders) };
  }

  /** `POST /churn/run` - baris RFM pelanggan toko (recency jadi basis skor). */
  async churnInput(storeId: string): Promise<ChurnInput> {
    const orders = await this.ordersFor(storeId);
    return { customers: MlDataService.rfmRows(orders) };
  }

  /**
   * `POST /basket/run` - baris (orderId, produk) toko.
   *
   * Item dikirim sebagai "Nama (SKU)", bukan id produk mentah: FP-Growth
   * mengembalikan label pada aturan asosiasinya apa adanya, dan versi lama
   * - UUID - tampil di batang grafik bundling sehingga pengguna tidak bisa
   * membaca insight (laporan 20 Okt). SKU disertakan memisahkan dua produk
   * yang kebetulan bernama sama.
   */
  async basketInput(storeId: string): Promise<BasketInput> {
    const items = await this.prisma.orderItems.findMany({
      where: { order: { storeId } },
      select: {
        orderId: true,
        productId: true,
        product: { select: { name: true, sku: true } },
      },
    });
    return {
      transactions: items
        .filter((i) => i.product)
        .map((i) => {
          const product = i.product as { name: string; sku: string };
          return {
            order_id: i.orderId,
            product: `${product.name || product.sku} (${product.sku})`,
          };
        }),
    };
  }
}
