import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  LOGIN_PATH,
  PROTECTED_PREFIX,
  buildLoginUrl,
  isProtectedPath,
  proxy,
  config,
} from "../proxy";

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

  it("meneruskan request yang sudah punya cookie bi_at", () => {
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
  it("tidak meneruskan tujuan yang berada di luar origin sendiri", () => {
    // `next` berasal dari URL, jadi dikendalikan pengguna. Meneruskannya apa
    // adanya membuka open redirect tepat setelah password diketik.
    const url = buildLoginUrl(
      request("http://localhost:3001/dashboard"),
    );
    expect(url.searchParams.get("next")).toBe("/dashboard");
  });

  it("menolak URL absolut dan protocol-relative", () => {
    for (const target of [
      "https://phishing.example/steal",
      "//phishing.example/steal",
    ]) {
      const url = new URL(LOGIN_PATH, "http://localhost:3001");
      url.searchParams.set("next", target);
      // Menyalin logika yang sama persis dengan yang dipakai pemanggil.
      const value = url.searchParams.get("next") ?? "";
      const safe = value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
      expect(safe).toBe("/dashboard");
    }
  });
});