// src/ml/ml-data.service.spec.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MlDataService } from "./ml-data.service.js";

/**
 * Agregasi data per-toko untuk inferensi ML.
 *
 * Kontrak pentingnya (Review Focus #4):
 * 1. Semua hasil ter-scope storeId yang dikirim, bukan DB penuh.
 * 2. Deret harian PADAT - tanggal tanpa penjualan tetap ada berisi 0, supaya
 *    baseline 7 hari di Python konvergen dengan definisi kalender.
 * 3. RFM: jumlah titik = pelanggan aktif toko itu, recency dihitung dari
 *    transaksi terakhir toko, bukan dari "hari ini".
 */

const prismaMock = {
  orders: {
    findMany: vi.fn(),
  },
  orderItems: {
    findMany: vi.fn(),
  },
};

const service = new MlDataService(prismaMock as never);

const day = (iso: string) => new Date(iso);
const ORDER_ROWS = [
  { id: "o1", orderDate: day("2026-01-01T10:00:00Z"), total: "150000", customerId: "c1" },
  { id: "o2", orderDate: day("2026-01-01T18:00:00Z"), total: "50000", customerId: "c2" },
  { id: "o3", orderDate: day("2026-01-03T09:00:00Z"), total: "80000", customerId: "c1" },
];

describe("MlDataService", () => {
  beforeEach(() => {
    prismaMock.orders.findMany.mockReset();
    prismaMock.orderItems.findMany.mockReset();
  });

  it("forecastInput: deret harian padat dan terurut untuk toko itu", async () => {
    prismaMock.orders.findMany.mockResolvedValue(ORDER_ROWS);

    const result = await service.forecastInput("s1", 14);

    expect(prismaMock.orders.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: "s1" } }),
    );
    expect(result.horizon_days).toBe(14);
    // 2026-01-01 .. 2026-01-03 -> 3 hari padat, 01-02 = 0
    expect(result.series).toEqual([
      { date: "2026-01-01", sales: 200000 },
      { date: "2026-01-02", sales: 0 },
      { date: "2026-01-03", sales: 80000 },
    ]);
  });

  it("analisisInput / segmentationInput: kosong toko kosong, tanpa data dikarang", async () => {
    prismaMock.orders.findMany.mockResolvedValue([]);

    const anomaly = await service.anomalyInput("s1");
    const segmentation = await service.segmentationInput("s1");

    expect(anomaly.series).toEqual([]);
    expect(segmentation.customers).toEqual([]);
  });

  it("segmentationInput: customer_id, jumlah order, recency dari transaksi terakhir", async () => {
    prismaMock.orders.findMany.mockResolvedValue(ORDER_ROWS);

    const result = await service.segmentationInput("s1");

    // referensi = max(orderDate)+1 = 2026-01-04
    expect(result.customers).toEqual([
      { customer_id: "c1", recency: 1, frequency: 2, monetary: 230000 },
      { customer_id: "c2", recency: 3, frequency: 1, monetary: 50000 },
    ]);
  });

  /** Label item basket = "Nama (SKU)" supaya insight terbaca manusia. */
  it("basketInput: label item nama+sku; item tanpa produk dilewati", async () => {
    prismaMock.orderItems.findMany.mockResolvedValue([
      { orderId: "o1", productId: "p1", product: { name: "Kopi Nusantara", sku: "P1" } },
      { orderId: "o1", productId: null, product: null },
      { orderId: "o2", productId: "p2", product: { name: "", sku: "P2" } },
    ]);

    const result = await service.basketInput("s1");

    expect(prismaMock.orderItems.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order: { storeId: "s1" } } }),
    );
    expect(result.transactions).toEqual([
      { order_id: "o1", product: "Kopi Nusantara (P1)" },
      // Nama kosong jatuh ke SKU - label tetap tidak pernah kosong.
      { order_id: "o2", product: "P2 (P2)" },
    ]);
  });
});
