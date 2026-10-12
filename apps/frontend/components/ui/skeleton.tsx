import * as React from "react";

import { cn } from "@/lib/cn";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "line" | "block" | "circle";
};

/**
 * Placeholder saat data dimuat. Dekoratif secara semantik — disembunyikan
 * dari pembaca layar agar yang terbaca adalah konteks, bukan "memuat".
 */
export function Skeleton({ className, variant = "line", ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-neutral-wash",
        variant === "line" && "h-4 w-full rounded",
        variant === "block" && "h-24 w-full rounded-[var(--radius-card)]",
        variant === "circle" && "size-10 rounded-full",
        className,
      )}
      {...props}
    />
  );
}

/** Sekeleton tabel: header + N baris, untuk menjaga tinggi halaman stabil. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)} aria-hidden="true">
      <Skeleton variant="line" className="h-3 w-32" />
      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4">
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton
                key={columnIndex}
                variant="line"
                className={cn(
                  "h-3.5",
                  columnIndex === 0 ? "flex-[2]" : "flex-1",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}