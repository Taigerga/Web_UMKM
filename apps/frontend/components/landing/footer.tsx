import { NAV_LINKS } from "./section";

const PRODUCT_LINKS = [
  { href: "#fitur-ml", label: "Fitur analitik" },
  { href: "#pratinjau", label: "Pratinjau dashboard" },
  { href: "#privasi", label: "Privasi dan keamanan" },
] as const;

export function Footer() {
  return (
    <footer className="mt-auto border-t border-navy-line bg-navy-deep text-white">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
            <span className="font-display text-lg font-semibold tracking-tight">BisnisInsight</span>
            <p className="max-w-xs text-sm leading-relaxed text-navy-line">
              Analisis penjualan untuk pemilik UMKM Indonesia.
            </p>
          </div>

          <nav aria-label="Produk" className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              Produk
            </p>
            {PRODUCT_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-navy-line transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <nav aria-label="Halaman" className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              Halaman
            </p>
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-navy-line transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              Status
            </p>
            <p className="text-sm leading-relaxed text-navy-line">
              Fase 1 — fondasi. Autentikasi dan dashboard aktif sedang dibangun.
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-navy-line pt-6 text-xs text-navy-line">
          <p>
            Seluruh angka, grafik, dan hasil prediksi pada halaman ini adalah{" "}
            <strong className="font-semibold text-white">data contoh</strong> dari dataset
            sintetis. Bukan data UMKM mana pun.
          </p>
        </div>
      </div>
    </footer>
  );
}