/**
 * Penutup halaman. Landing sebelumnya berakhir di FAQ lalu footer, tanpa
 * satu ajakan penuh — padahal seluruh halaman sudah membangun argumen.
 * Blok gelap pendek di atas footer memangkasnya jadi satu keputusan.
 */
export function CtaBand() {
  return (
    <section aria-labelledby="cta-band-title" className="border-t border-forest-line bg-forest">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:flex-row sm:items-center sm:px-8">
        <div className="flex max-w-xl flex-col gap-2">
          <h2
            id="cta-band-title"
            className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl"
          >
            Mulai dari buku kas Anda.
          </h2>
          <p className="text-sm leading-relaxed text-white/75">
            Daftar gratis, buat toko, unggah berkas penjualan pertama — dan lihat
            angka yang selama ini hanya hidup di teks kasir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/register"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-accent-light px-6 text-[0.9375rem] font-medium text-forest transition-colors hover:bg-white"
          >
            Buat akun gratis
          </a>
          <a
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-forest-line px-6 text-[0.9375rem] font-medium text-white transition-colors hover:border-accent-light hover:text-accent-light"
          >
            Masuk
          </a>
        </div>
      </div>
    </section>
  );
}
