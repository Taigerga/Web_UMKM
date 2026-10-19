"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";

type SalesSummary = {
  totalSales: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  avgItemsPerOrder: number;
  period: string;
};

type SalesTrend = Array<{
  date: string;
  sales: number;
  orderCount: number;
  itemCount: number;
}>;

type TopProduct = {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
};

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
        if (items.length > 0) setStoreId(items[0].id);
      })
      .catch(() => setMessage("Gagal memuat toko"));
  }, [session.status, session.profile]);

  async function fetchAnalytics(targetStoreId: string, targetPeriod: string) {
    // Ambil data tanpa menyentuh state React; pemanggil yang men-set state
    // (effect melalui callback, tombol Refresh melalui loadAnalytics).
    const headers = { credentials: "include" };
    const [summaryRes, trendRes, productsRes] = await Promise.all([
      fetch(`${API_BASE_URL}${API_PREFIX}/stores/${targetStoreId}/analytics/summary?period=${targetPeriod}`, { headers }),
      fetch(`${API_BASE_URL}${API_PREFIX}/stores/${targetStoreId}/analytics/trend?period=${targetPeriod}`, { headers }),
      fetch(`${API_BASE_URL}${API_PREFIX}/stores/${targetStoreId}/analytics/top-products?limit=10`, { headers }),
    ]);

    const parse = async (res: Response) => {
      if (!res.ok) return null;
      const json: unknown = await res.json();
      return (json as { data: unknown }).data;
    };

    const [summary, trend, topProducts] = await Promise.all([
      parse(summaryRes) as Promise<SalesSummary | null>,
      parse(trendRes) as Promise<SalesTrend | null>,
      parse(productsRes) as Promise<TopProduct[] | null>,
    ]);
    return { summary, trend, topProducts };
  }

  function applyAnalytics(data: {
    summary: SalesSummary | null;
    trend: SalesTrend | null;
    topProducts: TopProduct[] | null;
  }) {
    if (data.summary) setSummary(data.summary);
    if (data.trend) setTrend(data.trend);
    if (data.topProducts) setTopProducts(data.topProducts);
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
      .catch(() => {
        if (!cancelled) setMessage("Gagal memuat analytics");
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, period]);

  return (
    <div className="space-y-6">
      {message && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {message}
        </div>
      )}

      <div className="flex gap-4 items-center">
        <select
          value={storeId || ""}
          onChange={(e) => setStoreId(e.target.value || null)}
          className="border rounded px-3 py-2"
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
              className={`px-3 py-2 rounded text-sm ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 bg-white hover:bg-gray-50"
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
            <CardTitle className="text-sm font-medium text-gray-600">
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
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
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
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalItems || 0}</div>
          </CardContent>
        </Card>
      </div>

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
                  <tr key={p.productId} className="border-b hover:bg-gray-50">
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
                  <tr key={t.date} className="border-b hover:bg-gray-50">
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
