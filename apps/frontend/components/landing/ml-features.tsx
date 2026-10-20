import { Boxes, Layers, ScanLine, Target } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui";

import { Section } from "./section";

/**
 * Kemampuan analitik yang sudah berjalan di dasbor. Statusnya tetap
 * ditulis apa adanya: kelima model aktif per toko, tetapi klaim akurasi
 * tidak ditampilkan sebelum model diuji pada dataset evaluasi publik —
 * mengarang angka akan menyesatkan pemilik toko yang memakai hasil ini
 * untuk mengambil keputusan stok.
 */
const CAPABILITIES = [
  {
    icon: Target,
    title: "Deteksi anomali",
    body: "Menandai hari dan transaksi yang menyimpang dari biasanya, jadi selisih kas tidak terlewat diam-diam.",
  },
  {
    icon: Boxes,
    title: "Kelompok produk",
    body: "Produk yang sering dibeli bersama dikelompokkan, untuk bundling dan pengaturan letak rak.",
  },
  {
    icon: Layers,
    title: "Segmen pelanggan",
    body: "Pelanggan sering belanja dan jarang belanja dipisah berdasarkan tingkat frekuensi, sehingga promo diarahkan ke kelompok yang tepat.",
  },
  {
    icon: ScanLine,
    title: "Kualitas data",
    body: "Baris transaksi yang tidak lengkap ditandai sebelum masuk ke perhitungan, agar kesimpulan tidak bertumpu pada data rusak.",
  },
] as const;

export function MlFeatures() {
  return (
    <Section
      id="fitur-ml"
      eyebrow="Analitik"
      title="Lima kemampuan analitik yang sudah aktif"
      description="Kelima model berjalan per toko: data yang Anda unggah langsung dihitung, dan hasilnya tampil sebagai grafik yang bisa dibaca. Kami tidak menampilkan klaim akurasi sebelum model diuji pada dataset evaluasi yang dipublikasikan."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/*
          Tangkai: kartu peramalan membentang dua kolom dan memakai grafik
          mini berlabel data contoh; empat kemampuan lain di bawahnya.
        */}
        <Card className="flex flex-col gap-3 md:col-span-2" padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-md flex flex-col gap-3">
              <CardTitle>Peramalan permintaan</CardTitle>
              <CardDescription>
                Perkiraan kebutuhan stok per produk dari riwayat penjualan, dengan
                rentang ketidakpastian yang terlihat — supaya pesan lebih dekat ke
                kebutuhan sebenarnya.
              </CardDescription>
              <span className="text-xs font-medium text-positive">
                Aktif di dasbor
              </span>
            </div>
            <ForecastMini />
          </div>
        </Card>

        {CAPABILITIES.map((capability) => (
          <Card key={capability.title} className="flex flex-col gap-3" padding="lg">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-lg bg-accent-wash text-accent"
            >
              <capability.icon className="size-5" />
            </span>
            <CardTitle>{capability.title}</CardTitle>
            <CardDescription>{capability.body}</CardDescription>
            <p className="mt-auto pt-2">
              <span className="text-xs font-medium text-positive">
                Aktif di dasbor
              </span>
            </p>
          </Card>
        ))}

        <Card
          variant="forest"
          className="flex flex-col gap-3 md:col-span-2 lg:col-span-3"
          padding="lg"
        >
          <CardTitle className="text-white">Cara membaca hasil model</CardTitle>
          <CardDescription className="text-white/75">
            Grafik peramalan menampilkan rentang ketidakpastian, bukan angka tunggal.
            Angka keputusan baru lebih pasti setelah model diuji pada dataset
            evaluasi yang kami publikasikan. Sampai itu, kami tidak menampilkan
            klaim akurasi apa pun.
          </CardDescription>
        </Card>
      </div>
    </Section>
  );
}

/**
 * Grafik mini ilustrasi: garis peramalan (zaitun) dengan rentang
 * ketidakpastian (sage). Murni SVG statis berlabel data contoh — bukan
 * keluaran model, sehingga tidak menjanjikan akurasi apa pun.
 */
function ForecastMini() {
  const points = [
    { x: 4, y: 34 },
    { x: 46, y: 28 },
    { x: 88, y: 30 },
    { x: 130, y: 22 },
    { x: 172, y: 16 },
  ];
  const upper = [
    { x: 88, y: 22 },
    { x: 130, y: 11 },
    { x: 172, y: 3 },
  ];
  const lower = [
    { x: 88, y: 38 },
    { x: 130, y: 33 },
    { x: 172, y: 29 },
  ];
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const band = [
    "M88 22",
    ...upper.slice(1).map((p) => `L${p.x} ${p.y}`),
    ...[...lower].reverse().map((p) => `L${p.x} ${p.y}`),
    "Z",
  ].join(" ");
  const history = points.slice(0, 4);

  return (
    <svg
      viewBox="0 0 180 48"
      className="h-24 w-48 sm:h-28 sm:w-56"
      role="img"
      aria-label="Ilustrasi garis peramalan dengan rentang ketidakpastian"
    >
      <path d={band} fill="var(--chart-secondary)" opacity="0.45" />
      <path d={line} fill="none" stroke="var(--chart-primary)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Tanda batas riwayat vs peramalan */}
      <line x1="88" y1="4" x2="88" y2="46" stroke="var(--chart-faint)" strokeWidth="1" strokeDasharray="3 3" />
      {history.map((p) => (
        <circle key={p.x} cx={p.x} cy={p.y} r="2.4" fill="var(--chart-primary)" />
      ))}
    </svg>
  );
}
