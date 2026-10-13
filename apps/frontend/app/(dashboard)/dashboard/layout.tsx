import type { Metadata } from "next";

import { SessionProvider } from "@/components/dashboard/session-provider";
import { Sidebar } from "@/components/dashboard/sidebar";

export const metadata: Metadata = {
  title: "Dashboard — BisnisInsight",
  robots: { index: false, follow: false },
};

/**
 * Shell dashboard: sidebar, area konten, dan provider sesi.
 *
 * ## Kenapa layout ini TIDAK membaca cookie (R-40, R-7)
 *
 * `proxy.ts` sudah menjaga `/dashboard/*` dan tidak boleh ditulis ulang.
 * Layout ini sengaja tidak membaca `cookies()` untuk dua alasan yang
 * saling menguatkan:
 *
 * 1. **Layout tidak perlu tahu siapa penggunanya.** Sidebar Client Component
 *    mengambil profil dari `GET /auth/me`. Sumbernya sama dengan yang
 *    dipakai backend untuk menegakkan akses, jadi tidak ada lapisan
 *    kebenaran kedua yang bisa menyimpang.
 * 2. **Layout tanpa runtime data adalah static shell.** Dengan
 *    `cacheComponents` + `partialPrefetching`, shell bisa dilayani ulang ke
 *    banyak permintaan. Layout yang membaca state sesi tidak menambah
 *    kemampuan, hanya menambah permukaan kebocoran: begitu satu nilai sesi
 *    masuk ke render, ia bisa ikut terbawa ke shell yang dilihat pengguna
 *    lain (kelas kesalahan yang sama dengan R-7, dan untuk state auth
 *    risikonya lebih besar karena ikut membuka akses).
 *
 * Pembacaan cookie untuk redirect peran tetap ada, tapi hanya di
 * `dashboard/page.tsx`, di dalam batas satu route yang hasilnya tidak pernah
 * ikut masuk shell.
 *
 * ## Kenapa `SessionProvider` ada di sini, bukan per halaman
 *
 * Refresh terjadwal (R-41), pemuatan profil, dan callback "sesi berakhir"
 * semuanya milik satu siklus hidup peramban. Kalau diulang per halaman,
 * setiap navigasi akan memasang timer sendiri dan satu tab bisa punya tiga
 * penjadwal refresh yang saling menabrak.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:shadow-lift"
        >
          Lewati ke konten
        </a>
        <Sidebar />
        <main id="konten" className="flex-1 px-5 py-8 sm:px-8 lg:py-10">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            {children}
          </div>
        </main>
      </div>
    </SessionProvider>
  );
}