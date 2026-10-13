import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACCESS_COOKIE_NAME } from "@/lib/auth-session";
import { defaultDashboardPath, toPlatformRole } from "@/lib/dashboard-nav";
import { readJwtRole } from "@/lib/jwt";

/**
 * Pintu masuk dashboard: mengarahkan pengguna ke beranda perannya.
 *
 * ## Kenapa cookie dibaca di sini, dan bukan lewat middleware (R-40)
 *
 * `proxy.ts` sudah menjawab satu pertanyaan saja - "ada sesi atau tidak" -
 * dan itu memang jawaban yang tepat untuk gate UX. Menambah pertanyaan
 * kedua ("peran apa") ke sana berarti satu file menentukan redirect dan
 * penolakan sekaligus, dan perubahan satu baris di sana bisa mengubah
 * perilaku seluruh dashboard tanpa satu pun test yang gagal.
 *
 * Membaca cookie langsung di route ini tidak menambah gate baru: kalau
 * cookie tidak ada, `proxy.ts` sudah hasnderrived lebih dulu, dan kalau
 * perannya salah, yang terjadi hanyalah pengguna mendarat di beranda
 * yang salah - yang lalu menjawab 403 dari backend.
 *
 * ## Cookie `bi_at` adalah tokennya sendiri, dan ini dibaca TANPA verifikasi
 *
 * `readJwtRole` hanya memecah payload-nya; tidak ada signature yang diperiksa,
 * dan memang tidak bisa - secret-nya tidak boleh ada di frontend. Karena itu
 * nilainya dipakai untuk SATU hal: memilih halaman tujuan. Setiap keputusan
 * yang menentukan akses tetap dibuat backend (lihat `lib/jwt.ts`).
 *
 * ## Peran yang tidak dikenal berakhir di toko
 *
 * `toPlatformRole` mengembalikan `null` untuk apa pun di luar enum, dan
 * `defaultDashboardPath` mengirim `null` ke `/dashboard/toko`. Default-nya
 * bukan ADMIN: memberi halaman admin lebih dulu kepada cookie yang tidak
 * terbaca berarti menampilkan menu yang paling banyak inviting kesalahan.
 */
/**
 * Route ini memblokir, dan itu memang disengaja.
 *
 * `cookies()` di luar `<Suspense>` membuat route tidak bisa di-prerender,
 * dan `next build` menolak dengan "uncached or runtime data during
 * prerendering". Tiga jalan keluarnya yang ditawarkan framework: bungkus di
 * `<Suspense>`, cache dengan `"use cache"`, atau `instant = false`.
 *
 * Dua yang pertama ditolak dengan alasan, bukan karena tidak bisa:
 *
 * - **`"use cache"`** dilarang oleh R-7, dan di sini khususnya berarti cache
 *   key yang memuat nilai cookie sesi - kelas kesalahan yang sama dengan yang
 *   harus dihindari di seluruh `app/(dashboard)`.
 * - **`<Suspense>`** membuat `redirect()` di dalam streaming context menjadi
 *   meta-tag di sisi peramban: status 200 dan perpindahan lewat client. Untuk
 *   halaman yang HANYA berfungsi sebagai pengarah, itu lebih buruk dari
 *   redirect 307 yang jujur dan bisa diuji dari luar peramban.
 *
 * Yang tersisa adalah menyatakan route ini memang blocking - dan memang
 * benar begitu. Tidak ada shell yang bisa di-prerender di sini, karena
 * hasilnya selalu redirect, bukan UI.
 */
export const instant = false;

export default async function DashboardIndexPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE_NAME)?.value ?? null;

  redirect(defaultDashboardPath(toPlatformRole(readJwtRole(token))));
}