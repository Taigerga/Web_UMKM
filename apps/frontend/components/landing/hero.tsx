import { Badge, ButtonLink, SampleDataBadge } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Baris buku kas pada hero. Angka disusun seperti buku catatan fisik —
 * kolom rata kanan, angka tabular, saldo berjalan — karena itulah tempat
 * pemilik UMKM sudah terbiasa membaca Gautannya.
 */
const LEDGER_ROWS = [
  { date: "02 Sep", item: "Kopi bubuk 250 g", in: "1.240.000", out: "—", balance: "8.360.000" },
  { date: "02 Sep", item: "Gula aren 1 kg", in: "—", out: "640.000", balance: "7.720.000" },
  { date: "03 Sep", item: "Sedang 250 g", in: "1.850.000", out: "—", balance: "9.570.000" },
  { date: "03 Sep", item: "Kemasan Mika 500 pcs", in: "—", out: "525.000", balance: "9.045.000" },
] as const;

export function Hero() {
  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-28">
        <div className="flex min-w-0 flex-col items-start gap-6">
          <Badge variant="accent" size="md">
            Dibangun untuk UMKM Indonesia
          </Badge>

          <h1 className="font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Data penjualan Anda sudah tercatat. tinggal dibaca.
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Catatan penjualan tersebar di buku kas, WhatsApp, dan kasir. BisnisInsight
            menyatukannya jadi satu laporan yang bisa Anda pakai untuk memutuskan stok,
            harga, dan jam buka toko.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/register" variant="primary" size="lg">
              Buat akun gratis
            </ButtonLink>
            <ButtonLink href="#pratinjau" variant="outline" size="lg">
              Lihat pratinjau
            </ButtonLink>
          </div>

          <p className="text-sm text-ink-muted">
            Pendaftaran dibuka bertahap pada Fase 1.{" "}
            <a href="#faq" className="font-medium text-accent-deep underline underline-offset-4">
              Baca detailnya
            </a>
            .
          </p>
        </div>

        <HeroLedger />
      </div>
    </section>
  );
}

/**
 * Pratinjau buku kas. Semua angka berasal dari dataset sintetis dan diberi
 * label "Data contoh" satu kali untuk keseluruhan tabel — berulanginya label
 * di tiap sel akan membuat tabel sulit dibaca tanpa menambah kejelasan.
 */
function HeroLedger() {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold text-ink">Buku kas September</figcaption>
        <div className="flex items-center gap-2">
          <SampleDataBadge />
          <span className="text-xs text-ink-muted">dataset sintetis</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-lift">
        <div className="flex items-center justify-between border-b border-line bg-navy px-4 py-3 text-white">
          <span className="font-display text-sm font-semibold">Toko Berkah Jaya</span>
          <span className="font-mono text-xs text-accent">Saldo Rp 9.045.000</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-neutral-wash">
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-ink-muted">
                  Tanggal
                </th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-ink-muted">
                  Item
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-xs font-medium text-ink-muted"
                >
                  Masuk
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-xs font-medium text-ink-muted"
                >
                  Keluar
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-xs font-medium text-ink-muted"
                >
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              {LEDGER_ROWS.map((row) => (
                <tr key={`${row.date}-${row.item}`} className="border-b border-line last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{row.date}</td>
                  <td className="px-4 py-2.5 text-ink">{row.item}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono tabular-nums",
                      row.in === "—" ? "text-ink-faint" : "text-positive",
                    )}
                  >
                    {row.in}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono tabular-nums",
                      row.out === "—" ? "text-ink-faint" : "text-critical",
                    )}
                  >
                    {row.out}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                    {row.balance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-accent/40 bg-accent-wash px-4 py-3">
          <span className="text-sm font-medium text-accent-deep">Prediksi minggu depan</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-accent-deep">
            Rp 10.320.000
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-muted">
        Nama produk dan kota di seluruh halaman ini dibuat untuk keperluan demonstrasi.
      </p>
    </figure>
  );
}