import * as React from "react";

import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Layar kosong adalah ajakan bertindak, bukan sekadar pesan. Selalu
 * menjelaskan apa yang terjadi dan memberi langkah berikutnya.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong",
        "bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-neutral-wash text-ink-muted">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="font-display text-base font-semibold text-ink">{title}</p>
        {description ? (
          <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export type ErrorStateProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Tampilan galat dalam UI. Secretariat diberi konteks dan jalan keluar,
 * tidak pernah membuat pengguna menebak-nebak apa yang salah.
 */
export function ErrorState({
  icon,
  title,
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-critical/30",
        "bg-critical-wash px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-surface text-critical">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="font-display text-base font-semibold text-critical">{title}</p>
        {description ? (
          <p className="max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}