/**
 * Bentuk path laporan per tipe dan format, sebagai data murni.
 *
 * Endpoint laporan backend bentuknya statis per kombinasi
 * (`sales-summary`, `sales-summary/xlsx`, `sales-summary/pdf`,
 * `detailed`, `detailed/xlsx`, `forecast/:productId`, `forecast/:productId/pdf`),
 * jadi pemilihan format adalah penambahan suffix, bukan query.
 * Memisahkannya dari komponen membuat mapping ini bisa diuji tanpa render.
 */

export type ReportType = "sales-summary" | "detailed" | "forecast";
export type ReportFormat = "html" | "csv" | "xlsx" | "pdf";

/** Format yang sah per tipe laporan; dipakai untuk menormalkan pilihan. */
export const ALLOWED_FORMATS: Record<ReportType, readonly ReportFormat[]> = {
  "sales-summary": ["html", "xlsx", "pdf"],
  detailed: ["csv", "xlsx"],
  forecast: ["html", "pdf"],
};

/**
 * Path laporan terhadap `/api/v1`.
 *
 * `storeId`, `type`, dan `format` tentukan rute; laporan forecast wajib
 * punya `productId` (komponen memvalidasi keberadaannya sebelum memanggil).
 */
export function reportPath(
  storeId: string,
  type: ReportType,
  format: ReportFormat,
  opts: { productId?: string } = {},
): string {
  const base = `/stores/${encodeURIComponent(storeId)}/reports`;

  if (type === "sales-summary") {
    const suffix = format === "html" ? "" : `/${format}`;
    return `${base}/sales-summary${suffix}`;
  }

  if (type === "detailed") {
    // Format default `detailed` adalah CSV; backend tidak punya rute /csv
    // terpisah. XLSX punya rute sendiri karena isinya multi-sheet.
    return format === "xlsx" ? `${base}/detailed/xlsx` : `${base}/detailed`;
  }

  const suffix = format === "pdf" ? "/pdf" : "";
  return `${base}/forecast/${encodeURIComponent(opts.productId ?? "")}${suffix}`;
}
