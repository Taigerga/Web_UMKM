import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  firstFieldError,
  formatFormLevelError,
  mapDetailsToFields,
} from "@/lib/auth-errors";

/**
 * `details` yang dipakai di sini adalah SALINAN LITERAL dari respons backend
 * yang dijalankan sungguhan, bukan contoh karangan:
 *
 *   curl -X POST localhost:3000/api/v1/auth/register \
 *        -d '{"email":"bukan-email","name":"A","password":"pendek","role":"ADMIN"}'
 *
 * yang membalas:
 *
 *   {"error":{"code":"VALIDATION_ERROR","message":"Permintaan tidak valid.",
 *     "details":["property role should not exist",
 *                "email harus berupa alamat email yang valid",
 *                "name minimal 2 karakter",
 *                "password minimal 8 karakter"]}}
 *
 * Bentuk inilah yang memb IMPORT keputusan desain: `details` adalah array of
 * STRING, tanpa nama field terstruktur. Test di bawah mengunci apa yang
 * sebenarnya terjadi, supaya penyesuaian UI tidak mengira bentuknya sudah
 * pernah berupa objek.
 */
const REGISTER_DETAILS = [
  "property role should not exist",
  "email harus berupa alamat email yang valid",
  "name minimal 2 karakter",
  "password minimal 8 karakter",
];

const REGISTER_FIELDS = ["name", "email", "password", "passwordConfirmation"] as const;

describe("mapDetailsToFields", () => {
  it("menempatkan detail validasi di bawah field yang tepat", () => {
    const map = mapDetailsToFields(REGISTER_DETAILS, REGISTER_FIELDS);

    expect(map.perField.email).toEqual(["email harus berupa alamat email yang valid"]);
    expect(map.perField.name).toEqual(["name minimal 2 karakter"]);
    expect(map.perField.password).toEqual(["password minimal 8 karakter"]);
    // `property role should not exist` tetap form-level, diuji terpisah.
    expect(map.formLevel).toEqual(["property role should not exist"]);
  });

  it("tidak menautkan detail ke field yang salah", () => {
    const map = mapDetailsToFields(REGISTER_DETAILS, REGISTER_FIELDS);

    // Field yang TIDAK bermasalah harus tetap kosong. Kalau detail `name`
    // bocor ke `email`, pengguna akan memperbaiki email yang sebenarnya sudah
    // benar.
    expect(map.perField.passwordConfirmation).toBeUndefined();
  });

  it("menaruh pesan field-tak-dikenal di level form, bukan di bawah input mana pun", () => {
    const map = mapDetailsToFields(REGISTER_DETAILS, REGISTER_FIELDS);

    // R-35 melarang form mengirim `role`. Kalau sampai muncul, itu masalah
    // kontrak — dan menempelkannya ke bawah `email` akan menyesatkan.
    expect(map.formLevel).toEqual(["property role should not exist"]);
    expect(Object.values(map.perField)).not.toContainEqual(
      expect.stringContaining("role"),
    );
  });

  it("tidak salah tangkap `password` saat field yang dicari `passwordConfirmation`", () => {
    // Detail begins-with `password` harus JAUH dari `passwordConfirmation`.
    // Tanpa batas kata di pola pencocokan, `password minimal 8 karakter`
    // akan ikut cocok dan muncul di bawah input yang bukan penyebabnya.
    const map = mapDetailsToFields(["password minimal 8 karakter"], REGISTER_FIELDS);
    expect(map.perField.password).toEqual(["password minimal 8 karakter"]);
    expect(map.perField.passwordConfirmation).toBeUndefined();
  });

  it("menaruh detail tak dikenal di level form", () => {
    const map = mapDetailsToFields(["entah apa"], REGISTER_FIELDS);
    expect(map.formLevel).toEqual(["entah apa"]);
    expect(map.perField).toEqual({});
  });

  it("mengabaikan string kosong", () => {
    const map = mapDetailsToFields(["", "   ", "email harus berupa alamat email yang valid"], REGISTER_FIELDS);
    expect(map.formLevel).toEqual([]);
    expect(map.perField.email).toHaveLength(1);
  });

  it("mengumpulkan beberapa pesan untuk field yang sama", () => {
    const map = mapDetailsToFields(
      ["email harus berupa alamat email yang valid", "email tidak boleh kosong"],
      REGISTER_FIELDS,
    );
    expect(map.perField.email).toHaveLength(2);
  });
});

describe("firstFieldError", () => {
  it("mengembalikan pesan pertama atau undefined", () => {
    const map = mapDetailsToFields(REGISTER_DETAILS, REGISTER_FIELDS);
    expect(firstFieldError(map, "email")).toBe("email harus berupa alamat email yang valid");
    expect(firstFieldError(map, "passwordConfirmation")).toBeUndefined();
  });
});

describe("formatFormLevelError", () => {
  it("menggabungkan pesan level form", () => {
    const map = mapDetailsToFields(["satu", "dua"], REGISTER_FIELDS);
    expect(formatFormLevelError(map)).toBe("satu dua");
  });

  it("mengembalikan undefined saat bersih", () => {
    expect(formatFormLevelError({ perField: {}, formLevel: [] })).toBeUndefined();
  });
});

/**
 * Token kontras.
 *
 * `--color-line-strong` tadinya `#c6cedb` = 1.58:1 di putih, di bawah
 * minimum 3:1 WCAG 1.4.11 untuk batas kontrol non-teks. `Input`, `Select`, dan
 * `Textarea` memakainya, jadi di form auth batas field praktis hilang. Test ini
 * mengunci perbaikannya supaya token itu tidak kembali ke nilai lama tanpa
 * ada yangSadarkannya.
 */
function readTokens(): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

function relativeLuminance(hex: string): number {
  // `#` HARUS dibuang dulu. Tanpa itu, potongan pertama adalah "#7" dan
  // `parseInt("#7", 16)` menghasilkan NaN yang meracuni seluruh perhitungan.
  const clean = hex.replace(/^#/, "");
  const channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4),
  );
  expect(Number.isNaN(r! + g! + b!)).toBe(false);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

describe("kontras batas kontrol form", () => {
  beforeAll(() => {
    expect(readTokens()).not.toEqual({});
  });

  it("--color-line-strong mencapai 3:1 di surface tempat form diletakkan", () => {
    const tokens = readTokens();
    const ratio = contrastRatio(tokens["line-strong"]!, tokens["surface"]!);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("--color-line-strong mencapai 3:1 juga di atas paper", () => {
    const tokens = readTokens();
    const ratio = contrastRatio(tokens["line-strong"]!, tokens["paper"]!);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("state hover tetap 3:1 (hover lama memakai opacity 80% dan gagal)", () => {
    const tokens = readTokens();
    const ratio = contrastRatio(tokens["line-strong-hover"]!, tokens["surface"]!);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});
