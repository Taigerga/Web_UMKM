"use client";

import * as React from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { ChartEmptyState } from "./sales-trend-chart";

export type ChurnChartPoint = {
  risk: string;
  count: number;
};

const RISK_COLORS: Record<string, string> = {
  Low: "var(--chart-green)",
  Medium: "var(--chart-amber)",
  High: "var(--chart-red)",
};

/**
 * Donat kategori risiko churn. Definisi churn dan ambangnya dibawa di tooltip
 * metadata (lihat panel) - donat ini memunculkan jumlah, bukan alasan.
 */
export function ChurnDonut({ data }: { data: ChurnChartPoint[] }) {
  const reduced = usePrefersReducedMotion();
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <ChartEmptyState message="Belum ada hasil prediksi churn. Jalankan analisis churn terlebih dahulu." />
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Tooltip
          formatter={(value, name) => [
            `${Number(value).toLocaleString("id-ID")} pelanggan (${((Number(value) / total) * 100).toFixed(1)}%)`,
            `Risiko ${name}`,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={data}
          dataKey="count"
          nameKey="risk"
          innerRadius={52}
          outerRadius={92}
          paddingAngle={2}
          isAnimationActive={!reduced}
        >
          {data
            .filter((d) => d.count > 0)
            .map((row) => (
              <Cell key={row.risk} fill={RISK_COLORS[row.risk] ?? "var(--chart-faint)"} />
            ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
