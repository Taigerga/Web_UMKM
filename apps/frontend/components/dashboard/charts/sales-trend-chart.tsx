"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

export type SalesTrendRow = {
  date: string;
  sales: number;
};

/**
 * Tren penjualan harian (omzet, juta rupiah).
 *
 * Area murah untuk dibaca pada deret panjang; axis-x dilonggokkan supaya
 * label tanggal tidak saling menimpa. Satuan omzet eksplisit di tooltip agar
 * "750" tak terbaca sebagai order atau item.
 */
export function SalesTrendChart({ data }: { data: SalesTrendRow[] }) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return <ChartEmptyState message="Belum ada penjualan tercatat untuk periode ini." />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(1)}jt`}
        />
        <Tooltip
          formatter={(value) => [`Rp ${(Number(value)).toLocaleString("id-ID")}`, "Omzet"]}
          labelFormatter={(label) => `Tanggal: ${label}`}
        />
        <Area
          type="monotone"
          dataKey="sales"
          name="Omzet"
          stroke="var(--chart-primary)"
          fill="url(#salesTrendFill)"
          isAnimationActive={!reduced}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Empty state bersama semua chart: pesan, bukan grafik kosong mengambang. */
export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-line bg-surface text-sm text-ink-muted">
      {message}
    </div>
  );
}
