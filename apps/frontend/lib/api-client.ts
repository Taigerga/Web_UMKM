/**
 * Klien HTTP untuk API `BisnisInsight`.
 *
 * ## Bentuk respons (dibaca dari `apps/backend`)
 *
 * Sukses: `{ data: ... }`, dan daftar menambahkan `{ data: [...], meta: {...} }`.
 * Galat: `{ error: { code, message, details? } }` — `AllExceptionsFilter` satu-
 * satunya yang membentuknya, jadi setiap endpoint memakai bentuk yang sama.
 *
 * **`code` adalah kontraknya, `message` bukan.** `message` ditulis untuk dibaca
 * manusia dan bisa berubah kapan saja; `code` yang dipakai untuk bercabang.
 * Contoh nyata: rate limit login TIDAK memakai kode `TOO_MANY_REQUESTS` seperti
 * yang lazim, melainkan `THROTTLED`. Nilainya dibaca dari filter backend, bukan
 * dari daftar asumsi.
 *
 * ## `credentials: "include"`
 *
 * Wajib di setiap request. Backend Issuing cookie sesi lewat header `Set-Cookie`
 * pada respons login/register/refresh, dan `enableCors({ credentials: true })`
 * tanpa header ini membuat browser membuang cookie tersebut. Cookie `bi_at`
 * juga dibaca `proxy.ts`, jadi request dari browser harus benar-benar
 * menyimpannya.
 *
 * ## Tidak ada cache di sini (R-7)
 *
 * Modul ini tidak pernah memakai `"use cache"`, dan tidak boleh. Yang
 * dilaluinya adalah data tenant: `GET /auth/me` mengembalikan daftar toko yang
 * boleh diakses, dan setiap request harus mencerminkan keadaan terkini. Cache
 * key yang tidak awareness-user akan membuat User B menerima hasil User A —
 * kebocoran data, bukan sekadar bug performa.
 */

import type { ApiErrorCode, AuthFieldName, FieldErrorMap } from "./auth-errors";
import { mapDetailsToFields } from "./auth-errors";
import { normalizeToken } from "./auth-session";

/**
 * Origin backend.
 *
 * `NEXT_PUBLIC_API_BASE_URL` hanya dibaca saat build, jadi mengubahnya berarti
 * build ulang — bukan sekadar restart `next dev`.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

/** Prefix global yang dipasang `app.setGlobalPrefix("api/v1")`. */
export const API_PREFIX = "/api/v1";

/** Kode galat auth yang dibaca dari backend, bukan ditebak. */
export const AUTH_ERROR_CODES = {
  /** `ValidationPipe`: payload tidak cocok DTO. `details` berisi satu string per aturan gagal. */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** `JwtAuthGuard` tanpa token, atau token tak dikenal/expired. */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** Email tidak terdaftar ATAU password salah. Pesan sengaja sama untuk keduanya. */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** Refresh token dicabut, dipakai ulang, atau pemiliknya sudah tidak aktif. */
  SESSION_INVALID: "SESSION_INVALID",
  /** Cookie `bi_rt` tidak ikut terkirim (path salah, atau sudah dihapus). */
  REFRESH_TOKEN_MISSING: "REFRESH_TOKEN_MISSING",
  /** 10 kegagalan beruntun: akun dikunci 15 menit. */
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  /** `users.isActive = false`. */
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  /** Prisma P2002 — pada register berarti email sudah terdaftar. */
  DUPLICATE: "DUPLICATE",
  /** `ThrottlerException` -> 429. BUKAN `TOO_MANY_REQUESTS`. */
  THROTTLED: "THROTTLED",
  /** Semua 5xx dikolaps filter menjadi kode ini + pesan generik. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** Jaringan gagal / backend tidak terjangkau. Bukan dari backend. */
  NETWORK_ERROR: "NETWORK_ERROR",
  /** Respons 2xx yang body-nya bukan JSON yang diharapkan. */
  MALFORMED_RESPONSE: "MALFORMED_RESPONSE",
  /** Fallback kalau body galat tidak berbentuk amplop backend. */
  HTTP_ERROR: "HTTP_ERROR",
} as const satisfies Record<string, ApiErrorCode>;

