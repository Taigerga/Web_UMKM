/**
 * Klien endpoint autentikasi.
 *
 * Setiap fungsi di sini memanggil backend secara langsung dari peramban.
 * Tidak ada fetch server-side, tidak ada `"use cache"`, tidak ada prefetch
 * state auth (R-34). Alasannya bukan sekadar preferensi: state auth yang
 * di-cache atau di-prefetch di server bisa membuat satu sesi ikut terbawa ke
 * halaman pengguna lain — persis kelas kebocoran yang R-7 larang untuk data
 * tenant, dan untuk state auth risikonya lebih besar karena ikut membuka akses.
 */

import type { ApiRequestOptions } from "./api-client";
import { apiRequest } from "./api-client";
import { clearAccessToken, readAccessToken } from "./auth-session";

/** User yang boleh keluar ke client. Field dipilih satu per satu di backend. */
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/** Satu toko yang boleh diakses user. */
export type UserStoreAccess = {
  id: string;
  name: string;
  role: string;
  status: string;
};

/**
 * Bentuk `data` pada respons login/register/refresh.
 *
 * `refreshToken` SENGAJA tidak ada: backend hanya melepaskannya lewat cookie
 * HttpOnly. Kalau field ini pernah muncul di type, itu tanda kontrak berubah.
 */
export type SessionBody = {
  user: PublicUser;
  /** Access token, sama persis dengan nilai cookie `bi_at`. */
  accessToken: string;
  /** ISO-8601, detik sampai refresh token kedaluwarsa. */
  refreshExpiresAt: string;
};

/** Bentuk `data` pada `GET /auth/me`. */
export type AuthProfile = PublicUser & {
  stores: UserStoreAccess[];
};

/** Body `POST /auth/login`. */
export type LoginInput = {
  email: string;
  password: string;
};

/**
 * Body `POST /auth/register`.
 *
 * Sengaja tidak punya field `role` (R-35). Backend menjalankan
 * `ValidationPipe` dengan `forbidNonWhitelisted: true`, jadi RegisterDto yang
 * tidak punya `role` akan MENOLAK request yang mengirimnya dengan
 * `VALIDATION_ERROR` — bukan mengabaikannya diam-diam. Type di sini adalah
 * lapis pertahanan kedua, dan yang pertama adalah tidak pernah mengirimnya.
 */
export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

/**
 * `POST /auth/login` -> 201.
 *
 * Cookie sesi sudah di-set backend pada respons ini (`bi_at` non-HttpOnly +
 * `bi_rt` HttpOnly), jadi tidak ada yang perlu disalin manual peramban.
 */
export function login(input: LoginInput, options?: ApiRequestOptions) {
  return apiRequest<SessionBody>("/auth/login", {
    ...options,
    method: "POST",
    body: input,
  });
}

/** `POST /auth/register` -> 201, sesi penuh seperti login. */
export function register(input: RegisterInput, options?: ApiRequestOptions) {
  return apiRequest<SessionBody>("/auth/register", {
    ...options,
    method: "POST",
    body: input,
  });
}

/**
 * `GET /auth/me` -> 200.
 *
 * Membaca access token dari cookie `bi_at` kalau caller tidak memberikannya
 * eksplisit, lalu mengirimkannya sebagai header `Authorization` (R-33: token
 * yang sama hidup di cookie dan di header).
 *
 * Sengaja TIDAK di-cache dan TIDAK punya wrapper preload. `stores` di sini
 * adalah data tenant — membungkusnya di cache yang tidak awareness-user adalah
 * R-7 yang dilanggar.
 */
export async function me(
  options: ApiRequestOptions & { accessToken?: string | null } = {},
): Promise<AuthProfile> {
  // `readAccessToken()` mengembalikan `null` di server (tidak ada `document`),
  // jadi pemanggilan ini aman tanpa cabang runtime terpisah.
  return apiRequest<AuthProfile>("/auth/me", {
    ...options,
    method: "GET",
    accessToken: options.accessToken ?? readAccessToken(),
  });
}

/**
 * `POST /auth/refresh` -> 201, hanya membaca cookie refresh.
 *
 * Backend men-set ulang KEDUA cookie pada respons ini, tidak hanya cookie
 * refresh. Itu yang membuat cookie dan body tidak pernah berbeda (R-33).
 * Tidak ada body yang dikirim, jadi fungsi ini tidak menerima argument input.
 */
export function refresh(options?: ApiRequestOptions) {
  return apiRequest<SessionBody>("/auth/refresh", {
    ...options,
    method: "POST",
  });
}

/**
 * `POST /auth/logout` -> 204.
 *
 * Cookie `bi_rt` HttpOnly, jadi JavaScript tidak bisa mencabut sesi sendiri;
 * backend yang menghapus kedua cookie dengan atribut `path`/`httpOnly` yang
 * sama persis dengan saat men-set-nya. Cookie `bi_at` ikut dihapus backend.
 *
 * Pembersihan lokal `clearAccessToken()` di sini adalah jaring pengaman kalau
 * network gagal setelah backend sempat menghapus cookie — supaya UI tidak
 * menampilkan sesi yang sudah tidak berlaku.
 */
export async function logout(options?: ApiRequestOptions): Promise<void> {
  try {
    await apiRequest<void>("/auth/logout", { ...options, method: "POST" });
  } finally {
    clearAccessToken();
  }
}

