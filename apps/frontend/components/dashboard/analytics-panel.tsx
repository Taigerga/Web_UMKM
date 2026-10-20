"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  getSalesSummary,
  getSalesTrend,
  getTopProducts,
  listAccessibleStores,
} from "@/lib/dashboard-data";
import type {
  SalesSummary,
  SalesTrend,
  StoreSummary,
  TopProduct,
} from "@/lib/dashboard-data";
import { resolveActiveStore } from "@/lib/dashboard-nav";
import { SalesTrendChart } from "./charts/sales-trend-chart";
import { TopProductsChart } from "./charts/top-products-chart";

export function AnalyticsPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState<"7d" | "30d" | "ytd">("30d");

  const [summary, setSummary] = React.useState<SalesSummary | null>(null);
  const [trend, setTrend] = React.useState<SalesTrend>([]);
  const [topProducts, setTopProducts] = React.useState<TopProduct[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (session.status !== "ready" || !session.profile) return;
    void listAccessibleStores()
      .then((items) => {
        setStores(items);
        const active = resolveActiveStore(items, null);
        setStoreId(active?.id ?? null);
      })
      .catch(() => setMessage("Gagal memuat toko"));
  }, [session.status, session.profile]);

  async function fetchAnalytics(targetStoreId: string, targetPeriod: string) {
    // Semua request lewat sessionRequest (satu jalur sesi sesuai catatan
    // lib/dashboard-data.ts): token terbaru ditempel otomatis dan kegagalan
    // 401 mentrigger refresh + satu kali percobaan ulang - bukan diam-diam
    // jatuh ke null seperti fetch mentah sebelumnya, karena `ensureOk`
    // melempar ApiError yang pesannya bisa ditampilkan.
    //
    // `ytd` hanya dipahami endpoint summary; trend menerima `7d|30d|90d`, jadi
    // periode trend dipetakan ke 90d alih-alih mengirim parameternya apa adanya
    // (perilaku lama: request trend gagal 400 dan datanya hilang diam-diam).
    const trendPeriod = targetPeriod === "ytd" ? "90d" : targetPeriod;
    const [summaryResult, trendResult, productsResult] = await Promise.all([
      getSalesSummary(targetStoreId, targetPeriod as "7d" | "30d" | "ytd"),
      getSalesTrend(targetStoreId, trendPeriod as "7d" | "30d" | "90d"),
      getTopProducts(targetStoreId, 10),
    ]);
    return { summaryResult, trendResult, productsResult };
  }

  function applyAnalytics(data: {
    summaryResult?: SalesSummary | null;
    trendResult?: SalesTrend | null;
    productsResult?: TopProduct[] | null;
  }) {
    if (data.summaryResult) setSummary(data.summaryResult);
    if (data.trendResult) setTrend(data.trendResult);
    if (data.productsResult) setTopProducts(data.productsResult);
  }

  async function loadAnalytics() {
    if (!storeId) return;
    setLoading(true);
    try {
      applyAnalytics(await fetchAnalytics(storeId, period));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal memuat analytics");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!storeId) return;
    // Muat analytics lewat callback promise: setState hanya di callback
    // `.then`, bukan langsung di badan effect (react-hooks/set-state-in-effect).
    let cancelled = false;
    void fetchAnalytics(storeId, period)
      .then((data) => {
        if (!cancelled) applyAnalytics(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memuat analytics");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, period]);

  return (
    <div className="space-y-6">
      {message && (
        <div className="bg-critical-wash border border-critical/30 text-critical px-4 py-3 rounded-lg">
          {message}
        </div>
      )}

        <div className="flex gap-4 items-center">
          <select
            value={storeId || ""}
            onChange={(e) => setStoreId(e.target.value || null)}
            className="border-line-strong rounded-lg bg-surface px-3 py-2 text-sm"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            {(["7d", "30d", "ytd"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  period === p
                    ? "bg-accent text-white"
                    : "border border-line bg-surface text-ink hover:bg-neutral-wash"
                }`}
              >
                {p === "7d" ? "7 hari" : p === "30d" ? "30 hari" : "YTD"}
              </button>
            ))}
          </div>

        <Button onClick={loadAnalytics} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted">
              Total Penjualan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rp {summary ? (summary.totalSales / 1_000_000).toFixed(1) : "0"}jt
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted">
              Total Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted">
              Nilai Rata-rata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rp {summary ? (summary.avgOrderValue / 1_000_000).toFixed(1) : "0"}jt
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted">
              Total Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalItems || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Grafik produk terlaris (tabel di bawah tetap ada untuk detail) */}
      <Card>
        <CardHeader>
          <CardTitle>Produk Terlaris - Jumlah Item Terjual</CardTitle>
        </CardHeader>
        <CardContent>
          <TopProductsChart
            data={topProducts.map((p) => ({ name: p.sku, totalQty: p.totalQty, totalRevenue: p.totalRevenue }))}
          />
        </CardContent>
      </Card>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle>Produk Terlaris</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">SKU</th>
                  <th className="text-left py-2 px-2">Nama</th>
                  <th className="text-right py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Revenue</th>
                  <th className="text-right py-2 px-2">Order</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId} className="border-b hover:bg-neutral-wash">
                    <td className="py-2 px-2">{p.sku}</td>
                    <td className="py-2 px-2">{p.name}</td>
                    <td className="text-right py-2 px-2">{p.totalQty}</td>
                    <td className="text-right py-2 px-2">
                      Rp {(p.totalRevenue / 1_000_000).toFixed(1)}jt
                    </td>
                    <td className="text-right py-2 px-2">{p.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Grafik tren (tabel di bawah tetap ada untuk nilai per tanggal) */}
      <Card>
        <CardHeader>
          <CardTitle>Tren Penjualan Harian</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesTrendChart data={trend.map((t) => ({ date: t.date, sales: t.sales }))} />
        </CardContent>
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Tren Penjualan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Tanggal</th>
                  <th className="text-right py-2 px-2">Penjualan</th>
                  <th className="text-right py-2 px-2">Pesanan</th>
                  <th className="text-right py-2 px-2">Item</th>
                </tr>
              </thead>
              <tbody>
                {trend.slice(-10).map((t) => (
                  <tr key={t.date} className="border-b hover:bg-neutral-wash">
                    <td className="py-2 px-2">{t.date}</td>
                    <td className="text-right py-2 px-2">
                      Rp {(t.sales / 1_000_000).toFixed(1)}jt
                    </td>
                    <td className="text-right py-2 px-2">{t.orderCount}</td>
                    <td className="text-right py-2 px-2">{t.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
