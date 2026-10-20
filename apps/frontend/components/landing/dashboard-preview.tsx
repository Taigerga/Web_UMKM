import { ArrowUpRight, Package, Target, TrendingUp, Wallet } from "lucide-react";

import { Badge, Table, type TableColumn } from "@/components/ui";
import { cn } from "@/lib/cn";

import { SampleFigure, Section } from "./section";

/** Angka KPI ilustrasi beserta arah perubahannya. */
const KPIS = [
  {
    label: "Omzet bulan ini",
    value: "Rp 128,4 jt",
    delta: "+12,4%",
    icon: Wallet,
    direction: "up",
  },
  {
    label: "Produk terlaris",
    value: "Kopi bubuk 250 g",
    delta: "312 unit",
    icon: Package,
    direction: "flat",
  },
  {
    label: "Rata-rata per transaksi",
    value: "Rp 47.800",
    delta: "+3,1%",
    icon: TrendingUp,
    direction: "up",
  },
  {
    label: "Perkiraan stok habis",
    value: "6 hari",
    delta: "Kopi bubuk",
    icon: Target,
    direction: "warn",
  },
] as const;

/** Penjualan mingguan dalam juta rupiah. */
const WEEKLY = [
  { label: "Minggu 1", value: 24.1 },
  { label: "Minggu 2", value: 28.7 },
  { label: "Minggu 3", value: 26.3 },
  { label: "Minggu 4", value: 31.2 },
] as const;

const MAX_WEEKLY = 35;

type TopProduct = {
  name: string;
  sold: string;
  revenue: string;
  stock: string;
};

const TOP_PRODUCTS: TopProduct[] = [
  { name: "Kopi bubuk 250 g", sold: "312", revenue: "Rp 24,1 jt", stock: "42" },
  { name: "Gula aren 1 kg", sold: "186", revenue: "Rp 9,3 jt", stock: "18" },
  { name: "Sedang aren 250 g", sold: "141", revenue: "Rp 8,5 jt", stock: "9" },
  { name: "Teh melati 30 g", sold: "128", revenue: "Rp 4,2 jt", stock: "65" },
  { name: "Krimer 250 sachet", sold: "96", revenue: "Rp 3,8 jt", stock: "27" },
];

const TOP_PRODUCT_COLUMNS: Array<TableColumn<TopProduct>> = [
  { key: "name", header: "Produk", render: (row) => row.name },
  {
    key: "sold",
    header: "Terjual",
    align: "right",
    cellClassName: "font-mono tabular-nums",
    render: (row) => row.sold,
  },
  {
    key: "revenue",
    header: "Omzet",
    align: "right",
    cellClassName: "font-mono tabular-nums",
    render: (row) => row.revenue,
  },
  {
    key: "stock",
    header: "Stok",
    align: "right",
    cellClassName: "font-mono tabular-nums text-ink-muted",
    render: (row) => row.stock,
  },
];

export function DashboardPreview() {
  return (
    <Section
      id="pratinjau"
      tone="surface"
      eyebrow="Pratinjau"
      title="Satu layar untuk kas, produk, dan pola belanja"
      description="Semua angka di bagian ini berasal dari dataset sintetis. Bentuk layouthnya akan berubah setelah integrasi analitik dan model pada Fase 3–4; yang ditampilkan sekarang adalah arah produk, bukan keluaran model yang sudah jadi."
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SampleFigure
          note="Omzet mingguan, juta rupiah"
          className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <div className="flex h-52 gap-3 sm:gap-5">
            {WEEKLY.map((week) => (
              <div key={week.label} className="flex h-full flex-1 flex-col items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-ink-muted">
                  {week.value.toFixed(1)}
                </span>
                {/* Wrapper ini yang memberi tinggi definite, sehingga persentase
                    pada batang terukur terhadap area grafik, bukan terhadap 0. */}
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-forest"
                    style={{ height: `${(week.value / MAX_WEEKLY) * 100}%` }}
                  />
                </div>
                <span className="text-center text-xs text-ink-muted">{week.label}</span>
              </div>
            ))}
          </div>
        </SampleFigure>

        <SampleFigure
          note="Ringkasan metrik toko"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"
        >
          {KPIS.map((kpi) => (
            <KpiTile key={kpi.label} {...kpi} />
          ))}
        </SampleFigure>
      </div>

      <SampleFigure
        className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-1 shadow-card"
        note="Lima produk teratas, dataset sintetis"
      >
        <Table
          columns={TOP_PRODUCT_COLUMNS}
          rows={TOP_PRODUCTS}
          rowKey={(row) => row.name}
          minWidth="min-w-[30rem]"
        />
      </SampleFigure>
    </Section>
  );
}

function KpiTile({
  label,
  value,
  delta,
  icon: Icon,
  direction,
}: (typeof KPIS)[number]) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-col items-start gap-1">
        <span className="text-sm text-ink-muted">{label}</span>
        <span className="font-display text-xl font-semibold tracking-tight text-ink">
          {value}
        </span>
        <Badge
          variant={
            direction === "warn" ? "caution" : direction === "up" ? "positive" : "neutral"
          }
          size="sm"
        >
          {direction === "up" ? <ArrowUpRight aria-hidden="true" className="size-3" /> : null}
          {delta}
        </Badge>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          direction === "warn"
            ? "bg-caution-wash text-caution"
            : "bg-accent-wash text-accent",
        )}
      >
        <Icon className="size-4" />
      </span>
    </div>
  );
}