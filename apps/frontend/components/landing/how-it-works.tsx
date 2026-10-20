import { FileSpreadsheet, ShieldCheck, Store, Upload } from "lucide-react";

import { Section } from "./section";

/**
 * Alur penggunaan. Penomoran di sini memang bermakna — ini urutan, bukan
 * hiasan — jadi memakai penanda langkah tidak akan bercampur dengan
 * penomoran dekoratif.
 */
const STEPS = [
  {
    icon: Store,
    title: "Daftarkan toko",
    body: "Buat toko, lalu undang pegawai dengan peran OWNER atau STAFF. Setiap orang hanya melihat toko yang memang ditugaskan kepadanya.",
  },
  {
    icon: Upload,
    title: "Unggah data penjualan",
    body: "Berkas CSV atau Excel dari kasir, POS, atau buku kas. Kolom tanggal, produk, kuantitas, dan harga sudah punya templatenya.",
  },
  {
    icon: FileSpreadsheet,
    title: "Periksa dan rapikan",
    body: "Baris dengan tanggal salah, produk tidak dikenal, atau harga negatif ditandai lebih dulu supaya tidak ikut dihitung.",
  },
  {
    icon: ShieldCheck,
    title: "Baca dan putuskan",
    body: "Laporan kas, produk, dan pelanggan siap dibaca. Peramalan stok menyusul setelah model terhubung pada Fase 3–4.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section
      id="cara-kerja"
      eyebrow="Cara kerja"
      title="Empat langkah dari berkas ke keputusan"
      description="Unggah data dan validasi masuk dalam Fase 2. Yang bisa Anda lakukan sekarang adalah membaca pratinjau dan mendaftar untuk masuk ke antrean akses."
    >
      <ol className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 bg-surface p-6">
            <div className="flex items-center justify-between">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-lg bg-forest text-accent-light"
              >
                <step.icon className="size-4" />
              </span>
              <span className="font-mono text-xs text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              {step.title}
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}