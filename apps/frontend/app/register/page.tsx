import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormSkeleton, AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Buat akun — BisnisInsight",
  description:
    "Daftar akun BisnisInsight gratis untuk mulai membaca laporan penjualan toko Anda.",
};

/**
 * Halaman pendaftaran.
 *
 * Server Component yang tidak fetching apa pun, dengan alasan yang sama seperti
 * `/login`: state auth tidak boleh diambil di server dan ikut tersimpan di shell
 * yang dilayani ulang ke banyak permintaan (R-34).
 *
 * Pendaftaran mengembalikan sesi penuh, jadi setelah berhasil form langsung
 *_replace_ ke dashboard — tidak ada halaman "akun berhasil dibuat" yang
 * mengharuskan klik kedua.
 */
export default function RegisterPage() {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center px-5 py-16 sm:px-8"
    >
      <AuthShell
        title="Buat akun gratis"
        description="Mulai dari kas toko Anda. Tidak perlu kartu kredit."
      >
        <Suspense fallback={<AuthFormSkeleton />}>
          <RegisterForm />
        </Suspense>
      </AuthShell>
    </main>
  );
}