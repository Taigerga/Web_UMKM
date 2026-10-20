"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  getAnalyticsJob,
  listAccessibleStores,
  listAnalyticsJobs,
  startAnalyticsJob,
} from "@/lib/dashboard-data";
import type { AnalyticsJob, StoreSummary } from "@/lib/dashboard-data";
import { pickLatestCompleted } from "@/lib/analysis-history";
import { resolveActiveStore } from "@/lib/dashboard-nav";
import { chartInsightText } from "@/lib/chart-data";
import {
  toAnomalyChart,
  toBasketChart,
  toChurnChart,
  toForecastChart,
  toSegmentChart,
} from "@/lib/chart-data";
import { AnomalyScatter } from "./charts/anomaly-scatter";
import { BasketLiftChart } from "./charts/basket-lift-chart";
import { ChurnDonut } from "./charts/churn-donut";
import { ForecastChart } from "./charts/forecast-chart";
import { SegmentDonut } from "./charts/segment-donut";

type JobType = "forecast" | "segmentation" | "basket" | "churn" | "anomaly";

const JOB_OPTIONS: { value: JobType; label: string }[] = [
  { value: "forecast", label: "Forecast Penjualan (30 hari)" },
  { value: "segmentation", label: "Segmentasi Pelanggan (RFM)" },
  { value: "basket", label: "Market Basket (Bundling)" },
  { value: "churn", label: "Customer Churn Risk" },
  { value: "anomaly", label: "Deteksi Anomali Penjualan" },
];

/**
 * Peta hasil job ke visual yang tepat sesuai jenis analisisnya.
 *
 * Pemetaan bentuk data lewat `lib/chart-data.ts` (teruji). Tiap chart
 * menangani empty state sendiri - jadi hasil kosong tetap jujur ditampilkan,
 * bukan grafik hantu.
 */
function JobResultChart({ jobType, result }: { jobType: string; result: unknown }) {
  if (jobType === "forecast") {
    return <ForecastChart data={toForecastChart(result)} />;
  }
  if (jobType === "segmentation") {
    return <SegmentDonut data={toSegmentChart(result)} />;
  }
  if (jobType === "basket") {
    return <BasketLiftChart data={toBasketChart(result)} />;
  }
  if (jobType === "churn") {
    return <ChurnDonut data={toChurnChart(result)} />;
  }
  if (jobType === "anomaly") {
    return <AnomalyScatter data={toAnomalyChart(result)} />;
  }
  return null;
}

