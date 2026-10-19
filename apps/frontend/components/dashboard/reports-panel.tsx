"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";

type ReportType = "sales-summary" | "detailed" | "forecast";
type ReportFormat = "html" | "csv" | "xlsx" | "pdf";

/** Format yang sah per tipe laporan; dipakai saat mengganti tipe laporan. */
const ALLOWED_FORMATS: Record<ReportType, readonly ReportFormat[]> = {
  "sales-summary": ["html", "xlsx", "pdf"],
  detailed: ["csv", "xlsx"],
  forecast: ["html", "pdf"],
};

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
  const [products, setProducts] = React.useState<Array<{ id: string; sku: string; name: string }>>([]);
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
    void fetch(`${API_BASE_URL}${API_PREFIX}/stores/${storeId}/products`, {
      credentials: "include",
    })
      .then(async (res) => {
        const json: unknown = await res.json();
        const items = (json as { data?: unknown }).data;
        if (cancelled) return;
        setProducts(Array.isArray(items) ? (items as Array<{ id: string; sku: string; name: string }>) : []);
        if (Array.isArray(items) && items.length > 0) {
          setSelectedProductId((items[0] as { id: string }).id);
        }
      })
      .catch((error: unknown) => {
        console.error("Gagal memuat produk:", error);
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
      let url = `${API_BASE_URL}${API_PREFIX}/stores/${storeId}/reports/`;

      if (reportType === "sales-summary") {
        url += "sales-summary";
        if (format === "xlsx") url += "/xlsx";
        else if (format === "pdf") url += "/pdf";
      } else if (reportType === "detailed") {
        if (format === "xlsx") {
          url += "detailed/xlsx";
        } else {
          url += "detailed";
        }
      } else if (reportType === "forecast") {
        if (!selectedProductId) {
          setMessage("Pilih produk untuk forecast report");
          setLoading(false);
          return;
        }
        url += `forecast/${selectedProductId}`;
        if (format === "pdf") url += "/pdf";
      }

      const res = await fetch(url, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Gagal generate laporan");
      }

      // Get filename from headers or create default
      const contentDisposition = res.headers.get("content-disposition");
      let filename = "laporan.html";
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
          className={`px-4 py-3 rounded border ${
            message.includes("berhasil")
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
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
              className="w-full border rounded px-3 py-2"
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
                    className={`px-3 py-2 rounded text-sm ${
                      period === p
                        ? "bg-blue-600 text-white"
                        : "border border-gray-300 bg-white hover:bg-gray-50"
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
                className="w-full border rounded px-3 py-2"
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
              className="w-full border rounded px-3 py-2"
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
