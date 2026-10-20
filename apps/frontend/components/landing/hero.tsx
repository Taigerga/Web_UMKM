import { Badge, ButtonLink, SampleDataBadge, Table, type TableColumn } from "@/components/ui";

type LedgerRow = {
  date: string;
  item: string;
  in: string;
  out: string;
  balance: string;
};

/**
 * Baris buku kas pada hero. Angka disusun seperti buku catatan fisik —
 * kolom rata kanan, angka tabular, saldo berjalan — karena itulah tempat
 * pemilik UMKM sudah terbiasa membaca catatannya.
 */
const LEDGER_ROWS: LedgerRow[] = [
  { date: "02 Sep", item: "Kopi bubuk 250 g", in: "1.240.000", out: "—", balance: "8.360.000" },
  { date: "02 Sep", item: "Gula aren 1 kg", in: "—", out: "640.000", balance: "7.720.000" },
  { date: "03 Sep", item: "Sedang aren 250 g", in: "1.850.000", out: "—", balance: "9.570.000" },
  { date: "03 Sep", item: "Kemasan Mika 500 pcs", in: "—", out: "525.000", balance: "9.045.000" },
];

const LEDGER_COLUMNS: Array<TableColumn<LedgerRow>> = [
  {
    key: "date",
    header: "Tanggal",
    cellClassName: "whitespace-nowrap text-ink-muted",
    render: (row) => row.date,
  },
  { key: "item", header: "Item", render: (row) => row.item },
  {
    key: "in",
    header: "Masuk",
    align: "right",
    cellClassName: "font-mono tabular-nums",
    render: (row) => (
      <span className={row.in === "—" ? "text-ink-faint" : "text-positive"}>{row.in}</span>
    ),
  },
  {
    key: "out",
    header: "Keluar",
    align: "right",
    cellClassName: "font-mono tabular-nums",
    render: (row) => (
      <span className={row.out === "—" ? "text-ink-faint" : "text-critical"}>{row.out}</span>
    ),
  },
  {
    key: "balance",
    header: "Saldo",
    align: "right",
    cellClassName: "font-mono tabular-nums",
    render: (row) => row.balance,
  },
];

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
            <a href="#faq" className="font-medium text-accent underline underline-offset-4">
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
        <div className="flex items-center justify-between border-b border-line bg-forest px-4 py-3 text-white">
          <span className="font-display text-sm font-semibold">Toko Berkah Jaya</span>
          <span className="font-mono text-xs text-accent-light">Saldo Rp 9.045.000</span>
        </div>

        <Table
          columns={LEDGER_COLUMNS}
          rows={LEDGER_ROWS}
          rowKey={(row) => `${row.date}-${row.item}`}
          minWidth="min-w-[26rem]"
        />

        <div className="flex items-center justify-between gap-3 border-t border-accent-light/40 bg-accent-wash px-4 py-3">
          <span className="text-sm font-medium text-accent">Prediksi minggu depan</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-accent">
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