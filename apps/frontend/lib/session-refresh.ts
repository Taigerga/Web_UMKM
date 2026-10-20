/**
 * Siklus hidup sesi di peramban: pantau kedaluwarsa access token dan tukar
 * dengan refresh token.
 *
 * ## Masalah yang diselesaikan modul ini (R-41)
 *
 * `refresh()` di `auth-client.ts` sudah ada tapi tidak punya pemanggil, dan
 * access token berumur 15 menit. Tanpa penyambungnya, sesi setiap UMKM
 * berakhir dengan login ulang tiap seperempat jam - persis saat mereka sedang
 * membaca laporan.
 *
 * ## Tiga aturan yang menjaga modul ini tidak melingkar
 *
 * 1. **Satu refresh pada satu waktu.** `refreshSession()` menyimpan promise
 *    yang sedang berjalan. Sepuluh panel yang sekaligus memanggilnya
 *    mendapatkan SATU request, bukan sepuluh. Tanpa ini, throttler backend
 *    (`auth`, 30 per menit) akan menerima lebih dari yang diizinkan dan
 *    sesi justru mati karena percobaan yang berhasil.
 * 2. **Satu percobaan ulang per request.** `sessionRequest()` mencoba ulang
 *    SATU KALI setelah 401, dan hanya setelah refresh benar-benar berhasil.
 *    Kalau request kedua juga 401, error itu dilempar apa adanya - bukan
 *    diputar lagi. Refresh yang tidak berhasil berarti sesi memang sudah
 *    tidak berlaku, dan memutarinya hanya menambah beban pada backend.
 *    Aturan setengahnya: 429 pada GET boleh ditunggu dan diputar SATU KALI
 *    (lihat `isThrottledRead`) - mutasi tidak pernah diputar otomatis.
 * 3. **Refresh yang gagal tidak selalu berarti logout.** Hanya kode galat
 *    yang berarti "sesi benar-benar tidak ada lagi"
 *    (`SESSION_INVALID`, `REFRESH_TOKEN_MISSING`, `ACCOUNT_DISABLED`) yang
 *    menghapus cookie dan memberi tahu UI. Galat jaringan atau 429
 *    `THROTTLED` justru membuat pengguna kehilangan sesinya, padahal
 *    refresh token-nya masih sah - itu logout unwillingly, persis yang R-41
 *    larang.
 *
 * ## Batasnya, secara jujur
 *
 * Modul ini tidak memverifikasi apa pun; ia hanya membaca `exp` dari cookie
 * untuk memutuskan KAPAN menukar token (lihat `jwt.ts`). Penegakan tetap
 * milik backend: kalau refresh diteruskan dengan token yang tidak berhak,
 * `JwtAuthGuard` yang menjawab 401.
 */

import { AUTH_ERROR_CODES, ApiError, apiRequest, ensureOk, sendRequest } from "./api-client";
import type { ApiRequestOptions } from "./api-client";
import { refresh } from "./auth-client";
import { clearAccessToken, readAccessToken } from "./auth-session";
import { isExpiringWithin, readJwtExpiryMs } from "./jwt";

/**
 * Tenggat aman, dalam milidetik.
 *
 * 60 detik cukup untuk menyelesaikan satu request yang sudah berjalan ketika
 * token kedaluwarsa. Margin yang lebih kecil membuat refresh happen terlalu
 * sering; yang lebih besar justru membiarkan token mati di tengah request.
 */
export const REFRESH_SKEW_MS = 60_000;

/**
 * Kode yang berarti sesi benar-benar berakhir.
 *
 * Daftar ini dibaca dari backend, bukan ditebak: `REFRESH_TOKEN_MISSING`
 * ditulis `AuthController.refresh` ketika cookie `bi_rt` tidak ikut
 * terkirim, dan `SESSION_INVALID` dipakai `RefreshTokenService` untuk token
 * yang dicabut, dipakai ulang, atau pemiliknya sudah tidak aktif.
 * `ACCOUNT_DISABLED` ditambahkan karena `AuthService.refresh` memeriksa
 * `isActive` lagi - jadi refresh bisa gagal setelah admin menonaktifkan akun
 *Someone di halaman `/dashboard/admin/users`.
 */
const SESSION_ENDING_CODES: ReadonlySet<string> = new Set([
  AUTH_ERROR_CODES.SESSION_INVALID,
  AUTH_ERROR_CODES.REFRESH_TOKEN_MISSING,
  AUTH_ERROR_CODES.ACCOUNT_DISABLED,
]);

type SessionEndedListener = () => void;

let sessionEndedListener: SessionEndedListener | null = null;

