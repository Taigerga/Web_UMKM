import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportsPanel } from "@/components/dashboard/reports-panel";

export const metadata: Metadata = {
  title: "Laporan – BisnisInsight",
};

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Laporan"
        description="Export laporan penjualan, pesanan, dan forecast."
      />
      <ReportsPanel />
    </>
  );
}
