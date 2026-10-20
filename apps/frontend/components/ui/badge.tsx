import * as React from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "positive"
  | "caution"
  | "critical"
  | "forest";

export type BadgeSize = "sm" | "md";

export const badgeVariants = {
  variant: {
    neutral: "bg-neutral-wash text-ink-muted border-line-strong",
    accent: "bg-accent-wash text-accent border-accent/40",
    positive: "bg-positive-wash text-positive border-positive/30",
    caution: "bg-caution-wash text-caution border-caution/30",
    critical: "bg-critical-wash text-critical border-critical/30",
    forest: "bg-forest text-white border-forest",
  },
  size: {
    sm: "h-5 px-2 text-[0.6875rem]",
    md: "h-6 px-2.5 text-xs",
  },
} as const;

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
};

/** Label status. Selalu `inline-flex` supaya tidak menambah tinggi baris. */
export function Badge({
  className,
  variant = "neutral",
  size = "md",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        badgeVariants.variant[variant],
        badgeVariants.size[size],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Label wajib untuk setiap angka, grafik, dan hasil prediksi di konten publik.
 * Dipakai sebagai satu-satunya cara menampilkan data ilustrasi, supaya
 * "Data contoh" tidak bisa terlupa pada figure baru.
 */
export function SampleDataBadge({
  className,
  label = "Data contoh",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { label?: string }) {
  return (
    <span
      data-testid="sample-data-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded border border-caution/40 bg-caution-wash",
        "px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-caution",
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}