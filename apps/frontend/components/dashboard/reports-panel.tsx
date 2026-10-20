"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  downloadStoreReport,
  listAccessibleStores,
  listStoreProducts,
} from "@/lib/dashboard-data";
import type { StoreProduct, StoreSummary } from "@/lib/dashboard-data";
import { ALLOWED_FORMATS, reportPath } from "@/lib/report-format";
import type { ReportFormat, ReportType } from "@/lib/report-format";

export function ReportsPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [reportType, setReportType] = React.useState<ReportType>("sales-summary");
  const [period, setPeriod] = React.useState<"7d" | "30d" | "90d">("30d");
  const [format, setFormat] = React.useState<ReportFormat>("html");

  function changeReportType(next: ReportType) {
    setReportType(next);
    // Normalisasi format di sini (event handler), bukan di effect, supaya
    // tidak ada setState langsung di badan effect.
    const allowed = ALLOWED_FORMATS[next];
    setFormat((current) => (allowed.includes(current) ? current : allowed[0]));
  }
  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = React.useState<string>("");

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

  React.useEffect(() => {
    if (!storeId) return;
    // Muat produk untuk laporan forecast lewat callback promise: setState
    // hanya di callback, bukan langsung di badan effect.
    let cancelled = false;
    void listStoreProducts(storeId)
      .then((items) => {
        if (cancelled) return;
        setProducts(items);
        if (items.length > 0) setSelectedProductId(items[0].id);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memuat produk");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function downloadReport() {
    if (!storeId) return;
    setLoading(true);
    setMessage(null);

    try {
      if (reportType === "forecast" && !selectedProductId) {
        setMessage("Pilih produk untuk forecast report");
        return;
      }

      const path = reportPath(storeId, reportType, format, { productId: selectedProductId });
      // sessionFetch melempar ApiError dengan pesan baca-manusia untuk semua
      // status non-2xx (termasuk 401 setelah refresh sekali gagal), jadi
      // pemanggil tidak memeriksa `res.ok` secara manual.
      const res = await downloadStoreReport(path);

      // Nama berkas dari `Content-Disposition`, atau default per format.
      const contentDisposition = res.headers.get("content-disposition");
      let filename = `laporan.${format}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+?)"/);
        if (match) filename = match[1];
      }

      const blob = await res.blob();
      const url_obj = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url_obj;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url_obj);

      setMessage("Laporan berhasil didownload");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal download laporan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`px-4 py-3 rounded-lg border ${
            message.includes("berhasil")
              ? "bg-positive-wash border-positive/30 text-positive"
              : "bg-critical-wash border-critical/30 text-critical"
          }`}
        >
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buat Laporan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Store selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Toko</label>
            <select
              value={storeId || ""}
              onChange={(e) => setStoreId(e.target.value || null)}
              className="w-full border-line-strong rounded-lg bg-surface px-3 py-2 text-sm"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Report type selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Tipe Laporan</label>
            <div className="space-y-2">
              {[
                { value: "sales-summary" as const, label: "Ringkasan Penjualan" },
                { value: "detailed" as const, label: "Detail Pesanan & Item (90 hari)" },
                { value: "forecast" as const, label: "Forecast Produk" },
              ].map((type) => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={type.value}
                    checked={reportType === type.value}
                    onChange={(e) => changeReportType(e.target.value as ReportType)}
                    className="w-4 h-4"
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Period selector (for sales-summary) */}
          {reportType === "sales-summary" && (
            <div>
              <label className="block text-sm font-medium mb-2">Periode</label>
              <div className="flex gap-2">
                {(["7d", "30d", "90d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      period === p
                        ? "bg-accent text-white"
                        : "border border-line bg-surface text-ink hover:bg-neutral-wash"
                    }`}
                  >
                    {p === "7d" ? "7 hari" : p === "30d" ? "30 hari" : "90 hari"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product selector (for forecast) */}
          {reportType === "forecast" && (
            <div>
              <label className="block text-sm font-medium mb-2">Produk</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full border-line-strong rounded-lg bg-surface px-3 py-2 text-sm"
              >
                <option value="">Pilih produk...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Format selector */}
          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "html" | "csv" | "xlsx" | "pdf")}
              className="w-full border-line-strong rounded-lg bg-surface px-3 py-2 text-sm"
            >
              {(reportType === "sales-summary"
                ? (["html", "xlsx", "pdf"] as const)
                : reportType === "detailed"
                ? (["csv", "xlsx"] as const)
                : (["html", "pdf"] as const)
              ).map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Download button */}
          <Button
            onClick={downloadReport}
            disabled={loading || (reportType === "forecast" && !selectedProductId)}
            className="w-full"
          >
            {loading ? "Generating..." : "Download Laporan"}
          </Button>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Info Format Laporan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>Ringkasan Penjualan:</strong> HTML, XLSX, dan PDF (30 hari
            default).
          </p>
          <p>
            <strong>Detail Pesanan:</strong> CSV dan XLSX (detail pesanan &amp;
            item 90 hari).
          </p>
          <p>
            <strong>Forecast:</strong> HTML interaktif dan PDF.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
