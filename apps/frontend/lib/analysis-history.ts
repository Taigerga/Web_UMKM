import type { AnalyticsJob } from "./dashboard-data";

/**
 * Riwayat hasil analisis ML untuk panel "Jalankan Analisis".
 *
 * Hasil job TERSIMPAN di database (`ml_jobs.result`) sejak awal, tapi versi
 * lama panelnya hanya memegang job terakhir di state React: satu muat-ulang
 * halaman dan semua hasil hilang dari pandangan (laporan 20 Okt). Panel kini
 * memuat daftar job lewat `GET /stores/:id/analytics/jobs` saat mount dan
 * menampilkan hasil termutakhir yang completed PER MODEL - ganti model di
 * dropdown hanya memindahkan yang dilihat, bukan mengganti isi model lain.
 */

/** `market-basket` di basis data = `basket` di UI - samakan ke kunci yang sama. */
export function normalizeJobType(jobType: string): string {
  return jobType === "market-basket" ? "basket" : jobType;
}

/**
 * Ambil job completed termutakhir untuk TIAP model.
 *
 * Masukan apa adanya (JobType apa pun, galat, kosong) diperiksa; job without
 * hasil tidak pernah masuk peta. Urutan distabilkan lewat createdAt supaya
 * ganda data dari backend tidak mengubah pemenang.
 */
export function pickLatestCompleted(jobs: AnalyticsJob[]): Record<string, AnalyticsJob> {
  const sorted = [...jobs].sort((a, b) =>
    String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")),
  );
  const out: Record<string, AnalyticsJob> = {};
  for (const job of sorted) {
    if (job.status !== "completed") continue;
    if (job.result == null) continue;
    if (!job.jobType) continue;
    out[normalizeJobType(job.jobType)] = job;
  }
  return out;
}