/**
 * Daftarkan callback "sesi sudah tidak berlaku".
 *
 * Dipakai UI untuk mengembalikan pengguna ke halaman masuk dengan pesan yang
 * bisa dibaca. Mengembalikan fungsi pembatal, supaya komponen yang
 * di-unmount tidak meninggalkan callback yang menunjuk ke state lama.
 */
export function onSessionEnded(listener: SessionEndedListener): () => void {
  sessionEndedListener = listener;
  return () => {
    if (sessionEndedListener === listener) sessionEndedListener = null;
  };
}

/**
 * Refresh yang sedang berjalan, atau `null`.
 *
 * Variabel modul inilah yang membuat lima panggil BLACKBERRY jadi satu
 * request. Disimpan sebagai variabel, bukan di React state, karena harus
 * berlaku lintas komponen - state akan terduplikasi per panel.
 */
let inflightRefresh: Promise<boolean> | null = null;

/**
 * Tukar refresh token cookie dengan access token baru.
 *
 * Cookie `bi_rt` HttpOnly dengan `Path=/api/v1/auth`, jadi browser
 * mengirimnya sendiri ke `POST /api/v1/auth/refresh`; frontend tidak pernah
 * membacanya dan tidak perlu mengirim apa pun.
 *
 * @returns `true` kalau ada access token baru. `false` kalau gagal - dan
 *   cookie sudah DIHAPUS hanya pada kode yang benar-benar berarti sesi
 *   berakhir.
 */
async function performRefresh(): Promise<boolean> {
  try {
    await refresh();
    return true;
  } catch (caught) {
    if (caught instanceof ApiError && SESSION_ENDING_CODES.has(caught.code)) {
      // Cookie dihapus di sini supaya `proxy.ts` ikut berhenti menganggap
      // sesi ada. Kalau tidak, pengguna yang logout otomatis tetap bisa
      // melewati gate UX dan baru melihat 401 di halaman berikutnya.
      clearAccessToken();
      sessionEndedListener?.();
    }
    // Galat lain (jaringan, 5xx, 429) sengaja TIDAK menghapus cookie: token
    // refresh-nya masih mungkin sah, dan menghapus sesi karena wifi berkedip
    // satu kali adalah logout yang tidak diminta pengguna.
    return false;
  }
}

/**
 * Refresh satu kali, dipakai bersama oleh semua pemanggil yang concurrent.
 *
 * Panggil kedua saat yang pertama masih berjalan mengembalikan promise yang
 * SAMA, bukan permintaan baru.
 */
