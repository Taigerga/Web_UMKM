import type { Route } from "next";
import Link from "next/link";
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
 * Pakai `next/link`, bukan `<a>`. Navigasi antar-route di aplikasi ini
 * adalah navigasi peramban: memuat ulang dokumen untuk pindah dari landing ke
 * halaman masuk membuang seluruh bundle yang sudah diunduh, dan di koneksi
 * seluler itu perbedaan yang terasa.
 *
 * Generic `<T extends string>` di `Route<T>` adalah pola dari dokumentasi
 * Next.js untuk komponen yang membungkus `Link`: typedRoutes memvalidasi
 * string literal, tapi `href` yang diteruskan sebagai prop generik perlu
 * diturunkan tipe Route-nya sendiri supaya pemanggil tetap mendapat
 * pemeriksaan yang sama.
 *
 * `href` menerima `Route` maupun anchor halaman (`#faq`) karena keduanya
 * dipakai di landing: `typedRoutes` sengaja tidak ikut memvalidasi anchor,
 * yang bukan route.
 */
export function ButtonLink<T extends string>({
  className,
  variant = "primary",
  size = "md",
  fullWidth = false,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof Link<T>>, "href"> & {
  href: Route<T> | `#${string}`;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150",
        buttonVariants.variant[variant],
        buttonVariants.size[size],
        fullWidth && "w-full",
        className,
      )}
      {...(props as React.ComponentPropsWithoutRef<typeof Link>)}
    />
  );
}
