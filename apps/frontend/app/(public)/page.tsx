import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import { Benefits } from "@/components/landing/benefits";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { MlFeatures } from "@/components/landing/ml-features";
import { Navbar } from "@/components/landing/navbar";
import { Privacy } from "@/components/landing/privacy";

export const metadata: Metadata = {
  title: "BisnisInsight — Analisis penjualan untuk UMKM Indonesia",
  description:
    "Baca kas, produk, dan pola penjualan Anda dari satu tempat. Semua angka dan grafik di halaman ini adalah data contoh dari dataset sintetis.",
};

/**
 * Batas cache untuk halaman publik.
 *
 * `'use cache'` di sini aman karena isinya identik untuk semua pengunjung:
 * seluruh konten landing page adalah teks dan angka ilustrasi yang ditulis di
 * source, tanpa `params`, `searchParams`, `cookies()`, `headers()`, maupun query
 * ke database. Tidak ada input per-pengguna yang bisa masuk ke cache key, jadi
 * tidak ada cara User B menerima hasil milik User A.
 *
 * Yang akan membuatnya TIDAK aman (rule R-7):
 * - membaca `cookies()`, `headers()`, atau `searchParams` di dalam scope ini;
 * - mengambil nilai runtime (mis. `storeId`) lalu meneruskannya ke cached
 *   function sebagai argumen;
 * - melakukan query tenant di dalam scope tanpa memasukkan identitas tenant ke
 *   cache key.
 *
 * Dengan `partialPrefetching: true`, prefetch berjalan agresif di client dan
 * cache key yang tidak awareness-user akan membocorkan data antar pengguna.
 * Karena itu seluruh data toko pada aplikasi ini dibaca lewat Client Component
 * yang memanggil backend secara langsung, tidak pernah lewat `'use cache'`.
 *
 * `cacheLife('max')`: konten landing nyaris tidak berubah, jadi cukup
 * diprerender ulang ketika build atau deploy berubah.
 */
export default async function LandingPage() {
  "use cache";
  cacheLife("max");

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <Hero />
        <DashboardPreview />
        <MlFeatures />
        <HowItWorks />
        <Benefits />
        <Privacy />
        <Faq />
      </main>
      <Footer />
    </>
  );
}