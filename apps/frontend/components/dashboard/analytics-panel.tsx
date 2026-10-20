"use client";

import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
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

/**
 * Rupiah yang dibaca manusia: nilai >= 1 juta tampil ringkas ("Rp 1,2 jt"),
 * nilai di bawahnya utuh ("Rp 850.000"). Format ganda ini menjaga KPI tetap
 * pendek saat nilainya besar tanpa menampilkan "Rp 0,0 jt" yang aneh ketika
 * belum ada penjualan.
 */
function formatRupiah(value: number): string {
  if (!Number.isFinite(value)) return "Rp 0";
  if (Math.abs(value) >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })} jt`;
  }
  return `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

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

  const profileId = session.profile?.id;
  React.useEffect(() => {
    if (session.status !== "ready" || !profileId) return;
    void listAccessibleStores()
      .then((items) => {
        setStores(items);
        const active = resolveActiveStore(items, null);
        setStoreId(active?.id ?? null);
      })
      .catch(() => setMessage("Gagal memuat toko"));
  }, [session.status, profileId]);

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
          {loading ? "Memuat..." : "Refresh"}
        </Button>
      </div>

      {/*
        KPI: selama summary belum datang tampilkan "—", BUKAN "Rp 0".
        Nol adalah jawaban SAH kalau periode memang tanpa penjualan, tapi
        tampil sebagai nilai awal sebelum fetch selesai membuat pengguna
        hal ini terbaca sebagai bug "semua nol" (laporan pengguna 20 Okt).
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-ink-muted">
              Total Penjualan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary !== null ? formatRupiah(summary.totalSales) : <span className="text-ink-muted">—</span>}
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
            <div className="text-2xl font-bold">
              {summary !== null ? summary.totalOrders : <span className="text-ink-muted">—</span>}
            </div>
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
              {summary !== null ? formatRupiah(summary.avgOrderValue) : <span className="text-ink-muted">—</span>}
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
            <div className="text-2xl font-bold">
              {summary !== null ? summary.totalItems : <span className="text-ink-muted">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Produk terlaris: grafik sebagai tampilan utama, tabel detail
          dilipat ke <details> supaya kartu duplikat tidak menumpuk. */}
      <Card>
        <CardHeader>
          <CardTitle>Produk Terlaris — Jumlah Item Terjual</CardTitle>
        </CardHeader>
        <CardContent>
          <TopProductsChart
            data={topProducts.map((p) => ({ name: p.sku, totalQty: p.totalQty, totalRevenue: p.totalRevenue }))}
          />
          {topProducts.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-accent">
                Lihat tabel detail produk
              </summary>
              <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="py-2 px-2">SKU</th>
                  <th className="py-2 px-2">Nama</th>
                  <th className="text-right py-2 px-2">Qty</th>
                  <th className="text-right py-2 px-2">Pendapatan</th>
                  <th className="text-right py-2 px-2">Order</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId} className="border-b border-line hover:bg-neutral-wash">
                    <td className="py-2 px-2">{p.sku}</td>
                    <td className="py-2 px-2">{p.name}</td>
                    <td className="text-right py-2 px-2">{p.totalQty}</td>
                    <td className="text-right py-2 px-2">
                      {formatRupiah(p.totalRevenue)}
                    </td>
                    <td className="text-right py-2 px-2">{p.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>

      {/* Tren penjualan: grafik sebagai tampilan utama, tabel nilai harian
          dilipat di bawahnya. */}
      <Card>
        <CardHeader>
          <CardTitle>Tren Penjualan Harian</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesTrendChart data={trend.map((t) => ({ date: t.date, sales: t.sales }))} />
          {trend.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-accent">
                Lihat tabel nilai harian
              </summary>
              <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="py-2 px-2">Tanggal</th>
                  <th className="text-right py-2 px-2">Penjualan</th>
                  <th className="text-right py-2 px-2">Pesanan</th>
                  <th className="text-right py-2 px-2">Item</th>
                </tr>
              </thead>
              <tbody>
                {trend.slice(-10).map((t) => (
                  <tr key={t.date} className="border-b border-line hover:bg-neutral-wash">
                    <td className="py-2 px-2">{t.date}</td>
                    <td className="text-right py-2 px-2">
                      {formatRupiah(t.sales)}
                    </td>
                    <td className="text-right py-2 px-2">{t.orderCount}</td>
                    <td className="text-right py-2 px-2">{t.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
