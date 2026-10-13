import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { DataPanel } from "@/components/dashboard/data-panel";

export const metadata: Metadata = {
  title: "Data – BisnisInsight",
};

export default function DataPage() {
  return (
    <>
      <PageHeader
        title="Data Toko"
        description="Unggah, validasi, commit, atau rollback data toko."
      />
      <DataPanel />
    </>
  );
}
