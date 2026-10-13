/**
 * Pembaca payload JWT **tanpa verifikasi**.
 *
 * ## Kenapa ini ada, dan kenapa ini BUKAN gerbang keamanan
 *
 * Cookie `bi_at` IS the access token JWT-nya sendiri (lihat `auth-session.ts`
 * dan `proxy.ts`). Frontend butuh dua hal dari token itu yang tidak bisa
 * didapat tanpa membacanya:
 *
 * 1. `role`, untuk menentukan ke mana `/dashboard` mengarahkan pengguna
 *    (R-40: dibaca server-side, bukan lewat middleware kedua).
 * 2. `exp`, untuk tahu kapan harus menukar refresh token (R-41).
 *
 * Keduanya adalah keputusan **UX**. Tidak ada satu pun dari keduanya yang
 *MASUK KE backend: setiap request tetap membawa header `Authorization` yang
 * diverifikasi `JwtAuthGuard` + `JwtStrategy` di server, dan tenant di-scope
 * di query. Kalau cookie ini dipalsukan, yang terjadi hanyalah redirect ke
 * halaman yang salah - yang lalu menjawab 403. Itu persis batas yang sudah
 * digariskan `proxy.ts` (R-33): gate UX, bukan verifikasi.
 *
 * ## Kenapa tidak memakai `jose` atau pustaka JWT
 *
 * Karena satu-satunya yang dibutuhkan adalah `JSON.parse` atas satu segmen
 * base64url, dan menambah dependensi untuk itu berarti menambah permukaan
 * serangan yang tidak perlu. Lebih penting: pustaka JWT yang memverifikasi
 * signature butuh secret yang tidak boleh ada di frontend sama sekali.
 * Kode di sini sengaja tidak bisa memverifikasi - dan itu bukan kekurangan,
 * tapi menghormati batas yang memang begitu.
 */

/** Isi payload yang dibaca modul ini. Field lain diabaikan. */
export type JwtPayload = {
  /** `sub` - id user. */
  sub?: string;
  email?: string;
  /** Peran PLATFORM: `ADMIN` | `OWNER` | `STAFF`. */
  role?: string;
  /** Unix time dalam detik (bukan milidetik). */
  exp?: number;
  iat?: number;
};

/**
 * Decode satu segmen base64url menjadi teks UTF-8.
 *
 * Base64url mengganti `+` -> `-` dan `/` -> `_`, dan '=' padding dibuang.
 * `atob` menolak kedua bentuk itu, jadi harus dikembalikan lebih dulu.
 *
 * `TextDecoder` dipakai (bukan `escape`/`unescape`) supaya payload non-ASCII
 * - nama toko bisa Bahasa Indonesia - tidak berubah jadi mojibake. saat ini
 * payload hanya berisi `sub`/`email`/`role`, tapi ini tidak boleh jadi alasan
 * untuk Membaca data yang salah diam-diam.
 */
function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    if (typeof atob === "function") {
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Payload token, atau `null` kalau token tidak bisa dibaca.
 *
 * `null` dicoba dijawab dengan aman, bukan lempar: pemanggilnya adalah
 * keputusan tampilan (ke mana redirect, kapan refresh), dan keputusan
 * tampilan tidak boleh membuat seluruh render gagal karena satu cookie rusak.
 */
export function decodeJwtPayload(token: string | null | undefined): JwtPayload | null {
  if (typeof token !== "string" || token.trim().length === 0) return null;
  const segments = token.trim().split(".");
  // JWT selalu tiga segmen. Selain itu, bentuknya bukan JWT dan tidak boleh
  // ditebak-tebak.
  if (segments.length !== 3) return null;

  const json = decodeBase64Url(segments[1]!);
  if (json === null) return null;

  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

/** `exp` dalam milidetik, atau `null` kalau tidak terbaca. */
export function readJwtExpiryMs(token: string | null | undefined): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

/** Peran platform dari token, atau `null` kalau tidak terbaca/recognized. */
export function readJwtRole(token: string | null | undefined): string | null {
  const role = decodeJwtPayload(token)?.role;
  return typeof role === "string" ? role : null;
}

/**
 * Apakah token sudah dekat kedaluwarsa.
 *
 * `windowMs` adalah tenggat aman: token yang masih hidup tapi hampir habis
 * akan ditolak oleh backend DI TENGAH request - jadi mengganti access token
 * sedikit lebih awal jauh lebih murah daripada satu request yang gagal.
 *
 * Sengaja memakai `<=`: tepat di garis batas juga dianggap "perlu refresh".
 */
export function isExpiringWithin(
  token: string | null | undefined,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const expiry = readJwtExpiryMs(token);
  // `exp` tidak terbaca: tidak ada yang bisa diklaim. Menebak "perlu refresh"
  // di sini akan memicu refresh tak terbatas untuk cookie yang rusak, jadi
  // default-nya "tidak perlu".
  if (expiry === null) return false;
  return expiry - now <= windowMs;
}