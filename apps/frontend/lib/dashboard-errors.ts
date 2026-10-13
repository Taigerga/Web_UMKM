/**
 * Terjemahan `error.code` backend menjadi bahasa yang bisa ditindaklanjuti.
 *
 * ## Kenapa bercabang di `code`, bukan di `message`
 *
 * `message` ditulis untuk dibaca manusia dan bisa berubah kapan saja;
 * `code` yang stabil. Contoh nyata dari backend: rate limit login TIDAK
 * memakai `TOO_MANY_REQUESTS` seperti yang lazim, melainkan `THROTTLED`, dan
 * guard peran menulis `FORBIDDEN_ROLE` sementara `HttpException` 403 polos
 * menulis `FORBIDDEN`. Keduanya berarti "ditolak", tapi jalan keluarnya berbeda.
 *
 * Setiap kode di bawah dibaca dari sumbernya di `apps/backend`, bukan dari
 * daftar asumsi. Kalau backend menambah kode baru, tampilan jatuh ke
 * `default` - yang tetap jujur, bukan diam-diam menampilkan `undefined`.
 */

import { AUTH_ERROR_CODES, ApiError } from "./api-client";

export type ErrorCopy = {
  /** Judul yang terlihat besar. */
  title: string;
  /** Penjelasan dan tindakan berikutnya, kalau ada. */
  description?: string;
};

/** Kode di luar daftar `AUTH_ERROR_CODES`, dibaca dari backend. */
export const DATA_ERROR_CODES = {
  /** `RolesGuard` - peran platform tidak memenuhi `@Roles(...)`. */
  FORBIDDEN_ROLE: "FORBIDDEN_ROLE",
  /** `StoreAccessService.assertAccess` - bukan anggota toko. */
  STORE_FORBIDDEN: "STORE_FORBIDDEN",
  /** Toko berstatus `SUSPENDED`. */
  STORE_SUSPENDED: "STORE_SUSPENDED",
  /** Peran di toko terlalu rendah untuk aksi tersebut. */
  INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE",
  /** `AdminService.setUserStatus` - target tidak ada. */
  USER_NOT_FOUND: "USER_NOT_FOUND",
  /** Admin mencoba menonaktifkan akunnya sendiri. */
  SELF_DEACTIVATION_NOT_ALLOWED: "SELF_DEACTIVATION_NOT_ALLOWED",
  /** `HttpException` 403 tanpa kode aplikasi. */
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

/**
 * Pesan galat untuk state error di halaman dashboard.
 *
 * Tidak ada tombol di dalamnya: keputusan "coba lagi" milik pemanggil,
 * karena hanya pemanggil yang tahu apakah memuat ulang akan berguna.
 */
export function describeDataError(error: ApiError): ErrorCopy {
  switch (error.code) {
    case DATA_ERROR_CODES.FORBIDDEN_ROLE:
      // R-39. Pesan ini sengaja menyebut PENOLAKAN backend, bukan
      // "halaman tidak ditemukan" - menyembunyikan 403 di balik halaman kosong
      // akan membuat orang mengira datanya hilang dan mencoba endpoint lain.
      return {
        title: "Peran Anda tidak punya akses ke data ini.",
        description:
          "Backend menolak permintaan ini karena peran akun Anda. Menu disembunyikan demi kerapian, tetapi menjaga data tetap urusan backend.",
      };
    case DATA_ERROR_CODES.STORE_FORBIDDEN:
      return {
        title: "Anda bukan anggota toko ini.",
        description: "Minta pemilik toko menambahkan Anda sebagai anggota lebih dulu.",
      };
    case DATA_ERROR_CODES.STORE_SUSPENDED:
      return {
        title: "Toko sedang dinonaktifkan.",
        description:
          "Baca dan ubah data toko ini diblokir selama statusnya suspended. Hubungi administrator platform.",
      };
    case DATA_ERROR_CODES.INSUFFICIENT_ROLE:
      return {
        title: "Peran Anda di toko ini tidak cukup.",
        description: "Aksi ini khusus untuk pemilik toko. Hubungi pemilik toko bila Anda perlu.",
      };
    case DATA_ERROR_CODES.SELF_DEACTIVATION_NOT_ALLOWED:
      return {
        title: "Akun Anda sendiri tidak bisa dinonaktifkan.",
        description:
          "Backend menolak karena admin yang menonaktifkan dirinya sendiri tidak punya cara mengaktifkan dirinya kembali lewat API mana pun.",
      };
    case DATA_ERROR_CODES.USER_NOT_FOUND:
    case DATA_ERROR_CODES.NOT_FOUND:
      return { title: "Data yang diminta tidak ditemukan." };
    case AUTH_ERROR_CODES.UNAUTHORIZED:
      return {
        title: "Sesi Anda sudah tidak berlaku.",
        description: "Muat ulang halaman untuk masuk kembali.",
      };
    case AUTH_ERROR_CODES.ACCOUNT_DISABLED:
      return {
        title: "Akun ini dinonaktifkan.",
        description: "Hubungi administrator platform untuk mengaktifkannya kembali.",
      };
    case AUTH_ERROR_CODES.VALIDATION_ERROR:
      return {
        title: "Data yang dikirim tidak diterima backend.",
        description:
          error.details.length > 0 ? error.details.join(" ") : undefined,
      };
    case AUTH_ERROR_CODES.THROTTLED: {
      const seconds = error.retryAfterSeconds;
      return {
        title: "Terlalu banyak permintaan.",
        description:
          seconds !== null && seconds > 0
            ? `Coba lagi dalam ${seconds} detik.`
            : "Tunggu sebentar lalu coba lagi.",
      };
    }
    case AUTH_ERROR_CODES.NETWORK_ERROR:
      return {
        title: "Tidak bisa menghubungi server.",
        description: "Periksa koneksi Anda lalu coba lagi.",
      };
    case DATA_ERROR_CODES.INTERNAL_ERROR:
      return {
        title: "Terjadi kesalahan di server.",
        description: "Coba lagi sebentar. Kalau terus berulang, hubungi administrator.",
      };
    case DATA_ERROR_CODES.FORBIDDEN:
      return { title: "Permintaan ini ditolak backend." };
    default:
      // `isUserFacing` hanya true untuk 4xx yang kodenya tidak dikenal. 5xx
      // selalu melewati `INTERNAL_ERROR` di filter backend, jadi reaching
      // sini dengan 5xx berarti bentuk respons berubah - dan menampilkan
      // pesan server apa adanya lebih jujur daripada menyembunyikannya.
      return {
        title: error.isUserFacing
          ? "Permintaan ditolak."
          : "Gagal memuat data.",
        description: error.isUserFacing ? error.message : undefined,
      };
  }
}