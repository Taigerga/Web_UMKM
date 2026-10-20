import { Section } from "./section";

/**
 * Alur penggunaan. Penomoran di sini memang bermakna — ini urutan, bukan
 * hiasan — jadi angkanya dirender besar, bukan sekadar dikelilingi chip.
 */
const STEPS = [
  {
    title: "Daftarkan toko",
    body: "Buat toko, lalu undang pegawai dengan peran OWNER atau STAFF. Setiap orang hanya melihat toko yang memang ditugaskan kepadanya.",
  },
  {
    title: "Unggah data penjualan",
    body: "Berkas CSV atau Excel dari kasir, POS, atau buku kas. Kolom tanggal, produk, kuantitas, dan harga sudah punya templatenya.",
  },
  {
    title: "Periksa dan rapikan",
    body: "Baris dengan tanggal salah, produk tidak dikenal, atau harga negatif ditandai lebih dulu supaya tidak ikut dihitung.",
  },
  {
    title: "Baca dan putuskan",
    body: "Laporan kas, produk, dan pelanggan siap dibaca — termasuk peramalan stok per produk dan deteksi hari yang menyimpang.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section
      id="cara-kerja"
      eyebrow="Cara kerja"
      title="Empat langkah dari berkas ke keputusan"
      description="Dari unggah berkas sampai angka siap dibaca; validasi menandai baris bermasalah lebih dulu sebelum apa pun dihitung."
    >
      <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 border-t-2 border-line-strong pt-5"
          >
            <span
              aria-hidden="true"
              className="font-display text-4xl font-semibold tracking-tight text-accent/35"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
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
