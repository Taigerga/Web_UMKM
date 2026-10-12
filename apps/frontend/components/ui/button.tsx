import * as React from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = {
  variant: {
    primary:
      "bg-navy text-white hover:bg-navy-soft active:bg-navy-deep border border-transparent",
    accent:
      "bg-accent-deep text-white hover:bg-[#0b6076] border border-transparent",
    outline:
      "border border-line-strong bg-surface text-navy hover:border-navy hover:bg-neutral-wash",
    ghost: "border border-transparent text-navy hover:bg-neutral-wash",
    danger:
      "bg-critical text-white hover:bg-[#922017] border border-transparent",
  },
  size: {
    sm: "h-9 px-3 text-sm gap-1.5",
    md: "h-11 px-5 text-[0.9375rem] gap-2",
    lg: "h-12 px-6 text-base gap-2",
  },
} as const;

export type ButtonVariant = keyof typeof buttonVariants.variant;
export type ButtonSize = keyof typeof buttonVariants.size;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

/**
 * Tombol aksi utama. `variant` menentukan warna, `size` menentukan tinggi
 * dan padding — keduanya konsisten di seluruh aplikasi.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  fullWidth = false,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-55",
        buttonVariants.variant[variant],
        buttonVariants.size[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Varian tautan yang terlihat seperti tombol.
 *
 * Sengaja memakai `<a>`, bukan `next/link`: target-nya adalah route autentikasi
 * (`/login`, `/register`) yang belum ada di Fase 1, dan `typedRoutes` akan
 * menolak `href` ke route yang belum terdaftar. Pola button-to-link untuk route
 * yang belum ada akan diperbarui ke `next/link` di Task 9.
 */
export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  fullWidth = false,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150",
        buttonVariants.variant[variant],
        buttonVariants.size[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}