export function refreshSession(): Promise<boolean> {
  if (inflightRefresh === null) {
    inflightRefresh = performRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * Pastikan access token masih punya sisa hidup sebelum dipakai.
 *
 * Sengaja tidak melempar dan tidak menghapus apa pun: pemanggilnya adalah
 * setiap request dashboard, dan halaman harus tetap bisa menampilkan error
 * yang bisa dibaca walaupun sesinya sudah tidak berlaku.
 */
export async function ensureFreshAccessToken(): Promise<void> {
  const token = readAccessToken();
  if (token === null) return;
  if (!isExpiringWithin(token, REFRESH_SKEW_MS)) return;
  await refreshSession();
}

/** 401 dari backend, dengan kode yang benar-benar berarti "sesi tak terbaca". */
function isUnauthorized(caught: unknown): boolean {
  return (
    caught instanceof ApiError &&
    caught.status === 401 &&
    caught.code === AUTH_ERROR_CODES.UNAUTHORIZED
  );
}

/**
 * 429 THROTTLED pada request baca. Retry-otomatis HANYA untuk GET: mencoba
 * ulang mutasi (POST/PUT/DELETE) berisiko dobel - order ganda, commit ganda.
 *
 * Ini menutup sisa pengalaman "Terlalu banyak permintaan" yang masih muncul
 * sesekali: throttle per menciptakan burst (tab sebelumnya + navigasi cepat),
 * dan jawaban 429 membawa `Retry-After`. Menunggu sesuai header lalu memutar
 * request baca sekali membuat pengguna tidak melihat galat untuk gangguan
 * yang sebenarnya sudah lewat sebelum tombol "coba lagi" sempat ditekan.
 * SATU percobaan saja, seperti aturan 401: kalau masih 429 berarti kuota
 * benar-benar habis, dan memutar terus justru memperjar kuota habis.
 */
function isThrottledRead(caught: unknown, options: ApiRequestOptions): boolean {
  const method = (options.method ?? "GET").toUpperCase();
  return (
    caught instanceof ApiError &&
    caught.status === 429 &&
    method === "GET"
  );
}

/** Tunggu sesuai `Retry-After`, dibatasi agar UI tidak membeku berjam-jam. */
async function waitBeforeThrottledRetry(caught: unknown): Promise<void> {
  const seconds =
    caught instanceof ApiError && caught.retryAfterSeconds !== null
      ? Math.min(Math.max(caught.retryAfterSeconds, 1), 10)
      : 1;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Request API yang memakai sesi, dengan penyambungan auto-refresh.
 *
 * Ini satu-satunya jalan keluar dari Client Component dashboard ke backend.
 * Sengaja berada di sini dan bukan di `api-client.ts`: `apiRequest` adalah
 * klien HTTP murni yang tidak tahu apa-apa soal sesi, dan membawanya ke sini
 * membuat pertanyaannya eksplisit - "request ini memakai sesi, ya?".
 *
 * ## Urutan, dan kenapa urutannya begitu
 *
 * 1. Refresh PROAKTIF dulu, kalau token hampir habis. Ini menutup sebagian
 *    besar 401 tanpa percobaan ulang sama sekali.
 * 2. Kirim request. Token dibaca dari cookie, bukan dari state React,
 *    karena R-33 menyatakan cookie dan header tidak boleh berbeda
 *    (backend men-set ulang keduanya pada setiap refresh).
 * 3. Kalau 401, refresh SEKALI dan coba ulang SATU KALI. Tidak ada perulangan:
 *    request kedua yang juga 401 dilempar apa adanya, dan pemanggil
 *    menampilkannya sebagai error state.
 */
export async function sessionRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  await ensureFreshAccessToken();

  try {
    return await apiRequest<T>(path, {
      ...options,
      accessToken: options.accessToken ?? readAccessToken(),
    });
  } catch (caught) {
    if (isThrottledRead(caught, options)) {
      await waitBeforeThrottledRetry(caught);
      return await apiRequest<T>(path, {
        ...options,
        accessToken: readAccessToken(),
      });
    }
    if (!isUnauthorized(caught)) throw caught;

    const refreshed = await refreshSession();
    // Refresh gagal: sesi tidak dapat diselamatkan, dan error ASLI yang
    // dilempar - bukan error refresh, yang akan menutupi alasan sebenarnya.
    if (!refreshed) throw caught;

    return await apiRequest<T>(path, {
      ...options,
      accessToken: readAccessToken(),
    });
  }
}

/**
 * Varian {@link sessionRequest} yang mengembalikan `Response` mentah.
 *
 * Dibutuhkan oleh satu-satunya pemanggil yang butuh jawaban SELAIN JSON
 * amplet: unduh laporan (HTML/PDF/CSV), yang membaca `Content-Disposition`
 * untuk nama berkas lalu menyimpan blob-nya. Selain itu, urutannya sama
 * persis - refresh proaktif, satu percobaan ulang setelah 401, dan kegagalan
 * status non-2xx dilempar sebagai `ApiError` oleh `ensureOk` SEBELUM
 * `Response` sampai ke pemanggil, jadi pemanggil tidak perlu memeriksa
 * `res.ok` lagi.
 */
export async function sessionFetch(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  await ensureFreshAccessToken();

  try {
    return await ensureOk(
      await sendRequest(path, {
        ...options,
        accessToken: options.accessToken ?? readAccessToken(),
      }),
    );
  } catch (caught) {
    if (isThrottledRead(caught, options)) {
      await waitBeforeThrottledRetry(caught);
      return ensureOk(
        await sendRequest(path, { ...options, accessToken: readAccessToken() }),
      );
    }
    if (!isUnauthorized(caught)) throw caught;

    const refreshed = await refreshSession();
    if (!refreshed) throw caught;

    return ensureOk(
      await sendRequest(path, { ...options, accessToken: readAccessToken() }),
    );
  }
}

/**
 * Kapan token berikutnya perlu ditukar, dalam milidetik dari sekarang.
 *
 * Mengembalikan `null` kalau tidak ada yang perlu dijadwalkan - tidak ada
 * token, atau `exp`-nya tidak terbaca.
 */
export function msUntilNextRefresh(now: number = Date.now()): number | null {
  const token = readAccessToken();
  if (token === null) return null;

  const expiry = readJwtExpiryMs(token);
  if (expiry === null) return null;

  // Minimal 5 detik. Kalau `exp` sudah lewat (token basi karena tab lama),
  // jangan langsung menjadi 0 - itu membuat timer memutar terus-menerus.
  return Math.max(5_000, expiry - now - REFRESH_SKEW_MS);
}