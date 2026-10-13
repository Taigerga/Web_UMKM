import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { StoresPanel } from "@/components/dashboard/stores-panel";

export const metadata: Metadata = {
  title: "Toko — BisnisInsight",
};

/**
 * Halaman toko milik user.
 *
 * Halaman yang SAMA untuk OWNER dan STAFF. Perbedaannya ada di dalam
 * `StoresPanel`: form ubah nama/kota dirender hanya untuk OWNER toko itu,
 * dan bagi STAFF halaman ini sepenuhnya read-only.
 *
 * Tidak ada satu pun fetch di file ini. `StoresPanel` adalah Client Component
 * yang memanggil backend langsung dari peramban - itu jalur yang R-7 mewajibkan
 * untuk data tenant, dan halaman ini tidak punya cache yang bisa menyimpan
 * toko milik satu pengguna untuk dibaca pengguna lain.
 */
export default function StoresPage() {
  return (
    <>
      <PageHeader
        title="Toko & Tim"
        description="Toko yang bisa Anda akses beserta anggotanya. Daftar ini berasal dari keanggotaan toko Anda sendiri di server, jadi tidak ada toko orang lain yang ikut terlihat di sini."
      />
      <StoresPanel />
    </>
  );
}