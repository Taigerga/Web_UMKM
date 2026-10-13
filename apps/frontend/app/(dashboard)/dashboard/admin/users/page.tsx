import type { Metadata } from "next";

import { AdminUsersPanel } from "@/components/dashboard/admin-users-panel";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = {
  title: "Pengguna — BisnisInsight",
};

/**
 * Daftar pengguna platform, khusus ADMIN.
 *
 * Membuka route ini sebagai peran lain tidak akan dialihkan oleh frontend:
 * panelnya tetap mounted, memanggil `GET /admin/users`, dan backend menjawab
 * 403 `FORBIDDEN_ROLE` karena `@Roles(Role.ADMIN)` di
 * `AdminController.listUsers`. Redirect frontend bukan pengganti penolakan
 * backend, jadi halaman ini sengaja tidak memasang guard kedua (R-39).
 */
export default function AdminUsersPage() {
  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Seluruh akun di platform. Menonaktifkan akun akan mencabut seluruh sesi aktifnya, dan akun itu tidak bisa masuk lagi sampai diaktifkan kembali."
      />
      <AdminUsersPanel />
    </>
  );
}