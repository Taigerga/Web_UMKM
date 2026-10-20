/**
 * Menegakkan aturan arsitektur "satu jalur keluar ke backend".
 *
 * Latar belakangnya nyata: enam panel dashboard pernah melakukan `fetch()`
 * langsung dengan `credentials: "include"` saja, padahal `JwtAuthGuard`
 * backend hanya membaca header `Authorization`. Hasilnya 401 di console
 * SEMUA waktu dan data panel diam-diam kosong. Refactor memindahkan semua
 * ke `sessionRequest`/`sessionFetch` (refresh + satu kali percobaan ulang),
 * dan test ini mengunci aturannya: komponen dashboard tidak boleh import
 * `api-client` `API_BASE_URL` untuk membangun URL sendiri, apalagi memanggil
 * `fetch` langsung demi itu.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DASHBOARD_DIR = join(__dirname, "..", "components", "dashboard");

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("dashboard components: satu jalur ke backend", () => {
  it("tidak ada komponen dashboard yang membangun URL API manual atau memanggil fetch", () => {
    const offenders: string[] = [];

    for (const file of collectFiles(DASHBOARD_DIR)) {
      const source = readFileSync(file, "utf8");
      const rel = file.slice(file.indexOf("components"));

      // Import yang dibolehkan: ApiError/type saja untuk membaca kesalahan.
      if (/import\s+.*API_BASE_URL/.test(source)) offenders.push(rel);
      if (/import\s+.*\bsessionRequest\b.*from\s+"@\/lib\/api-client"/.test(source)) {
        offenders.push(rel);
      }
      // fetch() langsung: satu-satunya yang sah adalah di lib/ (api-client,
      // session-refresh). Di komponen dashboard boleh fetch ke sumber lain,
      // tapi tidak ke $(API_BASE_URL) maupun ke path dengan prefix /api/v1.
      if (/fetch\(\s*`\$\{API_BASE_URL\}/.test(source)) offenders.push(rel);
      if (/fetch\([^)]*\/api\/v1\//.test(source)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  it("dashboard-data.ts tidak memakai fetch langsung - hanya sessionRequest/sessionFetch", () => {
    const source = readFileSync(
      join(__dirname, "..", "lib", "dashboard-data.ts"),
      "utf8",
    );
    // `fetch` sebagai identifier lokal tidak muncul sama sekali; semua
    // pemanggil melalui sessionRequest/sessionFetch yang diekspor modul sesi.
    expect(source).not.toMatch(/\bfetch\(/);
  });
});
