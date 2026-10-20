"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { ChartEmptyState } from "./sales-trend-chart";

export type ForecastChartPoint = {
  date: string;
  predicted: number;
  lower: number;
  upper: number;
};

/**
 * Hasil forecast per-toko: prediksi (garis) + interval (garis bawah/atas).
 *
 * Harmoni bentuk data dengan `lib/chart-data.ts::toForecastChart`. Interval
 * ditampilkan sebagai dua garis, bukan Area ribet - garis mengajak pembaca
 * melihat lebar ketidakpastian, bukan area menutupi prediksi.
 */
export function ForecastChart({ data }: { data: ForecastChartPoint[] }) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return (
      <ChartEmptyState message="Belum ada hasil forecast. Jalankan analisis forecast terlebih dahulu." />
    );
  }

  const hasInterval = data.some((d) => d.lower !== d.upper);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(1)}jt`}
        />
        <Tooltip
          formatter={(value, name) => [
            `Rp ${Number(value).toLocaleString("id-ID")}`,
            name === "predicted" ? "Prediksi" : name === "lower" ? "Batas bawah" : "Batas atas",
          ]}
          labelFormatter={(label) => `Tanggal: ${label}`}
        />
        {hasInterval && (
          <Legend wrapperStyle={{ fontSize: 11 }} />
        )}
        {hasInterval && (
          <Line
            type="monotone"
            dataKey="upper"
            name="Batas atas"
            stroke="var(--chart-faint)"
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={!reduced}
          />
        )}
        <Line
          type="monotone"
          dataKey="predicted"
          name="Prediksi"
          stroke="var(--chart-primary)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={!reduced}
        />
        {hasInterval && (
          <Line
            type="monotone"
            dataKey="lower"
            name="Batas bawah"
            stroke="var(--chart-faint)"
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={!reduced}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
