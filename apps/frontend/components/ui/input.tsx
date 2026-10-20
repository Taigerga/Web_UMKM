import * as React from "react";

import { cn } from "@/lib/cn";

export type InputSize = "sm" | "md" | "lg";

export const inputVariants = {
  size: {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-3.5 text-[0.9375rem]",
    lg: "h-12 px-4 text-base",
  },
} as const;

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: InputSize;
  invalid?: boolean;
};

/** Kolom teks. `invalid` menambah gaya error; pesan error dikirim terpisah. */
export function Input({
  className,
  size = "md",
  invalid = false,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-lg border bg-surface text-ink",
        "placeholder:text-ink-faint",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:bg-neutral-wash disabled:text-ink-faint",
        inputVariants.size[size],
        invalid
          ? "border-critical focus-visible:outline-critical"
          : "border-line-strong hover:border-line-strong-hover focus-visible:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ className, invalid = false, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-lg border bg-surface px-3.5 py-2.5 text-[0.9375rem] text-ink",
        "placeholder:text-ink-faint transition-colors duration-150",
        invalid
          ? "border-critical focus-visible:outline-critical"
          : "border-line-strong focus-visible:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export type SelectSize = "sm" | "md" | "lg";

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: SelectSize;
};

/** Dropdown native — konsisten dengan `Input` agar form auth seragam. */
export function Select({ className, size = "md", ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-line-strong bg-surface text-ink",
        "transition-colors duration-150 focus-visible:border-accent",
        inputVariants.size[size],
        className,
      )}
      {...props}
    />
  );
}

/** Label field yang terhubung ke kontrol lewat `htmlFor`. */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-ink", className)}
      {...props}
    />
  );
}

/** Id elemen pesan galat, diturunkan dari id kontrolnya. */
export function fieldErrorId(controlId: string): string {
  return `${controlId}-error`;
}

/**
 * Pembungkus field: label + kontrol + pesan bantuan/error, dengan jarak seragam.
 *
 * `id` pesan galat DITURUNKAN dari `htmlFor` lewat {@link fieldErrorId}, bukan
 * ditulis manual oleh pemanggil. Sebelumnya elemen pesan galat tidak punya id
 * sama sekali, sementara form auth menunjuk `"email-error"` dari
 * `aria-describedby` - jadi referensinya menunjuk elemen yang tidak ada, dan
 * pembaca layar tidak pernah membacakan pesan itu sebagai bagian dari input.
 *
 * Menurunkan id dari id kontrol juga menutup kelas bug yang sama di masa depan:
 * form baru yang menentukan sendiri nama id tidak bisa lupa memakai suffix yang
 * sama dengan yang dibaca `Field`.
 */
export function Field({
  className,
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  className?: string;
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={fieldErrorId(htmlFor)}
          role="alert"
          className="text-xs font-medium text-critical"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
