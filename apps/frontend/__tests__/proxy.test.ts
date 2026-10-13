import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  LOGIN_PATH,
  PROTECTED_PREFIX,
  buildLoginUrl,
  config,
  isProtectedPath,
  proxy,
} from "../proxy";
import { resolveSafeRedirect } from "@/components/auth/login-form";

function request(url: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(new Request(url));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

describe("isProtectedPath", () => {
  it("matcher dan penentu path memakai prefix yang sama", () => {
    // `matcher` harus berupa string LITERAL (dibaca saat build lewat analisis
    // statis), sementara `isProtectedPath` memakai konstanta. Keduanya menulis
    // prefix yang sama; test ini mengunci agar tidak bisa menyimpang tanpa
    // ada yang sadarkannya.
    expect(config.matcher).toEqual([`${PROTECTED_PREFIX}/:path*`, PROTECTED_PREFIX]);
  });

  it("melindungi /dashboard dan semua turunannya", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/laporan")).toBe(true);
    expect(isProtectedPath("/dashboard/toko/produk")).toBe(true);
  });

  it("TIDAK melindungi halaman publik yang namanya diawali dashboard", () => {
    // `startsWith('/dashboard')` polos akan ikut mencocokkan ketiganya. Itu
    // akan mengirim pengguna ke halaman login untuk halaman yang sebenarnya
    // publik — redirect yang tidak bisa dijelaskan pengguna.
    expect(isProtectedPath("/dashboard-penjualan")).toBe(false);
    expect(isProtectedPath("/dashboards")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/register")).toBe(false);
  });
});

describe("proxy", () => {
  it("mengalihkan /dashboard tanpa cookie ke halaman login", () => {
    const response = proxy(request("http://localhost:3001/dashboard"));

    expect(response.status).toBe(307);
    expect(location(response)).toContain(LOGIN_PATH);
  });

  it("mengalihkan halaman dalam yang tanpa cookie", () => {
    const response = proxy(request("http://localhost:3001/dashboard/toko/produk"));

    expect(response.status).toBe(307);
    expect(location(response)).toContain(LOGIN_PATH);
  });

  it("mempertahankan tujuan di query `next`", () => {
    const response = proxy(request("http://localhost:3001/dashboard/laporan?periode=2026-09"));

    expect(location(response)).toContain("next=%2Fdashboard%2Flaporan");
  });

  it("meneruskan request yang sudah punya cookie access", () => {
    // Header `x-middleware-next` adalah tanda NextResponse.next(). Cookie di
    // sini sengaja TIDAK diverifikasi: R-33 menetapkan proxy sebagai gate UX,
    // dan verifikasi sesungguhnya tetap di `JwtAuthGuard` backend.
    const response = proxy(
      request("http://localhost:3001/dashboard", { bi_at: "apa-saja" }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(location(response)).toBe("");
  });

  it("mengabaikan halaman publik", () => {
    for (const path of ["/", "/login", "/register", "/faq"]) {
      const response = proxy(request(`http://localhost:3001${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
});

describe("buildLoginUrl", () => {
  it("meneruskan tujuan sebagai path internal", () => {
    const url = buildLoginUrl(request("http://localhost:3001/dashboard"));
    expect(url.searchParams.get("next")).toBe("/dashboard");
  });

  it("mempertahankan query string tujuan", () => {
    const url = buildLoginUrl(
      request("http://localhost:3001/dashboard/laporan?periode=2026-09"),
    );
    expect(url.searchParams.get("next")).toBe("/dashboard/laporan?periode=2026-09");
  });

  /**
   * Batas sesungguhnya ada di `resolveSafeRedirect`, bukan di sini.
   *
   * `target` dibentuk dari `nextUrl.pathname` + `nextUrl.search`, dan keduanya
   * selalu diawali `/`, jadi guard `startsWith("/")` di `buildLoginUrl` tidak
   * pernah menolak apa pun. Test ini sengaja menguji apa yang sebenarnya
   * terjadi: `//evil.example` LOLOS dari `buildLoginUrl`, dan yang menahannya
   * adalah `resolveSafeRedirect`. Menyembunyikan hal itu akan membuat test
   * kelihatan melindungi sesuatu yang sebenarnya tidak dilindungi.
   */
  it("MEMBUKTIKAN guard di buildLoginUrl tidak menahan protocol-relative", () => {
    const url = buildLoginUrl(request("http://localhost:3001//evil.example/dashboard"));
    expect(url.searchParams.get("next")).toBe("//evil.example/dashboard");
  });
});

describe("composition: proxy -> login form", () => {
  /**
   * Test yang benar-benar menutup jalur open redirect.
   *
   * Dua berkas terpisah, dua mekanisme berbeda: `buildLoginUrl` menyusun `next`,
   * `resolveSafeRedirect` memakainya. Yang diuji di sini adalah apa yang
   * SEBENARNYA terjadi pada request nyata, bukan salinan logika yang ditulis
   * dua kali dan dijamin benar karena tidak pernah dibandingkan ke aslinya.
   */
  it("apapun target dari proxy, redirect akhirnya tetap internal", () => {
    const hostile = [
      "http://localhost:3001//evil.example/dashboard",
      "http://localhost:3001/dashboard?next=https://evil.example",
      "http://localhost:3001/dashboard/../../evil",
      "http://localhost:3001/dashboard?a=//evil.example",
      "http://localhost:3001/dashboard?x=%2F%2Fevil.example",
    ];

    for (const url of hostile) {
      const built = buildLoginUrl(request(url));
      const resolved = resolveSafeRedirect(built.searchParams.get("next"));

      // Invarian yang diuji: hasilnya SELALU path internal pada origin yang
      // sama. Bukan "harus persis /dashboard" - `/dashboard?next=https://...`
      // tetap aman, karena `https://` hanya muncul sebagai NILAI QUERY, bukan
      // sebagai tujuan navigasi. Yang berbahaya adalah hasil yang akan
      // diartikan peramban sebagai origin lain, yaitu diawali `//` atau punya
      // scheme.
      expect(resolved, `harus path internal untuk ${url}`).toMatch(/^\/(?!\/)/);
      expect(resolved, `tanpa scheme untuk ${url}`).not.toMatch(
        /^[a-z][a-z0-9+.-]*:/i,
      );
    }
  });

  it("tetap meneruskan tujuan yang wajar apa adanya", () => {
    const built = buildLoginUrl(
      request("http://localhost:3001/dashboard/laporan?periode=2026-09"),
    );
    expect(resolveSafeRedirect(built.searchParams.get("next"))).toBe(
      "/dashboard/laporan?periode=2026-09",
    );
  });
});
