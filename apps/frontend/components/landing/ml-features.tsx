import { Boxes, Layers, ScanLine, Target, TrendingUp } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui";

import { Section } from "./section";

/**
 * Kemampuan analitik yang direncanakan. Statusnya sengaja ditulis apa adanya:
 * integrasi model belum ada di Fase 1, dan mengarang akurasi akan menyesatkan
 * pemilik toko yang memakai ini untuk mengambil keputusan stok.
 */
const CAPABILITIES = [
  {
    icon: TrendingUp,
    title: "Peramalan permintaan",
    body: "Perkiraan kebutuhan stok per produk dari riwayat penjualan, supaya pesan lebih dekat ke kebutuhan sebenarnya.",
    status: "Direncanakan Fase 3–4",
  },
  {
    icon: Target,
    title: "Deteksi anomali",
    body: "Menandai hari dan transaksi yang menyimpang dari biasanya, jadi selisih kas tidak terlewat diam-diam.",
    status: "Direncanakan Fase 3–4",
  },
  {
    icon: Boxes,
    title: "Kelompok produk",
    body: "Mengelompokkan produk yang dibeli bersama, untuk bundling dan pengaturan letak rak.",
    status: "Direncanakan Fase 3–4",
  },
  {
    icon: Layers,
    title: "Segmen pelanggan",
    body: "Membedakan pelanggan sering belanja dan jarang belanja, lalu mengarahkan promo ke kelompok yang tepat.",
    status: "Direncanakan Fase 3–4",
  },
  {
    icon: ScanLine,
    title: "Kualitas data",
    body: "Menandai baris transaksi yang tidak lengkap sebelum masuk ke perhitungan, agar kesimpulan tidak bertumpu pada data rusak.",
    status: "Direncanakan Fase 2",
  },
] as const;

export function MlFeatures() {
  return (
    <Section
      id="fitur-ml"
      eyebrow="Analitik"
      title="Lima kemampuan yang sedang dibangun"
      description="Bagian ini menjelaskan rencana produk, bukan fitur yang sudah hidup. Tidak ada angka akurasi yang ditampilkan karena belum ada model yang dilatih dan diuji pada data nyata."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((capability) => (
          <Card key={capability.title} className="flex flex-col gap-3" padding="lg">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-lg bg-accent-wash text-accent-deep"
            >
              <capability.icon className="size-5" />
            </span>
            <CardTitle>{capability.title}</CardTitle>
            <CardDescription>{capability.body}</CardDescription>
            <p className="mt-auto pt-2">
              <span className="text-xs font-medium text-ink-faint">
                {capability.status}
              </span>
            </p>
          </Card>
        ))}

        <Card variant="navy" className="flex flex-col gap-3" padding="lg">
          <CardTitle className="text-white">Akurasi model belum diukur</CardTitle>
          <CardDescription className="text-navy-line">
            Klaim seperti &ldquo;akurasi 94%&rdquo; baru bisa muncul setelah model dilatih
            pada dataset evaluasi yang kami publikasikan. Sampai itu, kami tidak
            menampilkannya.
          </CardDescription>
        </Card>
      </div>
    </Section>
  );
}