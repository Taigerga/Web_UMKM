import { Check } from "lucide-react";

import { Badge, Card, CardDescription, CardTitle } from "@/components/ui";

import { Section } from "./section";

/**
 * Manfaat ditulis sebagai perubahan nyata pada pekerjaan pemilik, bukan
 * sebagai klaim performa. Tidak ada angka penghematan atau pertumbuhan karena
 * tidak ada data pengguna untuk menopangnya.
 *
 * Setiap manfaat membawa `status` yang mengikuti kosakata `ml-features.tsx`.
 * Ini wajib: tanpa penanda, kalimat seperti "tampilan berbeda sesuai peran"
 * akan terbaca sebagai kemampuan yang sudah hidup, padahal halaman ber-role
 * belum dibangun. benefits yang tidak ada status-nya adalah janji yang belum
 * ditepati.
 */
const BENEFITS = [
  {
    title: "Tidak perlu spreadsheet baru",
    body: "Satu laporan untuk kas, produk, dan pelanggan, menggantikan berkasnya tersebar di beberapa aplikasi.",
    status: "Direncanakan Fase 2",
  },
  {
    title: "Stok tidak lagi menebak",
    body: "Pola penjualan membantu memutuskan kapan pesan, berapa banyak, dan produk mana yang diam.",
    status: "Direncanakan Fase 3–4",
  },
  {
    title: "Selisih kas kelihatan cepat",
    body: "Transaksi yang menyimpang ditandai, sehingga selisih tidak baru terasa saat tutup buku.",
    status: "Direncanakan Fase 3–4",
  },
  {
    title: "Bisa dibuka tim",
    body: "Pemilik dan pegawai sama-sama hanya melihat toko yang memang ditugaskan kepadanya. Tampilan berbeda per peran menyusul.",
    status: "Akses per toko: Fase 1",
  },
] as const;

export function Benefits() {
  return (
    <Section
      id="manfaat"
      tone="surface"
      eyebrow="Manfaat"
      title="Dibuat untuk kenyataan pembukuan warung, bukan demo korporat"
      description="Manfaat di bawah ditulis sebagai tujuan produk. Yang mana yang sudah berjalan dan yang mana yang masih direncanakan ditandai satu per satu."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <Card key={benefit.title} className="flex flex-col gap-3" padding="lg">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-positive-wash text-positive"
              >
                <Check className="size-3.5" />
              </span>
              <CardTitle>{benefit.title}</CardTitle>
            </div>
            <CardDescription>{benefit.body}</CardDescription>
            <p className="mt-auto pt-2">
              <Badge variant="caution" size="sm">
                {benefit.status}
              </Badge>
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}