/** Galat dari API, atau dari lapisan jaringan sebelum backend menjawab. */
export class ApiError extends Error {
  /** Status HTTP. `0` kalau request tidak pernah sampai ke backend. */
  readonly status: number;
  /** `error.code` dari backend — cabang UI ada di sini. */
  readonly code: ApiErrorCode;
  /** Isi `error.details`. Untuk `VALIDATION_ERROR` ini array string satu per aturan gagal. */
  readonly details: string[];
  /** Detik dari header `Retry-After`, kalau backend mengirimkannya. */
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: string[];
    retryAfterSeconds?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** Galat yang layak ditampilkan apa adanya ke pengguna (bukan 5xx generik). */
  get isUserFacing(): boolean {
    return this.status > 0 && this.status < 500;
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ApiRequestOptions = {
  method?: HttpMethod;
  /**
   * Body JSON (di-`JSON.stringify` lalu dikirim sebagai
   * `Content-Type: application/json`), atau `FormData` (dikirim apa adanya;
   * browser yang menghitung boundary multipart-nya).
   */
  body?: unknown;
  /**
   * Access token untuk header `Authorization`.
   *
   * R-33 menyimpan token yang sama DUA tempat: cookie `bi_at` (supaya
   * `proxy.ts` bisa membacanya) dan body response (supaya header bisa dibuat).
   * Keduanya di-set ulang pada setiap login dan setiap refresh, jadi tidak ada
   * keadaan di mana keduanya berbeda. Mengiri token dari satu jalur saja akan
   * membuka celah di mana keduanya berbeda.
   */
  accessToken?: string | null;
  signal?: AbortSignal;
};

/**
 * Header `Retry-After` yang dipakai backend.
 *
 * `@Throttle({ auth: ... })` memberi throttler bernama `auth`, dan
 * `ThrottlerGuard` menulis `Retry-After-${nama}` untuk throttler bernama. Jadi
 * header yang benar-benar dikirim adalah `Retry-After-auth`, bukan `Retry-After`.
 * Header polos ikut dibaca supaya tidak rapuh kalau nama throttler berubah.
 *
 * ## Syarat agar nilai ini benar-benar sampai ke peramban
 *
 * `Retry-After` BUKAN response header yang aman secara CORS. Backend harus
 * menyebutkannya di `exposedHeaders`; kalau tidak, JavaScript di origin lain
 * melihat `null` walau header-nya ada di respons, dan fungsi ini selalu
 * mengembalikan `null`.
 *
 * `exposedHeaders: ['Retry-After', 'Retry-After-auth']` sudah dipasang di
 * `apps/backend/src/bootstrap.ts`, dan
 * `apps/backend/test/cors-exposed-headers.e2e.spec.ts` mengunci bahwa header itu
 * benar-benar diekspos. Kalau eksposur itu hilang, gejalanya di sisi ini adalah
 * "retry-after selalu kosong" - pesan 429 tetap muncul, hanya tanpa hitungan
 * detiknya.
 */
const RETRY_AFTER_HEADERS = ["retry-after", "retry-after-auth"] as const;

/** Baca `Retry-After` dalam detik dari salah satu header yang dikirim backend. */
export function readRetryAfter(headers: Headers): number | null {
  for (const name of RETRY_AFTER_HEADERS) {
    const raw = headers.get(name);
    if (raw === null) continue;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  }
  return null;
}

/** Ambil array string dari `error.details`, buang apa pun yang bukan string. */
function readDetails(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const details = (payload as { details?: unknown }).details;
  if (!Array.isArray(details)) return [];
  return details.filter((item): item is string => typeof item === "string");
}

/**
 * Error dari `AllExceptionsFilter` punya bentuk yang sudah dijamin, tapi filter
 * adalah `catch` — request bisa juga gagal sebelum filter sempat jalan. Membaca
 * bentuknya secara struktural membuat klien gagal dengan `ApiError` yang bisa
 * dibaca, bukan `TypeError` yang tidak bisa di-render.
 */
function readErrorBody(body: unknown): {
  code: ApiErrorCode;
  message: string;
  details: string[];
} {
  const fallbackMessage = "Permintaan gagal. Silakan coba lagi.";
  if (typeof body !== "object" || body === null) {
    return { code: "HTTP_ERROR", message: fallbackMessage, details: [] };
  }

  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return { code: "HTTP_ERROR", message: fallbackMessage, details: [] };
  }

  const { code, message } = error as { code?: unknown; message?: unknown };
  return {
    code: typeof code === "string" ? (code as ApiErrorCode) : "HTTP_ERROR",
    message: typeof message === "string" ? message : fallbackMessage,
    details: readDetails(error),
  };
}

/**
 * Satu permintaan HTTP ke backend, jawabannya dikembalikan mentah.
 *
 * Semua keputusan transport berkumpul di sini - header `Accept`,
 * `credentials: "include"`, `cache: "no-store"`, normalisasi token - supaya
 * `apiRequest` dan lapisan sesi (`sessionFetch`) tidak saling bergeser:
 * titik keluar kedua yang mengulang fetch secara manual akan kehilangan salah
 * satu keputusan itu saat salah satu diubah.
 *
 * Status HTTP TIDAK diperiksa di sini. Pemeriksaan status milik `ensureOk`
 * atau pemanggil yang memang butuh `Response` mentah (mis. laporan berkas).
 */
export async function sendRequest(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const { method = "GET", body, accessToken, signal } = options;

  const headers = new Headers({ Accept: "application/json" });

  // FormData (unggah dataset) memakai boundary multipart yang dihitung
  // browser. Menyetel `Content-Type: application/json` di atasnya justru
  // menghancurkan perду biat request, sehingga hanya body JSON yang diberi
  // header itu dan FormData dikirim apa adanya.
  const isFormData = body instanceof FormData;
  if (!isFormData && body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  // Token dinormalisasi DI SINI, bukan hanya di pemanggil. String berisi spasi
  // itu `true` di JavaScript, jadi `if (accessToken)` akan tetap men-set
  // header `Authorization: Bearer` tanpa token — dan backend memperlakukannya
  // sebagai token tak dikenal. Galat yang jauh lebih sulit dibaca daripada
  // header yang tidak dikirim sama sekali.
  const token = normalizeToken(accessToken);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    return await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers,
      // Tanpa ini browser membuang `Set-Cookie` dan sesi tidak pernah tersimpan.
      credentials: "include",
      ...(isFormData
        ? { body }
        : body !== undefined
          ? { body: JSON.stringify(body) }
          : {}),
      ...(signal ? { signal } : {}),
      // R-7: request ini tidak boleh dilayani dari cache mana pun.
      cache: "no-store",
    });
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: AUTH_ERROR_CODES.NETWORK_ERROR,
      message: "Tidak bisa menghubungi server. Periksa koneksi Anda lalu coba lagi.",
      details: cause instanceof Error ? [cause.message] : [],
    });
  }
}

