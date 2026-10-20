import Link from "next/link";

import { ButtonLink } from "@/components/ui";

import { NAV_LINKS } from "./section";

/**
 * Navigasi atas. Sengaja tanpa menu hamburger Client Component: di lebar
 * mobile, link section disembunyikan dan hanya_calls-to-action yang tampil,
 * sementara daftar lengkap section tetap ada di footer. Menghemat JS dan
 * menghindari state UI yang harus diuji.
 */
export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-md bg-forest text-sm font-bold text-accent-light"
          >
            BI
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            BisnisInsight
          </span>
        </Link>

        <nav aria-label="Bagian halaman" className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Masuk
          </ButtonLink>
          <ButtonLink href="/register" variant="primary" size="sm">
            Buat akun
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}