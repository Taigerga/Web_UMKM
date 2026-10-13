import Link from "next/link";

/**
 * Kerangka yang dipakai bersama oleh halaman masuk dan pendaftaran.
 *
 * Dipisah dari `app/` supaya kedua halaman benar-benar identik di bagian yang
 * dilihat pengguna: kartu yang sama, jarak yang sama, header yang sama. Kalau
 * kerangka ini diduplikasi di dua file, mereka akan mulai berbeda begitu ada
 * satu perubahan desain, dan perbedaannya baru ketahuan saat dilihat berdampingan.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-md bg-navy text-sm font-bold text-accent"
          >
            BI
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            BisnisInsight
          </span>
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card sm:p-8">
        {children}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
        Dengan masuk, Anda setuju memproses data penjualan toko Anda untuk
        menghasilkan laporan.
      </p>
    </div>
  );
}

/**
 * Placeholder selagi form di-stream.
 *
 * Tingginya disengaja: tanpa placeholder, kartu akan menyusut ke tinggi
 * heading lalu melompat ke tinggi form, dan pergeseran layout itu terbaca
 * sebagai kedipan di halaman yang sedang dibaca pengguna.
 */
export function AuthFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="h-11 w-full rounded-lg bg-neutral-wash" />
      <div className="h-11 w-full rounded-lg bg-neutral-wash" />
      <div className="h-12 w-full rounded-lg bg-neutral-wash" />
    </div>
  );
}
