import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ACCESS_COOKIE_NAME } from "./lib/auth-session";

/**
 * Gate UX untuk `/dashboard/*`.
 *
 * ## Kenapa `proxy.ts` dan bukan `middleware.ts`
 *
 * Pada Next.js 16.4, konvensi `middleware` sudah DEPRECATED dan diganti nama
 * menjadi `proxy` (`node_modules/next/dist/docs/.../file-conventions/middleware.md`).
 * Fungsinya identik; hanya nama file dan nama export yang berubah. File
 * `middleware.ts` akan tetap berjalan dengan peringatan deprecation, tapi
 * menulis file yang sudah usang di kode baru itu pilihan yang salah — dan
 * `AGENTS.md` di package ini mewajibkan membaca dokumentasi yang terpasang
 * alih-alih menulis API dari ingatan training data.
 *
 * ## R-33: ini gate UX, bukan verifikasi
 *
 * Yang dilakukan di sini HANYA membaca apakah cookie `bi_at` ada. Token-nya
 * tidak didekode, tidak diverifikasi tanda tangannya, tidak dicocokkan dengan
 * database. Cookie itu bisa dipalsukan oleh siapa pun yang bisa menulis cookie
 * di peramban itu sendiri.
 *
 * Akses NYATA tetap dijaga backend: setiap endpoint dilindungi `JwtAuthGuard`,
 * dan tenant di-scope di query. Menggantungkan otorisasi pada file ini berarti
 * siapa pun yang mengedit satu baris di sini membuka seluruh dashboard —
 * sedangkan menghilangkannya sama sekali tidak mengubah apa yang bisa diakses.
 *
 * Karena `bi_at` sengaja tidak HttpOnly, file ini bisa membacanya tanpa
 * satu pun request ke backend. Kalau cookie itu HttpOnly, satu-satunya cara
 * memastikan sesi di sini adalah memanggil `/auth/me`: satu round-trip
 * tambahan untuk setiap navigasi dashboard, dan tetap bukan verifikasi
 * karena tokennya diterima begitu saja.
 */

/** Prefix yang dilindungi. Harus cocok dengan route dashboard di Task 9. */
export const PROTECTED_PREFIX = "/dashboard";

/** Halaman tujuan redirect ketika sesi tidak ada. */
export const LOGIN_PATH = "/login";

/**
 * True kalau path ini berada di dalam area terlindungi.
 *
 * Perbandingan memakai batas segment, bukan `startsWith` polos: tanpa itu,
 * `/dashboard-penjualan` ikut terlindungi hanya karena namanya diawali
 * `/dashboard` — yang tidak akan terjadi dan akan membingungkan pengguna dengan redirect
 * ke halaman login untuk halaman yang memang publik.
 */
export function isProtectedPath(pathname: string): boolean {
  return pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`);
}

/**
 * Susun URL login, mempertahankan tujuan asli.
 *
 * `next` disimpan di query supaya form login bisareturning pengguna ke halaman
 * yang memang ingin mereka buka setelah berhasil masuk. Nilainya dibaca dari
 * `searchParams` di sisi peramban nanti, bukan dipakai `redirect()` dari
 * server, supaya tidak pernah jadi sumber data yang di-cache bersama halaman.
 */
export function buildLoginUrl(request: NextRequest): URL {
  const url = new URL(LOGIN_PATH, request.url);
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  // Guard ini DEFENCE-IN-DEPTH, bukan perlindungan yang aktif. `pathname` dan
  // `search` dari `NextRequest` selalu diawali `/`, jadi cabang ini tidak pernah
  // menolak apa pun - sudah diperiksa dengan membangun `NextRequest` dari URL
  // protocol-relative, bercabang tiga tingkat, dan berisi query bermuatan `//`.
  //
  // DAN guard ini juga tidak lengkap: `//evil.example` LOLOS dari sini karena
  // diawali `/`. Satu-satunya tempat open redirect ditutup adalah
  // `resolveSafeRedirect` di sisi Client Component - dan itu pun baru benar
  // setelah karakter kontrol ditolak dan asal hasil resolusi diverifikasi.
  //
  // Catatan penting: `resolveSafeRedirect` yang memeriksa bentuk saja TIDAK
  // cukup. Parser URL membuang tab, LF, dan CR sebelum mem-parse, jadi nilai
  // `/<tab>/evil.example` lolos `startsWith("/")` dan `!includes("\\")`,
  // lalu tetap mendarat di origin lain saat `window.location.replace`
  // memprosesnya. Yang menutupnya adalah lapis verifikasi asal. Jaga
  // kedua-duanya tetap ada; menghapus salah satunya membuka open redirect
  // lagi. Diuji di `__tests__/open-redirect.test.ts` dan
  // `__tests__/proxy.test.ts`.
  if (target.startsWith("/")) url.searchParams.set("next", target);
  return url;
}

export function proxy(request: NextRequest): NextResponse {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Cookie yang ada = ada sesi menurut peramban. Token-nya sendiri tidak dibaca
  // di sini; lihat catatan R-33 di atas soal kenapa file ini bukan verifikasi.
  //
  // Nama cookie diimpor, bukan ditulis ulang: `auth-session.ts` membacanya dari
  // `NEXT_PUBLIC_ACCESS_COOKIE_NAME`, jadi dua sumber kebenaran akan membuat
  // penggantian nama merusak gate ini tanpa satu pun test yang gagal.
  //
  // `auth-session.ts` aman diimpor di sini: satu-satunya hal yang dibacanya
  // adalah `process.env`, dan `readAccessToken()` yang menyentuh `document`
  // tidak pernah dipanggil dari file ini.
  const hasToken = request.cookies.get(ACCESS_COOKIE_NAME) !== undefined;
  if (hasToken) return NextResponse.next();

  return NextResponse.redirect(buildLoginUrl(request));
}

export const config = {
  /**
   * Hanya `/dashboard/*`.
   *
   * Tanpa matcher, proxy berjalan untuk setiap request termasuk `_next/static`
   * dan file di `public/` — dan logika auth di sana bisa memblokir CSS atau JS
   * yang justru dibutuhkan halaman login untuk tampil.
   *
   * String-nya HARUS literal, bukan template literal dari `PROTECTED_PREFIX`.
   * `matcher` dibaca pada saat build lewat analisis statis, dan nilai yang
   * dibentuk dari variabel tidak bisa dianalisis: build gagal dengan
   * "Entry `matcher[0]` need to be static strings". Konsekuensinya, prefix di
   * bawah WAJIB disalin manual dari `PROTECTED_PREFIX` — dan test
   * `proxy.test.ts` mengunci kedua-duanya supaya tidak bisa menyimpang diam.
   */
  matcher: ["/dashboard/:path*", "/dashboard"],
};
