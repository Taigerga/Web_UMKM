"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  getAnalyticsJob,
  listAccessibleStores,
  startAnalyticsJob,
} from "@/lib/dashboard-data";
import type { AnalyticsJob, StoreSummary } from "@/lib/dashboard-data";
import { resolveActiveStore } from "@/lib/dashboard-nav";
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

  return (
    <div className="space-y-6">
      {message && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{message}</div>
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
              className="border rounded px-3 py-2"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value as JobType)}
              className="border rounded px-3 py-2"
            >
              {JOB_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button onClick={submit} disabled={submitting || !storeId}>
              {submitting ? "Mengirim..." : "Jalankan Analisis"}
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            Sistem akan memproses analisis secara asynchronous. Anda dapat menutup halaman; hasil tersimpan dan dapat dilihat kembali.
          </p>
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardHeader>
            <CardTitle>Status Job: {job.jobType}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">Job ID: </span>{job.jobId}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Status:</span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  job.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : job.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                }`}
              >
                {job.status}
              </span>
            </div>
            {job.explanation && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded text-sm">
                {job.explanation}
              </div>
            )}
            {job.errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {job.errorMessage}
              </div>
            )}
            {job.status === "completed" && Boolean(job.result) && (
              <div className="mt-4 space-y-3">
                <div className="text-sm font-medium">Hasil:</div>
                <JobResultChart jobType={job.jobType} result={job.result} />
                <details>
                  <summary className="cursor-pointer text-xs text-ink-muted">
                    Lihat keterapan mentah (JSON)
                  </summary>
                  <pre className="bg-gray-50 border rounded p-3 text-xs overflow-auto max-h-96 mt-2">
                    {JSON.stringify(job.result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
