import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { ProfilePanel } from "@/components/dashboard/profile-panel";

export const metadata: Metadata = {
  title: "Profil — BisnisInsight",
};

/**
 * Profil akun yang sedang login.
 *
 * Untuk ketiga peran. Isinya dibaca dari `GET /auth/me`, jadi daftar toko di
 * halaman ini sama dengan yang dipakai backend untuk menilai akses - bukan
 * ringkasan yang dibuat di frontend.
 */
export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profil"
        description="Identitas akun dan toko yang bisa Anda akses. Data ini hanya bisa dibaca: backend belum menyediakan endpoint untuk mengubahnya."
      />
      <ProfilePanel />
    </>
  );
}