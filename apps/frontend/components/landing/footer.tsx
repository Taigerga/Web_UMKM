import { NAV_LINKS } from "./section";

const PRODUCT_LINKS = [
  { href: "#fitur-ml", label: "Fitur analitik" },
  { href: "#pratinjau", label: "Pratinjau dashboard" },
  { href: "#privasi", label: "Privasi dan keamanan" },
] as const;

export function Footer() {
  return (
    <footer className="mt-auto border-t border-forest-line bg-forest-deep text-white">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
            <span className="font-display text-lg font-semibold tracking-tight">BisnisInsight</span>
            <p className="max-w-xs text-sm leading-relaxed text-white/70">
              Analisis penjualan untuk pemilik UMKM Indonesia.
            </p>
          </div>

          <nav aria-label="Produk" className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent-light uppercase">
              Produk
            </p>
            {PRODUCT_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-forest-line transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <nav aria-label="Halaman" className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent-light uppercase">
              Halaman
            </p>
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-forest-line transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent-light uppercase">
              Status
            </p>
            <p className="text-sm leading-relaxed text-white/75">
              Dasbor analitik aktif: unggah data penjualan, baca laporan, dan
              jalankan lima model ML per toko.
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-forest-line pt-6 text-xs text-forest-line">
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