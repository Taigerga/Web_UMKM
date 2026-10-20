"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { ChartEmptyState } from "./sales-trend-chart";

export type TopProductRow = {
  name: string;
  totalQty: number;
  totalRevenue: number;
};

/**
 * Produk terlaris berdasarkan jumlah item terjual (bukan omzet) - jumlah
 * terjual membandingkan barang padat kecil vs besar secara adil; omzetnya
 * tetap tersedia di tooltip untuk konteks keputusan stok.
 */
export function TopProductsChart({ data }: { data: TopProductRow[] }) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return <ChartEmptyState message="Belum ada penjualan produk untuk periode ini." />;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, 48 * data.length + 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, _name, entry) => {
            const row = entry?.payload as TopProductRow;
            return [
              `${Number(value).toLocaleString("id-ID")} item (omzet Rp ${row.totalRevenue.toLocaleString("id-ID")})`,
              "Terjual",
            ];
          }}
          labelFormatter={(label) => `Produk: ${label}`}
        />
        <Bar
          dataKey="totalQty"
          name="Item terjual"
          fill="var(--chart-primary)"
          radius={[0, 4, 4, 0]}
          isAnimationActive={!reduced}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
