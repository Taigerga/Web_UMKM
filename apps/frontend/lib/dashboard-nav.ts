/**
 * Menu navigasi per peran, sebagai data murni.
 *
 * ## Kenapa modul ini terpisah dari komponen
 *
 * Isinya adalah KEPUTUSAN ("peran ini boleh melihat apa"), bukan tampilan.
 * Memisahkannya berarti keputusan itu bisa diuji sebagai fungsi murni tanpa
 * merender apa pun - dan lebih penting, menu tidak bisa berubah diam-diam
 * karena ada `if` yang tersembunyi di dalam JSX.
 *
 * ## R-39: menu yang disembunyikan itu UX, bukan keamanan
 *
 * `navForRole` menentukan apa yang TERLIHAT. Yang menentukan apa yang bisa
 * dibaca adalah `@Roles(...)` di backend, dan itu yang diujiTask 9 wajib -
 * buka `/dashboard/admin/users` langsung lewat URL harus dijawab 403
 * `FORBIDDEN_ROLE` oleh backend, bukan oleh redirect frontend. Kalau satu saat
 * menu ini berubah jadi satu-satunya penjaga, setiap item `href: null` di
 * bawah berubah dari "fitur belum ada" jadi "lubang".
 *
 * Karena itu `href: null` berarti **halaman belum ada di fase ini**, dan
 * item-nya dirender sebagai teks mati dengan alasannya - bukan sebagai link
 * yang menuju 404, dan bukan sebagai tombol yang tidak melakukan apa pun.
 */

import type { Route } from "next";

/** Peran platform. Sumbernya: enum `Role` di `apps/backend`. */
export const PLATFORM_ROLES = ["ADMIN", "OWNER", "STAFF"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Peran sebagai string, atau `null` kalau di luar enum.
 *
 * Default-nya `null`, bukan `OWNER`: peran yang tidak dikenal harus terlihat
 * sebagai "tidak ada menu yang bisa dipercaya", bukan mendapat halaman
 * milik peran lain.
 */
export function toPlatformRole(raw: unknown): PlatformRole | null {
  return typeof raw === "string" && (PLATFORM_ROLES as readonly string[]).includes(raw)
    ? (raw as PlatformRole)
    : null;
}

export type NavItem = {
  /** Kunci stabil, dipakai sebagai `key` dan untuk pengujian. */
  key: string;
  label: string;
  /**
   * Tujuan navigasi, atau `null` kalau halamannya belum ada.
   *
   * `null` bukan "sembunyikan": item-nya tetap tampil dengan penjelasan, agar
   * pengguna tahu fitur itu direncanakan dan bukan salah jalan.
   */
  href: Route | null;
  /** Alasan tampil sebagai teks mati. Wajib kalau `href` null. */
  unavailableReason?: string;
  /** Tepat sama dengan `href`, bukan juga semua turunannya. */
  exact?: boolean;
};

/**
 * Halaman depan `/dashboard` untuk sebuah peran.
 *
 * Hanya ADMIN yang diarahkan ke area admin. Peran lain - termasuk yang tidak
 * dikenal - diarahkan ke toko, karena itu satu-satunya halaman yang selalu
 * ada dan tidak butuh backend yang menolak perannya.
 */
export function defaultDashboardPath(role: PlatformRole | null): Route {
  return role === "ADMIN" ? "/dashboard/admin" : "/dashboard/toko";
}

/**
 * Menu ADMIN.
 *
 * Monitoring dan Audit Log belum punya endpoint di backend, jadi keduanya
 * `href: null` dengan alasan yang jujur - bukan link ke halaman kosong dan
 * bukan angka monitoring yang dikarang.
 */
const ADMIN_NAV: readonly NavItem[] = [
  { key: "admin-ringkasan", label: "Ringkasan platform", href: "/dashboard/admin", exact: true },
  { key: "admin-toko", label: "Toko", href: "/dashboard/admin/stores" },
  { key: "admin-pengguna", label: "Pengguna", href: "/dashboard/admin/users" },
  {
    key: "admin-monitoring",
    label: "Monitoring",
    href: null,
    unavailableReason:
      "Belum ada endpoint status service, model, atau job. Bagian ini menyusul setelah ada data penjualan.",
  },
  {
    key: "admin-audit",
    label: "Audit Log",
    href: null,
    unavailableReason:
      "Jejak audit sudah tercatat di backend, tetapi belum ada endpoint untuk membacanya per admin.",
  },
];

/**
 * Menu OWNER toko.
 *
 * "Ringkasan toko" - omzet, produk terlaris, pola penjualan - memang butuh
 * data penjualan, dan fase ini belum punya satu pun baris. Jadi item itu
 * tampil sebagai teks mati dengan penjelasan, bukan angka nol yang terlihat
 * seperti hasil laporan.
 */
const OWNER_NAV: readonly NavItem[] = [
  {
    key: "toko-ringkasan",
    label: "Ringkasan toko",
    href: null,
    unavailableReason:
      "Ringkasan omzet dan produk muncul setelah data penjualan pertama diunggah. Fase ini belum punya data penjualan.",
  },
  { key: "toko-dan-tim", label: "Toko & Tim", href: "/dashboard/toko" },
  { key: "profil", label: "Profil", href: "/dashboard/profil" },
];

/**
 * Menu STAFF.
 *
 * Tidak ada satu pun item admin, dan tidak ada item management. Perbedaannya
 * dari OWNER bukan label saja: label "Toko" di sini sudah menyebut read-only
 * dan halamannya memang tidak punya kontrol mutasi, jadi menu tidak
 * menjanjikan sesuatu yang halaman tidak lakukan.
 */
const STAFF_NAV: readonly NavItem[] = [
  {
    key: "toko-ringkasan",
    label: "Ringkasan toko",
    href: null,
    unavailableReason:
      "Ringkasan omzet dan produk muncul setelah data penjualan pertama diunggah. Fase ini belum punya data penjualan.",
  },
  {
    key: "toko",
    label: "Toko (hanya baca)",
    href: "/dashboard/toko",
  },
  { key: "profil", label: "Profil", href: "/dashboard/profil" },
];

const NAV_BY_ROLE: Record<PlatformRole, readonly NavItem[]> = {
  ADMIN: ADMIN_NAV,
  OWNER: OWNER_NAV,
  STAFF: STAFF_NAV,
};

/**
 * Menu untuk sebuah peran. Peran `null` menghasilkan menu kosong, bukan menu
 * milik peran lain.
 */
export function navForRole(role: PlatformRole | null): readonly NavItem[] {
  if (role === null) return [];
  return NAV_BY_ROLE[role];
}

/** Item menu yang punya tujuan navigasi saja (tanpa yang `href: null`). */
export function navigableNavItems(role: PlatformRole | null): readonly NavItem[] {
  return navForRole(role).filter((item) => item.href !== null);
}