import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";

export const metadata: Metadata = {
  title: "Analytics – BisnisInsight",
};

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Ringkasan penjualan, tren, dan insights bisnis Anda."
      />
      <AnalyticsPanel />
    </>
  );
}
