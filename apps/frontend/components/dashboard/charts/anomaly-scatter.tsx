"use client";

import * as React from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { ChartEmptyState } from "./sales-trend-chart";

export type AnomalyChartPoint = {
  date: string;
  actual: number;
  baseline: number | null;
  type: string;
};

/**
 * Titik anomali harian: aktual (juta rupiah) vs baseline (garis median).
 * Scatter supaya setiap hari anomali jelas tanggalnya, dan jenisnya (spike
 * atau drop) muncul di tooltip. Anomali = pola perlu ditinjau, bukan penal
 * otomatis fraud.
 */
export function AnomalyScatter({ data }: { data: AnomalyChartPoint[] }) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return (
      <ChartEmptyState message="Belum ada anomali terdeteksi, atau hasil analisis anomali belum tersedia." />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string) => value.slice(5)}
          type="category"
          allowDuplicatedCategory={false}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(1)}jt`}
        />
        <Tooltip
          formatter={(value, _name, entry) => {
            const row = entry?.payload as AnomalyChartPoint;
            const jenis = row.type === "spike" ? "Lonjakan" : "Penurunan";
            const baseline =
              row.baseline === null ? "-" : `Rp ${row.baseline.toLocaleString("id-ID")}`;
            return [
              `${jenis}: Rp ${row.actual.toLocaleString("id-ID")} (baseline ${baseline})`,
              row.date,
            ];
          }}
        />
        <Scatter
          data={data}
          dataKey="actual"
          name="Penjualan aktual"
          fill="#ef4444"
          isAnimationActive={!reduced}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
