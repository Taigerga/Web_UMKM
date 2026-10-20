"use client";

import * as React from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { ChartEmptyState } from "./sales-trend-chart";

export type SegmentChartPoint = {
  segment: string;
  customers: number;
  customerPct: number;
  revenuePct: number;
};

const SEGMENT_COLORS = ['var(--chart-primary)', 'var(--chart-teal)', 'var(--chart-secondary)', 'var(--chart-amber)', 'var(--chart-clay)', 'var(--chart-faint)'];

/**
 * Donat distribusi segmen pelanggan (RFM + K-Means per toko). Angka di
 * tooltip: jumlah pelanggan, % pelanggan, % omzet - supaya keputusan
 * fokus-retensi punya konteks kontribusi omzet per segmen.
 */
export function SegmentDonut({ data }: { data: SegmentChartPoint[] }) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return (
      <ChartEmptyState message="Belum ada hasil segmentasi. Jalankan analisis segmentasi terlebih dahulu." />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Tooltip
          formatter={(value, _name, entry) => {
            const row = entry?.payload as SegmentChartPoint;
            return [`${row.customers.toLocaleString("id-ID")} pelanggan (${row.customerPct}% pelanggan, ${row.revenuePct}% omzet)`, "Segmen"];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={data}
          dataKey="customers"
          nameKey="segment"
          innerRadius={52}
          outerRadius={92}
          paddingAngle={2}
          isAnimationActive={!reduced}
        >
          {data.map((row, index) => (
            <Cell key={row.segment} fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
