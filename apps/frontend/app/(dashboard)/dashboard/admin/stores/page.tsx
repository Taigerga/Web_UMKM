import type { Metadata } from "next";

import { AdminStoresPanel } from "@/components/dashboard/admin-stores-panel";
import { PageHeader } from "@/components/dashboard/page-header";

export const metadata: Metadata = {
  title: "Toko — BisnisInsight",
};

/**
 * Direktori toko seluruh platform, khusus ADMIN.
 *
 * Yang ditampilkan hanya nama, kota, zona waktu, status, dan tanggal dibuat.
 * Omzet, produk, dan transaksi tidak muncul di sini - dan bukan karena belum
 * ada datanya, melainkan karena `GET /admin/stores` memang directory
 * platform: admin tidak otomatis jadi anggota toko orang (R-18). Menampilkan
 * metrik penjualan di halaman ini akan membuka data UMKM orang kepada siapa
 * pun yang memegang peran admin.
 */
export default function AdminStoresPage() {
  return (
    <>
      <PageHeader
        title="Toko"
        description="Direktori toko yang terdaftar di platform. Isinya identitas toko saja: data penjualan setiap toko hanya bisa dibaca oleh anggotanya sendiri."
      />
      <AdminStoresPanel />
    </>
  );
}