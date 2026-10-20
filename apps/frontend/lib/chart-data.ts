/**
 * Pemetaan hasil ML menjadi deret yang siap diplot.
 *
 * Semua fungsi di sini murni dan defensif: hasil job berasal dari JSON yang
 * disimpan di kolom `outputResult`, jadi bentuknya diperiksa di sini, bukan
 * dipercaya. Kalau model mengembalikan bentuk yang berbeda, chart menerima
 * array kosong - bukan `NaN` yang tampak seperti grafik rusak.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type ForecastPoint = {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
};

export function toForecastChart(result: unknown): ForecastPoint[] {
  const rows = asArray(asRecord(result)?.forecasts);
  const out: ForecastPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const date = typeof r.date === "string" ? r.date : null;
    const predicted = num(r.predicted);
    if (date === null || predicted === null) continue;
    out.push({
      date,
      predicted,
      lower: num(r.lower) ?? predicted,
      upper: num(r.upper) ?? predicted,
    });
  }
  return out;
}

export type SegmentPoint = {
  segment: string;
  customers: number;
  customerPct: number;
  revenuePct: number;
};

export function toSegmentChart(result: unknown): SegmentPoint[] {
  const rows = asArray(asRecord(result)?.segments);
  const out: SegmentPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const segment = typeof r.segment === "string" ? r.segment : null;
    const customers = num(r.customers);
    if (segment === null || customers === null) continue;
    out.push({
      segment,
      customers,
      customerPct: num(r.customer_pct) ?? 0,
      revenuePct: num(r.revenue_pct) ?? 0,
    });
  }
  return out;
}

export type BasketPoint = {
  label: string;
  lift: number;
  support: number;
  confidence: number;
};

function toCommaList(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "string") return value;
  return "";
}

export function toBasketChart(result: unknown): BasketPoint[] {
  const rows = asArray(asRecord(result)?.rules);
  const out: BasketPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const lift = num(r.lift);
    if (lift === null) continue;
    const antecedent = toCommaList(r.antecedent);
    const consequent = toCommaList(r.consequent);
    out.push({
      label: `${antecedent} → ${consequent}`,
      lift,
      support: num(r.support) ?? 0,
      confidence: num(r.confidence) ?? 0,
    });
  }
  return out;
}

export type ChurnPoint = {
  risk: string;
  count: number;
};

export function toChurnChart(result: unknown): ChurnPoint[] {
  const summary = asRecord(asRecord(result)?.summary);
  if (!summary) return [];
  const out: ChurnPoint[] = [];
  for (const risk of ["Low", "Medium", "High"]) {
    const count = num(summary[risk]);
    if (count !== null) out.push({ risk, count });
  }
  return out;
}

export type AnomalyPoint = {
  date: string;
  actual: number;
  baseline: number | null;
  type: string;
};

export function toAnomalyChart(result: unknown): AnomalyPoint[] {
  const rows = asArray(asRecord(result)?.anomalies);
  const out: AnomalyPoint[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const date = typeof r.date === "string" ? r.date : null;
    const actual = num(r.actual_sales);
    if (date === null || actual === null) continue;
    out.push({
      date,
      actual,
      baseline: num(r.baseline),
      type: typeof r.type === "string" ? r.type : "anomaly",
    });
  }
  return out;
}

/**
 * Satu kalimat insight per model, dari angka hasil yang SAMA dengan grafik.
 *
 * Angka di grafik (lift, persen, jumlah) sulit dibaca bisnis tanpa kalimat
 * penerjemah - laporan pengguna 20 Okt: "insight market basket kurang jelas,
 * saya tidak paham". Semua teks di sini murni: masukan bentuk tak dikenal
 * mengembalikan null dan panel menampilkan grafik saja, bukan karangan.
 */
const idNum = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export function chartInsightText(jobType: string, result: unknown): string | null {
  const rec = asRecord(result);
  if (!rec) return null;
  const meta = asRecord(rec.metadata) ?? {};
  const n = (key: string): string | null => {
    const v = num(meta[key]);
    return v === null ? null : idNum.format(v);
  };

  if (jobType === "basket") {
    const rows = toBasketChart(result);
    const top = rows[0];
    if (!top) return null;
    const nTxn = n("n_transactions");
    const share = idNum.format(Math.round(top.support * 1000) / 10);
    return (
      `Dihitung dari ${nTxn ?? "…"} transaksi. Pasangan terkuat "${top.label}" ` +
      `muncul bersama di sekitar ${share}% transaksi dan terjadi ` +
      `${idNum.format(top.lift)}× lebih sering dari kebetulan` +
      (top.lift >= 2
        ? " - kandidat kuat untuk paket bundling atau promo berpasangan."
        : " - patut dicoba, ikatannya belum terlalu kuat untuk dikomersialkan.")
    );
  }

  if (jobType === "segmentation") {
    const segments = toSegmentChart(result);
    const top = segments[0];
    if (top) {
      return `Dari ${n("n_customers") ?? "…"} pelanggan: kelompok terbesar "${top.segment}" ` +
        `berisi ${idNum.format(top.customers)} orang (${idNum.format(top.customerPct)}% pelanggan, ` +
        `menyumbang ${idNum.format(top.revenuePct)}% omzet).`;
    }
    const note = meta.note;
    return typeof note === "string" ? note : null;
  }

  if (jobType === "churn") {
    const rows = toChurnChart(result);
    const high = rows.find((r) => r.risk === "High");
    if (!high) return null;
    const total = rows.reduce((sum, r) => sum + r.count, 0);
    return `Dari ${idNum.format(total)} pelanggan yang pernah membeli: ` +
      `${idNum.format(high.count)} berisiko TINGGI berhenti membeli dalam 90 hari ` +
      "(belum ada transaksi mendekati horizon). Prioritaskan menghubungi mereka.";
  }

  if (jobType === "anomaly") {
    const rows = toAnomalyChart(result);
    if (rows.length === 0) {
      return "Tidak ada hari dengan lonjakan/penurunan yang menonjol dari pola mingguan - penjualan stabil.";
    }
    const spike = rows.filter((r) => r.type === "spike").length;
    const drop = rows.filter((r) => r.type !== "spike").length;
    return `${idNum.format(rows.length)} hari menonjol dari pola mingguan: ` +
      `${idNum.format(spike)} lompatan (jualan jauh di atas biasa) dan ` +
      `${idNum.format(drop)} penurunan. Periksa tanggalnya - lonjakan mungkin promo, ` +
      "penurunan mungkin keribetan stok atau toko tutup.";
  }

  if (jobType === "forecast") {
    const rows = toForecastChart(result);
    if (rows.length === 0) return null;
    const total = rows.reduce((sum, r) => sum + r.predicted, 0);
    return `Prediksi ${idNum.format(rows.length)} hari ke depan: total sekitar ` +
      `Rp ${idNum.format(total)} (rata-rata Rp ${idNum.format(total / rows.length)} per hari). ` +
      "Pita di grafik adalah rentang yakinnya - masih prediksi pola, bukan jaminan.";
  }

  return null;
}