export function AnalyticsJobPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [jobType, setJobType] = React.useState<JobType>("forecast");
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [job, setJob] = React.useState<AnalyticsJob | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  /**
   * Hasil tersimpan per model - dipulihkan dari database saat mount, jadi
   * muat-ulang halaman TIDAK lagi mengosongkan semua hasil (laporan 20 Okt).
   * Kecil kemungkinan kalau panelnya hanya di state React, teks
   * "hasil tersimpan dan dapat dilihat kembali" di sekitar tombol menjadi
   * tidak benar.
   */
  const [saved, setSaved] = React.useState<Record<string, AnalyticsJob>>({});

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

  // Pulihkan hasil tersimpan dari `GET /analytics/jobs` tiap berganti toko:
  // hasil termutakhir yang completed tiap model, siap ditampilkan walau job
  // itu dijalankan berbulan lalu di sesi lain.
  React.useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void listAnalyticsJobs(storeId, 50)
      .then((items) => {
        if (!cancelled) setSaved(pickLatestCompleted(items));
      })
      .catch(() => {
        if (!cancelled) setMessage("Gagal memuat riwayat analisis");
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function submit() {
    if (!storeId) return;
    setSubmitting(true);
    setMessage(null);
    setJob(null);
    try {
      // sessionRequest menempel token terbaru dan sudah menangani refresh +
      // satu kali percobaan ulang saat 401 ApiError dilempar dengan pesan
      // yang bisa dibaca langsung (amplop galat backend).
      const { jobId: id } = await startAnalyticsJob(storeId, jobType);
      setJobId(id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal submit");
    } finally {
      setSubmitting(false);
    }
  }

  // polling
  React.useEffect(() => {
    if (!jobId || !storeId) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const poll = async () => {
      try {
        const data = await getAnalyticsJob(storeId, jobId);
        if (!active) return;
        setJob(data);
        if (data.status === "completed" || data.status === "failed") {
          stop();
          // Setelah selesai, hasilnya langsung mengisi slot model itu -
          // panel tidak menunggu muat-ulang untuk menampilkannya.
          if (data.status === "completed") {
            setSaved((prev) => ({ ...prev, [data.jobType]: data }));
          }
        }
      } catch {
        if (active) setMessage("Gagal polling status");
        stop();
      }
    };

    void poll();
    timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      stop();
    };
  }, [jobId, storeId]);

  // Job yang dipol ditampilkan hanya kalau modelnya sedang dipilih - kalau
  // tidak, panel menampilkan hasil tersimpan model yang dipilih (supaya
  // pindah dropdown tidak menyembunyikan hasil model lain).
  const live = job && job.jobType === jobType ? job : null;
  const livePending = live && (live.status === "queued" || live.status === "running") ? live : null;
  const liveFailed = live && live.status === "failed" ? live : null;
  const liveCompleted = live && live.status === "completed" ? live : null;
  const savedJob = saved[jobType] ?? null;
  const shownResult = liveCompleted ?? savedJob;
  const resultType: string | null = shownResult ? shownResult.jobType : null;
  const optionLabel = JOB_OPTIONS.find((o) => o.value === jobType)?.label ?? jobType;

  return (
    <div className="space-y-6">
      {message && (
        <div className="bg-critical-wash border border-critical/30 text-critical px-4 py-3 rounded-lg">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Jalankan Analisis ML</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <select
              value={storeId || ""}
              onChange={(e) => setStoreId(e.target.value || null)}
              className="border-line-strong rounded-lg bg-surface px-3 py-2 text-sm"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as JobType)}
              className="border-line-strong rounded-lg bg-surface px-3 py-2 text-sm"
            >
              {JOB_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button onClick={submit} disabled={submitting || !storeId}>
              {submitting ? "Mengirim..." : "Jalankan Analisis"}
            </Button>
          </div>
          <p className="text-sm text-ink-muted">
            Sistem akan memproses analisis secara asynchronous. Hasil tersimpan di database dan tidak hilang saat halaman dimuat ulang.
          </p>
        </CardContent>
      </Card>

      {livePending && (
        <Card>
          <CardHeader>
            <CardTitle>Analisis sedang dijalankan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-neutral-wash text-ink-muted animate-pulse">
                {livePending.status}
              </span>
              <span className="text-sm text-ink-muted">
                Job {livePending.jobId.slice(0, 8)}… - menunggu hasil tiap 2 detik
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {liveFailed && (
        <Card>
          <CardHeader>
            <CardTitle>Analisis gagal dijalankan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-critical-wash border border-critical/30 text-critical px-4 py-3 rounded-lg text-sm">
              {liveFailed.errorMessage ?? "Galat tidak diketahui"}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hasil: dari job yang baru selesai ATAU yang tersimpan dari sesi lama. */}
      {shownResult && resultType ? (
        <Card>
          <CardHeader>
            <CardTitle>Hasil: {JOB_OPTIONS.find((o) => o.value === resultType)?.label ?? resultType}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {shownResult.completedAt && (
              <p className="text-xs text-ink-muted">
                Dihitung pada{" "}
                {new Date(shownResult.completedAt).toLocaleString("id-ID", {
                  dateStyle: "long",
                  timeStyle: "short",
                  timeZone: "Asia/Jakarta",
                })}
              </p>
            )}
            {chartInsightText(resultType, shownResult.result) && (
              <div className="bg-accent-wash border border-accent/40 text-ink px-4 py-3 rounded-lg text-sm">
                {chartInsightText(resultType, shownResult.result)}
              </div>
            )}
            <JobResultChart jobType={resultType} result={shownResult.result} />
            <details>
              <summary className="cursor-pointer text-xs text-ink-muted">
                Lihat keterapan mentah (JSON)
              </summary>
              <pre className="bg-paper border border-line rounded p-3 text-xs overflow-auto max-h-96 mt-2">
                {JSON.stringify(shownResult.result, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : !livePending && !liveFailed && !submitting ? (
        <Card>
          <CardContent>
            <p className="text-sm text-ink-muted">
              Belum ada hasil tersimpan untuk {optionLabel}. Pilih model di atas dan tekan
              &ldquo;Jalankan Analisis&rdquo; - hasilnya akan tetap ditampilkan di halaman ini setelah
              selesai, termasuk saat halaman dibuka kembali nanti.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
