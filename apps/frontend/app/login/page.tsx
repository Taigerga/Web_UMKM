import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormSkeleton, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Masuk — BisnisInsight",
  description: "Masuk ke akun BisnisInsight Anda untuk membaca laporan penjualan.",
};

/**
 * Halaman masuk.
 *
 * ## Kenapa halaman ini tidak melakukan fetch apa pun ke backend (R-34)
 *
 * Yang di-render di server hanyalah kerangka: judul, penjelasan, dan form.
 * Halaman auth TIDAK boleh mengambil state auth di server. Kalau state itu
 * masuk ke payload render, ia bisa ikut terbawa ke shell yang dilayani ke
 * pengguna lain — dan dengan `cacheComponents` + `partialPrefetching` menyala,
 * shell yang sama memang dilayani ulang ke banyak permintaan. User B bisa
 * saja menerima halaman yang sudah memuat sesi User A.
 *
 * Form-nya Client Component dan memanggil backend langsung dari peramban.
 * Selalu segar, dan tidak ada cache lintas pengguna yang mungkin terjadi.
 *
 * ## Kenapa `searchParams` tidak di-`await` di badan halaman
 *
 * `searchParams` adalah runtime data. Di-`await` langsung di badan halaman, ia
 * membuat seluruh route jadi blocking dan `next build` gagal dengan
 * "Next.js encountered uncached or runtime data during prerendering".
 *
 * Promise-nya diteruskan apa adanya ke komponen anak di bawah `<Suspense>`,
 * dan di-`await` di sana. Static shell - judul, penjelasan, kerangka form -
 * dan di-`await` di sana. Static shell - judul, penjelasan, kerangka form -
 *
 * Ini bukan sekadar teknis. Shell auth yang selesai di-prerender adalah shell
 * yang secara struktural tidak mungkin memuat state sesi siapa pun, karena
 * isinya identik untuk semua pengunjung. Kalau halaman ini sempat di-cache
 * bersama data sesi, itulah barang yang bocor.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center px-5 py-16 sm:px-8"
    >
      <AuthShell
        title="Masuk ke akun Anda"
        description="Baca kas, produk, dan pola penjualan Anda dari satu tempat."
      >
        <Suspense fallback={<AuthFormSkeleton />}>
          <LoginFormFromQuery searchParams={searchParams} />
        </Suspense>
      </AuthShell>
    </main>
  );
}

/**
 * Membaca `searchParams` lalu meneruskannya ke form.
 *
 * Terpisah dari halaman supaya satu-satunya akses runtime data terjadi di dalam
 * `<Suspense>`.
 */
async function LoginFormFromQuery({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = params["next"];
  // Diteruskan apa adanya. Penyaringan ada di `resolveSafeRedirect` di sisi
  // Client Component, dekat dengan tempat nilainya benar-benar dipakai, dan
  // diuji sebagai fungsi murni.
  const nextPath = typeof rawNext === "string" ? rawNext : "/dashboard";

  return <LoginForm nextPath={nextPath} />;
}