/**
 * Lempar `ApiError` kalau jawaban tidak `ok`, sebelum pemanggil sempat
 * membaca `Response` yang sebenarnya jawaban galat.
 *
 * Kalau `ok`, `Response` dikembalikan UTUH tanpa menyentuh body-nya - body
 * bisa berupa JSON amplop `{ data }`, bisa juga berkas HTML/PDF/CSV milik
 * laporan, dan pengguna di sisi pemanggil.
 */
export async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response;

  // 204 dan body kosong adalah jawaban yang sah (logout). Bentuknya tidak
  // selalu JSON, jadi dibaca lewat teks lalu diparse bila bisa.
  const raw = await response.text();
  let parsed: unknown = null;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const { code, message, details } = readErrorBody(parsed);
  throw new ApiError({
    status: response.status,
    code,
    message,
    details,
    retryAfterSeconds: readRetryAfter(response.headers),
  });
}

/**
 * Permintaan JSON ke backend, mengembalikan isi `data` saja.
 *
 * Amplop `{ data }` dibuang di sini supaya pemanggil tidak perlu mengulang
 * `response.data.data` di setiap tempat.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await ensureOk(await sendRequest(path, options));

  // Logout mengembalikan 204 tanpa body. Tidak ada `data` yang perlu dibaca.
  if (response.status === 204) return undefined as T;

  const raw = await response.text();
  if (raw.length === 0) return undefined as T;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError({
      status: response.status,
      code: AUTH_ERROR_CODES.MALFORMED_RESPONSE,
      message: "Respons server tidak bisa dibaca.",
    });
  }

  // Amplop `{ data }` diperiksa, bukan diasumsikan. Tanpa pemeriksaan ini,
  // respons 2xx yang body-nya JSON tapi tanpa `data` menghasilkan `undefined`
  // yang diketik sebagai `T`, dan pemanggil baru gagal jauh dari penyebabnya -
  // membaca properti dari `undefined` di tempat yang tidak ada hubungannya
  // dengan HTTP sama sekali.
  if (typeof parsed !== "object" || parsed === null || !("data" in parsed)) {
    throw new ApiError({
      status: response.status,
      code: AUTH_ERROR_CODES.MALFORMED_RESPONSE,
      message: "Respons server tidak sesuai format yang diharapkan.",
    });
  }

  return (parsed as { data: T }).data;
}

/**
 * Petakan `ApiError` ke pesan per-field form auth.
 *
 * Mengembalikan `{ perField, formLevel }` supaya form bisa menaruh setiap
 * string di bawah input-nya dan sisanya di atas form — tanpa menebak mana yang
 * milik field mana.
 */
export function toFieldErrors(
  error: ApiError,
  fields: readonly AuthFieldName[],
): FieldErrorMap {
  return mapDetailsToFields(error.details, fields);
}
