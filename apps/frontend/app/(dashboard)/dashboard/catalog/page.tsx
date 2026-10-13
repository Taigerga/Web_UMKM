import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { CatalogPanel } from "@/components/dashboard/catalog-panel";

export const metadata: Metadata = { title: "Katalog – BisnisInsight" };

export default function CatalogPage() {
  return (
    <>
      <PageHeader title="Katalog" description="Produk dan pelanggan toko." />
      <CatalogPanel />
    </>
  );
}
