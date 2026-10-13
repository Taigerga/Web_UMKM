import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { resolveSafeRedirect } from "@/components/auth/login-form";

/**
 * Penjaga open redirect, diuji dari query parameter sampai nilai yang benar-benar
 * diserahkan ke `window.location.replace`.
 *
 * ## Kenapa uji bentuk ("apakah mulai dengan `/`?") tidak cukup
 *
 * Nilai yang lolos semua pemeriksaan struktur bisa tetap berakhir di origin lain,
 * karena `window.location.replace` - bukan fungsi penyaringan kita - yang
 * melakukan transformasinya. Parser URL WHATWG membuang tab, LF, dan CR dari
 * input SEBELUM mem-parse-nya:
 *
 *   new URL('/<tab>/evil.example', 'http://localhost:3001')
 *     -> 'http://evil.example/'
 *
 * Jadi nilai `/<tab>/evil.example` diawali `/`, tidak mengandung backslash, dan
 * lolos setiap pemeriksaan struktur yang pernah ditulis - lalu tetap mengirim
 * pengguna ke situs lain tepat setelah ia mengetikkan password-nya. Di sinilah
 * letaknya bahaya open redirect pada halaman login: pengguna mengetik kredensial
 * di situs yang benar, lalu langsung dibawa ke situs lain.
 *
 * Karena itu test di sini tidak memeriksa bentuk nilainya, tapi **asal tujuan
 * akhirnya** - untuk setiap input, termasuk yang lolos pemeriksaan struktur.
 */

/** Asal tempat halaman login dijalankan. */
const ORIGIN = "http://localhost:3001";

/**
 * Nilai serangan berbasis karakter kontrol.
 *
 * Karakter kontrolnya dibangkitkan lewat `String.fromCharCode` supaya berkas
 * sumber tetap berisi teks ASCII yang bisa dibaca, dan supaya byte kontrolnya
 * tidak hilang diam-diam saat berkas ini diedit atau disalin.
 */
const CONTROL_CHAR_ATTACKS = [
  { name: "tab", code: 0x09, encoded: "%09" },
  { name: "line feed", code: 0x0a, encoded: "%0A" },
  { name: "carriage return", code: 0x0d, encoded: "%0D" },
  { name: "NUL", code: 0x00, encoded: "%00" },
  { name: "unit separator", code: 0x1f, encoded: "%1F" },
  { name: "delete", code: 0x7f, encoded: "%7F" },
].map((attack) => ({
  name: attack.name,
  encoded: attack.encoded,
  raw: `/${String.fromCharCode(attack.code)}/evil.example`,
}));

/** Bentuk serangan lain yang juga harus tertangkap. */
const OTHER_ATTACKS = [
  { name: "protocol-relative", value: "//evil.example/dashboard" },
  { name: "absolute URL", value: "https://evil.example/steal" },
  { name: "backslash", value: "/\\evil.example" },
  { name: "backslash ganda", value: "\\\\evil.example" },
  { name: "path relatif tanpa slash", value: "evil.example" },
];

/**
 * Alur yang diuji: request nyata -> `searchParams` -> `resolveSafeRedirect` ->
 * nilai untuk `window.location.replace`.
 *
 * `buildLoginUrl` sengaja tidak dipakai di sini, supaya jaminan ini juga
 * berlaku kalau `next` datang dari sumber lain di masa depan. Yang diuji adalah
 * kontrak dari query parameter sampai tujuan akhir, bukan cara nilainya dibentuk.
 */
function redirectTargetFromUrl(url: string): string {
  const params = new URL(url).searchParams;
  return resolveSafeRedirect(params.get("next"));
}

/** Asal tujuan setelah peramban memproses nilai tadi. */
function finalOrigin(target: string): string {
  return new URL(target, ORIGIN).origin;
}

describe("open redirect: dari query `next` sampai tujuan akhir", () => {
  it("menolak nilai dengan karakter kontrol yang lolos pemeriksaan struktur", () => {
    for (const attack of CONTROL_CHAR_ATTACKS) {
      const target = redirectTargetFromUrl(
        `http://localhost:3001/login?next=/${attack.encoded}/evil.example`,
      );

      // Guard utama: asal tujuan akhir TETAP milik kita.
      expect(finalOrigin(target), `asal untuk ${attack.name}`).toBe(ORIGIN);
    }
  });

  it("menolak nilai mentah dengan karakter kontrol, bukan hanya yang ter-encode", () => {
    // Nilai dari `searchParams` sudah ter-decode parser, jadi bentuk yang
    // sampai ke fungsi adalah yang mentah (`/<tab>/`), bukan `%09`.
    for (const attack of CONTROL_CHAR_ATTACKS) {
      expect(finalOrigin(resolveSafeRedirect(attack.raw)), `asal untuk ${attack.name}`).toBe(
        ORIGIN,
      );
    }
  });

  it("serangan karakter kontrol memang benar-benar keluar dari origin tanpa proteksi", () => {
    // Memastikan test di atas menguji sesuatu. Kalau URL-nya ternyata tidak
    // pernah keluar dari origin, guard-nya sedang tidak diuji apa pun dan test
    // bisa lulus karena alasan yang salah.
    const escapes = CONTROL_CHAR_ATTACKS.filter(
      (attack) => new URL(attack.raw, ORIGIN).origin !== ORIGIN,
    );

    expect(escapes.map((attack) => attack.name)).toEqual(
      expect.arrayContaining(["tab", "line feed", "carriage return"]),
    );
  });

  it("menolak bentuk serangan lain", () => {
    for (const attack of OTHER_ATTACKS) {
      const target = resolveSafeRedirect(attack.value);
      expect(finalOrigin(target), `asal untuk ${attack.name}`).toBe(ORIGIN);
    }
  });

  it("nilai dari searchParams sebuah NextRequest juga tertangkap", () => {
    // Jalur yang sama dengan `app/login/page.tsx`: `searchParams` dibaca dari
    // `NextRequest`, lalu diteruskan ke form.
    for (const attack of CONTROL_CHAR_ATTACKS) {
      const request = new NextRequest(
        new Request(`http://localhost:3001/login?next=/${attack.encoded}/evil.example`),
      );
      const target = resolveSafeRedirect(request.nextUrl.searchParams.get("next"));

      expect(finalOrigin(target), `asal untuk ${attack.name}`).toBe(ORIGIN);
    }
  });

  it("tujuan yang wajar tetap diteruskan apa adanya", () => {
    for (const value of [
      "/dashboard",
      "/dashboard/laporan?periode=2026-09",
      "/dashboard/toko/produk#bagian",
    ]) {
      expect(resolveSafeRedirect(value)).toBe(value);
      expect(finalOrigin(resolveSafeRedirect(value))).toBe(ORIGIN);
    }
  });

  it("nilai kosong, bukan string, atau path akar jatuh ke default yang aman", () => {
    for (const value of [undefined, null, "", "   ", "/"]) {
      expect(finalOrigin(resolveSafeRedirect(value))).toBe(ORIGIN);
    }
  });
});
