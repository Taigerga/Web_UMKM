import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_ERROR_CODES,
  ApiError,
  apiRequest,
  readRetryAfter,
} from "@/lib/api-client";
import {
  ACCESS_COOKIE_NAME,
  clearAccessToken,
  hasAccessToken,
  normalizeToken,
  parseCookieString,
  readAccessToken,
} from "@/lib/auth-session";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mengembalikan isi `data`, bukan amplopnya", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: { user: { id: "u1" } } })),
    );

    const result = await apiRequest<{ user: { id: string } }>("/auth/login", {
      method: "POST",
      body: { email: "a@b.id" },
    });

    expect(result).toEqual({ user: { id: "u1" } });
  });

  it("selalu mengirim credentials agar cookie sesi tidak dibuang", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/auth/login", { method: "POST", body: {} });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe("include");
  });

  it("tidak pernah dilayani dari cache (R-7)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/auth/me");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.cache).toBe("no-store");
  });

  it("mengirim header Authorization hanya saat token tersedia", async () => {
    // `mockResolvedValue` akan mengembalikan Response yang SAMA untuk dua
    // panggilan, dan body Response hanya bisa dibaca sekali. Panggilan kedua
    // lalu gagal dengan "Body is unusable" — itu cacat test, bukan cacat kode.
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/auth/me", { accessToken: "  " });
    await apiRequest("/auth/me", { accessToken: "tok-123" });

    const withoutToken = new Headers(
      (fetchMock.mock.calls[0]![1] as RequestInit).headers,
    );
    const withToken = new Headers(
      (fetchMock.mock.calls[1]![1] as RequestInit).headers,
    );
    expect(withoutToken.has("Authorization")).toBe(false);
    expect(withToken.get("Authorization")).toBe("Bearer tok-123");
  });

  it("membuang amplop error dan melempar ApiError dengan status dan code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: "INVALID_CREDENTIALS", message: "Email atau password salah." } },
          { status: 401 },
        ),
      ),
    );

    const error = await apiRequest("/auth/login", { method: "POST", body: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).code).toBe("INVALID_CREDENTIALS");
    expect((error as ApiError).isUserFacing).toBe(true);
  });

  it("membaca `details` dari VALIDATION_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Permintaan tidak valid.",
              details: [
                "property role should not exist",
                "email harus berupa alamat email yang valid",
              ],
            },
          },
          { status: 400 },
        ),
      ),
    );

    const error = (await apiRequest("/auth/register", {
      method: "POST",
      body: {},
    }).catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toHaveLength(2);
  });

  it("membaca Retry-After dari header `Retry-After-auth`, bukan header polos", async () => {
    // `ThrottlerGuard` menulis `Retry-After-<nama throttler>` untuk throttler
    // bernama. Throttler auth bernama `auth`, jadi header polos tidak pernah
    // dikirim. Kalau hanya header polos yang dibaca, retry-after selalu null
    // dan pesan 429 kehilangan informasinya.
    const headers = new Headers({ "Retry-After-auth": "60" });
    expect(readRetryAfter(headers)).toBe(60);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: "THROTTLED", message: "Terlalu banyak permintaan." } },
          { status: 429, headers: { "Retry-After-auth": "45" } },
        ),
      ),
    );

    const error = (await apiRequest("/auth/login", {
      method: "POST",
      body: {},
    }).catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("THROTTLED");
    expect(error.retryAfterSeconds).toBe(45);
  });

  it("menerjemahkan kegagalan jaringan jadi NETWORK_ERROR, bukan error kosong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const error = (await apiRequest("/auth/login", {
      method: "POST",
      body: {},
    }).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });

  it("menolak respons 2xx yang body-nya JSON tapi tanpa amplop `data`", async () => {
    // Tanpa guard ini, `parsed.data` menghasilkan `undefined` yang diketik
    // sebagai `T`, dan pemanggil gagal jauh dari penyebabnya - membaca
    // properti dari `undefined` di tempat yang tidak ada hubungannya dengan
    // HTTP. `MALFORMED_RESPONSE` sudah ada persis untuk kasus ini.
    for (const body of [{ nope: 1 }, [1, 2], "bukan objek", 42, null]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const error = (await apiRequest("/auth/me").catch((e: unknown) => e)) as ApiError;
      expect(error, `body ${JSON.stringify(body)}`).toBeInstanceOf(ApiError);
      expect(error.code).toBe(AUTH_ERROR_CODES.MALFORMED_RESPONSE);
    }
  });

  it("tidak melempar pada 204 tanpa body (logout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(apiRequest("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("tidak hilang diam-diam saat body galat bukan JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>gateway</html>", { status: 502 }),
      ),
    );

    const error = (await apiRequest("/auth/me").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe("parseCookieString", () => {
  it("membaca beberapa pasangan", () => {
    expect(parseCookieString("a=1; bi_at=abc; b=2")).toEqual({
      a: "1",
      bi_at: "abc",
      b: "2",
    });
  });

  it("mempertahankan nilai yang mengandung tanda sama", () => {
    // JWT tidak mengandung `=`, tapi parser tidak boleh rapuh kalau ternyata
    // ada: memotong di `=` pertama saja tetap benar, dan `=` berikutnya milik
    // nilainya.
    expect(parseCookieString("x=a=b").x).toBe("a=b");
  });

  it("mengabaikan segmen rusak tanpa melempar", () => {
    expect(parseCookieString("; =novalue; ok=1")).toEqual({ ok: "1" });
  });
});

describe("auth-session", () => {
  afterEach(() => {
    clearAccessToken();
  });

  it("membaca token dari cookie bi_at", () => {
    document.cookie = `${ACCESS_COOKIE_NAME}=token-abc`;
    expect(readAccessToken()).toBe("token-abc");
    expect(hasAccessToken()).toBe(true);
  });

  it("mengembalikan null saat cookie tidak ada", () => {
    expect(readAccessToken()).toBeNull();
    expect(hasAccessToken()).toBe(false);
  });

  it("menghapus cookie bi_at dengan path yang sama dengan saat backend men-set-nya", () => {
    document.cookie = `${ACCESS_COOKIE_NAME}=token-abc`;
    expect(clearAccessToken()).toBe(true);
    expect(hasAccessToken()).toBe(false);
  });

  it("normalizeToken membuang string kosong supaya header tidak jadi `Bearer` telanjang", () => {
    expect(normalizeToken("  ")).toBeNull();
    expect(normalizeToken("")).toBeNull();
    expect(normalizeToken(null)).toBeNull();
    expect(normalizeToken(undefined)).toBeNull();
    expect(normalizeToken(" tok ")).toBe("tok");
  });
});
