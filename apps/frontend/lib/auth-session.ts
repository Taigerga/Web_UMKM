/**
 * Helper cookie sesi sisi peramban.
 *
 * ## Kenapa ada modul ini
 *
 * Backend Issuing cookie sesi sendiri lewat header `Set-Cookie` pada respons
 * login/register/refresh. Cookie itu menempel pada origin backend
 * (`localhost:3000`), bukan origin frontend (`localhost:3001`) — jadi frontend
 * tidak pernah membuatnya, hanya membaca dan menghapus yang sudah ada.
 *
 * ## Batas yang jujur
 *
 * - **Membaca `bi_at` hanya mungkin di peramban.** Cookie itu sengaja tidak
 *   HttpOnly supaya `proxy.ts` bisa membacanya, dan `proxy.ts` berjalan di sisi
 *   server. Modul ini TIDAK bisa dipakai dari Server Component.
 * - **Menghapus `bi_rt` dari JavaScript tidak mungkin.** Cookie itu HttpOnly:
 *   satu-satunya jalan mencabut sesi adalah memanggil `POST /auth/logout`, dan
 *   backend yang menghapus kedua cookie dengan atribut yang cocok.
 */

/**
 * Nama cookie access token.
 *
 * WAJIB sama dengan `ACCESS_COOKIE_NAME` di backend (`configuration.ts`).
 * Nilai di-hardcode sebagai default supaya frontend tetap jalan tanpa env,
 * dan bisa dioverride lewat `NEXT_PUBLIC_ACCESS_COOKIE_NAME` kalau backend
 * dikonfigurasi dengan nama lain.
 */
export const ACCESS_COOKIE_NAME =
  process.env.NEXT_PUBLIC_ACCESS_COOKIE_NAME ?? "bi_at";

/** Nama cookie refresh token. HttpOnly — tidak bisa dibaca atau dihapus JS. */
export const REFRESH_COOKIE_NAME = "bi_rt";

/**
 * Parse string `document.cookie` jadi peta nama -> nilai.
 *
 * `document.cookie` memisahkan pasangan dengan `; ` dan tidak meng-escape nilai.
 * Nilai tetap di-decode kalau percent-encoding-nya sah, dan apa adanya kalau
 * bukan — cookie JWT tidak mengandung karakter yang perlu di-escape, jadi
 * jalur kedua harus tetap aman.
 */
export function parseCookieString(raw: string): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const segment = part.trim();
    if (segment.length === 0) continue;
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (name.length === 0) continue;
    try {
      jar[name] = decodeURIComponent(value);
    } catch {
      jar[name] = value;
    }
  }
  return jar;
}

/**
 * Baca access token dari cookie `bi_at`.
 *
 * Hanya jalan di peramban. Di server selalu mengembalikan `null`, karena
 * `document` tidak ada — pemanggil di server harus memakai `cookies()` dari
 * `next/headers`, atau `proxy.ts` yang membacanya langsung dari `NextRequest`.
 */
export function readAccessToken(): string | null {
  if (typeof document === "undefined") return null;
  const value = parseCookieString(document.cookie)[ACCESS_COOKIE_NAME];
  return value !== undefined && value.length > 0 ? value : null;
}

/** True kalau peramban sudah punya cookie access token. */
export function hasAccessToken(): boolean {
  return readAccessToken() !== null;
}

/**
 * Hapus cookie `bi_at` dari sisi peramban.
 *
 * `Path=/` WAJIB sama persis dengan saat backend men-set cookie-nya; kalau
 * berbeda, browser menganggapnya cookie yang berbeda dan tidak menghapus apa
 * pun. Cookie `bi_rt` TIDAK bisa dihapus dari sini karena HttpOnly — itu
 * disengaja, dan `logout()` di `auth-client.ts` yang memanggil backend.
 *
 * Return `true` kalau cookie-nya benar-benar hilang setelah percobaan.
 */
export function clearAccessToken(): boolean {
  if (typeof document === "undefined") return false;
  document.cookie = `${ACCESS_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  return !hasAccessToken();
}

/**
 * Normalisasi token supaya string kosong tidak pernah dikirim.
 *
 * String kosong akan menghasilkan header `Authorization: Bearer` tanpa token,
 * dan backend akan memperlakukannya sebagai token tak dikenal — galat yang jauh
 * lebih sulit dibaca daripada `null` yang berarti "tidak kirim".
 */
export function normalizeToken(token: string | null | undefined): string | null {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}
