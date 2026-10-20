import { Section } from "./section";

/**
 * Manfaat ditulis sebagai perubahan nyata pada pekerjaan pemilik, bukan
 * sebagai klaim performa. Tidak ada angka penghematan atau pertumbuhan
 * karena tidak ada data pengguna untuk menopangnya.
 */
const BENEFITS = [
  {
    title: "Tidak perlu spreadsheet baru",
    body: "Satu laporan untuk kas, produk, dan pelanggan, untuk berkas yang selama ini tersebar di beberapa aplikasi.",
  },
  {
    title: "Stok tidak lagi menebak",
    body: "Peramalan per produk dan pola kelompok belanja membantu memutuskan kapan pesan, berapa banyak, dan produk mana yang diam.",
  },
  {
    title: "Selisih kas kelihatan cepat",
    body: "Hari dan transaksi yang menyimpang ditandai, sehingga selisih tidak baru terasa saat tutup buku.",
  },
  {
    title: "Bisa dibuka tim",
    body: "Undang pegawai dengan peran STAFF: dia bisa menginput penjualan harian dan membaca laporan toko itu saja. Mutasi data tetap milik pemilik.",
  },
] as const;

export function Benefits() {
  return (
    <Section
      id="manfaat"
      tone="surface"
      eyebrow="Manfaat"
      title="Dibuat untuk kenyataan pembukuan warung, bukan demo korporat"
      description="Empat perubahan kerja yang dituju produk ini — semuanya sudah bisa Anda coba langsung di dasbor."
    >
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="flex flex-col gap-2 border-t border-line pt-5">
            <p className="font-display text-lg font-semibold tracking-tight text-ink">
              {benefit.title}
            </p>
            <p className="max-w-md text-sm leading-relaxed text-ink-muted">
              {benefit.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}
