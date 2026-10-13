import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveSafeRedirect } from "@/components/auth/login-form";
import {
  passwordsMatch,
  scorePassword,
} from "@/components/auth/register-form";

describe("resolveSafeRedirect", () => {
  it("meneruskan path internal yang wajar", () => {
    expect(resolveSafeRedirect("/dashboard")).toBe("/dashboard");
    expect(resolveSafeRedirect("/dashboard/laporan?periode=2026-09")).toBe(
      "/dashboard/laporan?periode=2026-09",
    );
  });

  it("menolak tujuan ke origin lain (open redirect)", () => {
    // Form login adalah tempat TERBAIK untuk open redirect: pengguna sudah
    // mengetikkan password-nya di situs yang benar tepat sebelum diarahkan ke
    // situs lain.
    expect(resolveSafeRedirect("https://phishing.example/steal")).toBe("/dashboard");
    // `//host` diawali `/` tapi tetap menunjuk situs lain.
    expect(resolveSafeRedirect("//phishing.example/steal")).toBe("/dashboard");
    expect(resolveSafeRedirect("/\\phishing.example")).toBe("/dashboard");
  });

  it("memakai default saat nilainya bukan string", () => {
    expect(resolveSafeRedirect(undefined)).toBe("/dashboard");
    expect(resolveSafeRedirect(null)).toBe("/dashboard");
    expect(resolveSafeRedirect("")).toBe("/dashboard");
  });
});

describe("scorePassword", () => {
  it("tidak pernah memberi nilai tinggi untuk password yang ditolak backend", () => {
    // Backend menolak < 8 karakter. Skor yang tinggi untuk isi yang pasti
    // ditolak akan membuat indikatornya tidak bisa dipercaya.
    const short = scorePassword("Ab1!");
    expect(short.label).toBe("Terlalu pendek");
    expect(short.score).toBe(0);
  });

  it("menaikkan skor untuk password yang panjang dan beragam", () => {
    expect(scorePassword("").label).toBe("Belum diisi");
    expect(scorePassword("kokosong").label).toBe("Lemah");
    expect(scorePassword("password").score).toBeLessThanOrEqual(
      scorePassword("K0k0-Buku-Kas!").score,
    );
    expect(scorePassword("K0k0-Buku-Kas!").label).toBe("Sangat kuat");
  });

  it("skor tidak pernah keluar dari 0..4", () => {
    for (const candidate of [
      "",
      "a",
      "password",
      "Password123",
      "Password123!",
      "K0k0-Buku-Kas-Yang-Panjang-Banget",
    ]) {
      const { score } = scorePassword(candidate);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});

describe("passwordsMatch", () => {
  it("menyatakan belum terisi sebagai cocok supaya tidak langsung error", () => {
    expect(passwordsMatch("rahasia", "")).toBe(true);
  });

  it("menolak yang berbeda", () => {
    expect(passwordsMatch("rahasia", "rahasia")).toBe(true);
    expect(passwordsMatch("rahasia", "Rahasia")).toBe(false);
    expect(passwordsMatch("rahasia", "rahasia ")).toBe(false);
  });
});

describe("AuthShell", () => {
  it("halaman auth punya landmark dan heading yang bisa Dijangkau", async () => {
    const { AuthShell } = await import("@/components/auth/auth-shell");
    render(
      <AuthShell title="Masuk ke akun Anda" description="Deskripsi singkat.">
        <p>Isi form</p>
      </AuthShell>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Masuk ke akun Anda" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: /BisnisInsight/ })).toBeDefined();
  });
});
