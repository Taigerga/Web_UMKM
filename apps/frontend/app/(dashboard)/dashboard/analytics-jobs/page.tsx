import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { AnalyticsJobPanel } from "@/components/dashboard/analytics-job-panel";

export const metadata: Metadata = {
  title: "Analisis ML – BisnisInsight",
};

export default function AnalyticsJobsPage() {
  return (
    <>
      <PageHeader
        title="Analisis ML"
        description="Jalankan dan pantau analisis Machine Learning."
      />
      <AnalyticsJobPanel />
    </>
  );
}
