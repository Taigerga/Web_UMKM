import type { Metadata } from "next";

import { AdminOverviewPanel } from "@/components/dashboard/admin-overview-panel";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = {
  title: "Ringkasan platform — BisnisInsight",
};

/**
 * Beranda admin - tujuan redirect untuk peran `ADMIN`.
 *
 * Halaman ini bukan penjaga akses. Perannya menentukan apa yang tampil di
 * sidebar; siapa pun yang membukanya langsung akan tetap ditolak API-nya:
 * `GET /admin/users` dan `GET /admin/stores` dijaga `@Roles(Role.ADMIN)`,
 * jadi jawabannya 403 `FORBIDDEN_ROLE` dari backend - bukan halaman kosong
 * yang menyamar sebagai "tidak ada data" (R-39).
 */
export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader
        title="Ringkasan platform"
        description="Sekilas kondisi platform: siapa saja yang terdaftar, dan toko mana yang ada. Omzet, status model, dan audit log menyusul setelah endpoint-nya tersedia."
      />
      <AdminOverviewPanel />
    </>
  );
}