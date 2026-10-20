import { describe, expect, it } from "vitest";

import { pickLatestCompleted } from "@/lib/analysis-history";
import { chartInsightText } from "@/lib/chart-data";
import type { AnalyticsJob } from "@/lib/dashboard-data";

const job = (overrides: Partial<AnalyticsJob> & { jobId: string }): AnalyticsJob => ({
  status: "completed",
  jobType: "forecast",
  result: { forecasts: [{ date: "2026-11-01", predicted: 100000, lower: 0, upper: 200000 }] },
  createdAt: "2026-11-01T10:00:00Z",
  ...overrides,
});

describe("pickLatestCompleted", () => {
  it("memilih job completed termutakhir per model", () => {
    const picked = pickLatestCompleted([
      job({ jobId: "f1", jobType: "forecast", createdAt: "2026-11-02T00:00:00Z" }),
      job({ jobId: "f2", jobType: "forecast", createdAt: "2026-11-01T00:00:00Z" }), // lebih tua
      job({ jobId: "b1", jobType: "basket", result: { rules: [{ lift: 2 }] } }),
    ]);
    expect(picked.forecast?.jobId).toBe("f1");
    expect(picked.basket?.jobId).toBe("b1");
  });

  it("job gagal / tanpa hasil tidak pernah menjadi hasil tersimpan", () => {
    const picked = pickLatestCompleted([
      job({
        jobId: "f3",
        status: "failed",
        errorMessage: "Layanan ML tidak merespons",
        result: undefined,
      }),
    ]);
    expect(picked.forecast).toBeUndefined();
  });

  it("jobType market-basket dipetakan ke kunci basket", () => {
    const picked = pickLatestCompleted([
      job({ jobId: "b2", jobType: "market-basket", result: { rules: [] } }),
    ]);
    expect(Object.keys(picked)).toEqual(["basket"]);
  });
});

const BASKET_RESULT = {
  rules: [{ antecedent: ["Kopi (P1)"], consequent: ["Gula (S2)"], support: 0.08, confidence: 0.4, lift: 2.9 }],
  metadata: { n_transactions: 413 },
};

const SEGMENT_RESULT = {
  segments: [
    { segment: "Pelanggan Potensial", customers: 12, customer_pct: 60, revenue_pct: 40 },
    { segment: "Pelanggan Setia (VIP)", customers: 8, customer_pct: 40, revenue_pct: 60 },
  ],
  metadata: { n_customers: 20 },
};

const CHURN_RESULT = {
  summary: { Low: 12, Medium: 4, High: 3 },
  high_risk_customers: [],
  metadata: {},
};

const ANOMALY_RESULT = {
  anomalies: [
    { date: "2026-09-17", actual_sales: 9000000, baseline: 400000, type: "spike" },
    { date: "2026-10-09", actual_sales: 0, baseline: 400000, type: "drop" },
  ],
  metadata: { n_total: 60 },
};

const FORECAST_RESULT = {
  forecasts: [
    { date: "2026-11-01", predicted: 100000, lower: 0, upper: 200000 },
    { date: "2026-11-02", predicted: 120000, lower: 0, upper: 240000 },
  ],
  metadata: {},
};

describe("chartInsightText", () => {
  it("basket menyebut pasangan, cakupan, dan lift dalam bahasa bisnis", () => {
    const text = chartInsightText("basket", BASKET_RESULT);
    expect(text).toContain("Kopi (P1) → Gula (S2)");
    expect(text).toContain("8%");
    expect(text).toContain("2,9×");
  });

  it("basket tanpa aturan -> null (grafik saja, tanpa karangan)", () => {
    expect(chartInsightText("basket", { rules: [], metadata: {} })).toBeNull();
    expect(chartInsightText("basket", null)).toBeNull();
  });

  it("segmentation menyebut kelompok terbesar dan porsi omzet", () => {
    const text = chartInsightText("segmentation", SEGMENT_RESULT);
    expect(text).toContain("Pelanggan Potensial");
    expect(text).toContain("40%");
  });

  it("churn menyebut jumlah risiko tinggi dari total pelanggan", () => {
    const text = chartInsightText("churn", CHURN_RESULT);
    expect(text).toContain("3");
    expect(text).toContain("19");
  });

  it("anomaly menyebut lompatan vs penurunan", () => {
    const text = chartInsightText("anomaly", ANOMALY_RESULT);
    expect(text).toContain("2 hari");
    expect(text).toContain("1 lompatan");
  });

  it("forecast menyebut total dan rata-rata prediksi", () => {
    const text = chartInsightText("forecast", FORECAST_RESULT);
    expect(text).toContain("220.000");
    expect(text).toContain("110.000");
  });

  it("jobType tidak dikenal -> null", () => {
    expect(chartInsightText("sibuk-lain", FORECAST_RESULT)).toBeNull();
  });
});
