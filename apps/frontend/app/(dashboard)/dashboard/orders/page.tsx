import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrdersPanel } from "@/components/dashboard/orders-panel";

export const metadata: Metadata = { title: "Order Manual – BisnisInsight" };

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Order Manual" description="Input order manual oleh pengguna." />
      <OrdersPanel />
    </>
  );
}
