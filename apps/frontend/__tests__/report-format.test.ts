import { describe, expect, it } from "vitest";

import { ALLOWED_FORMATS, reportPath } from "@/lib/report-format";

/**
 * Mapping tipe + format laporan ke path endpoint backend.
 * Bukti: `apps/backend/src/reports/reports.controller.ts` hanya punya
 * rute statis per kombinasi, jadi format salah = 404 diam-diam.
 */
describe("reportPath", () => {
  it("sales-summary tanpa suffix untuk HTML", () => {
    expect(reportPath("s1", "sales-summary", "html")).toBe(
      "/stores/s1/reports/sales-summary",
    );
  });

  it("sales-summary menambahkan suffix xlsx/pdf", () => {
    expect(reportPath("s1", "sales-summary", "xlsx")).toBe(
      "/stores/s1/reports/sales-summary/xlsx",
    );
    expect(reportPath("s1", "sales-summary", "pdf")).toBe(
      "/stores/s1/reports/sales-summary/pdf",
    );
  });

  it("detailed memakai rute xlsx khusus, selain itu rute csv default", () => {
    expect(reportPath("s1", "detailed", "csv")).toBe("/stores/s1/reports/detailed");
    expect(reportPath("s1", "detailed", "xlsx")).toBe(
      "/stores/s1/reports/detailed/xlsx",
    );
  });

  it("forecast menyertakan produk; pdf punya rute sendiri", () => {
    expect(reportPath("s1", "forecast", "html", { productId: "p1" })).toBe(
      "/stores/s1/reports/forecast/p1",
    );
    expect(reportPath("s1", "forecast", "pdf", { productId: "p1" })).toBe(
      "/stores/s1/reports/forecast/p1/pdf",
    );
  });

  it("storeId di-encode supaya nilai aneh tidak merusak path", () => {
    expect(reportPath("a/b", "detailed", "csv")).toContain(
      "/stores/a%2Fb/reports/detailed",
    );
  });
});

describe("ALLOWED_FORMATS", () => {
  it("format html tidak pernah sah untuk detailed (default-nya csv)", () => {
    expect(ALLOWED_FORMATS.detailed).not.toContain("html");
  });

  it("tidak ada tipe laporan dengan daftar format kosong", () => {
    for (const formats of Object.values(ALLOWED_FORMATS)) {
      expect(formats.length).toBeGreaterThan(0);
    }
  });
});
