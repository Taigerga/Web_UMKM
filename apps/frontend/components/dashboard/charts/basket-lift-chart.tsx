"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
import { ChartEmptyState } from "./sales-trend-chart";

export type BasketChartPoint = {
  label: string;
  lift: number;
  support: number;
  confidence: number;
};

/**
 * Skor lift aturan asosiasi (FP-Growth per toko), horizontal bar.
 * Garis referensi lift = 1: di atas garis berarti kemunculan bersama lebih
 * kuat dari kebetulan. Detail support/confidence di tooltip; asosiasi bukan
 * bukti sebab-akibat (PROMT §10.3).
 */
export function BasketLiftChart({ data }: { data: BasketChartPoint[] }) {
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) {
    return (
      <ChartEmptyState message="Belum ada aturan asosiasi pada volume transaksi saat ini." />
    );
  }

  const maxLift = Math.max(...data.map((d) => d.lift));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, 44 * data.length + 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, Number((maxLift * 1.15).toFixed(2))]} />
        <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, _name, entry) => {
            const row = entry?.payload as BasketChartPoint;
            return [
              `lift ${row.lift.toFixed(2)} | support ${(row.support * 100).toFixed(1)}% | confidence ${(row.confidence * 100).toFixed(1)}%`,
              "Aturan",
            ];
          }}
        />
        <ReferenceLine x={1} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "lift=1", fontSize: 10, position: "insideBottomRight" }} />
        <Bar
          dataKey="lift"
          name="Lift"
          fill="#0891b2"
          radius={[0, 4, 4, 0]}
          isAnimationActive={!reduced}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
