import { Check } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui";

import { Section } from "./section";

/**
 * Manfaat ditulis sebagai perubahan nyata pada pekerjaan pemilik, bukan
 * sebagai klaim performa. Tidak ada angka penghematan atau pertumbuhan
 * karena tidak ada data pengguna untuk menopangnya.
 */
const BENEFITS = [
  {
    title: "Tidak perlu spreadsheet baru",
    body: "Satu laporan untuk kas, produk, dan pelanggan, menggantikan berkasnya tersebar di beberapa aplikasi.",
  },
  {
    title: "Stok tidak lagi menebak",
    body: "Per-pattern penjualan membantu memutuskan kapan pesan, berapa banyak, dan produk mana yang diam.",
  },
  {
    title: "Selisih kas kelihatan cepat",
    body: "Transaksi yang menyimpang ditandai, sehingga selisih tidak baru terasa saat tutup buku.",
  },
  {
    title: "Bisa dibuka tim",
    body: "Pemilik, pegawai, dan admin punya tampilan berbeda sesuai peran mereka di toko.",
  },
] as const;

export function Benefits() {
  return (
    <Section
      id="manfaat"
      tone="surface"
      eyebrow="Manfaat"
      title="Dibuat untuk kenyataan pembukuan warung, bukan demo korporat"
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
          </Card>
        ))}
      </div>
    </Section>
  );
}