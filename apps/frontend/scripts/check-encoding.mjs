// Deteksi karakter non-ASCII yang TIDAK disengaja di komentar kode.
// Em-dash (—) itu disengaja dan sah; CJK dan simbol aneh lain tidak.
// Dipakai sebagai pemeriksaan mandiri sebelum commit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOTS = ["app", "components", "lib", "__tests__", "proxy.ts"];
const EXTS = new Set([".ts", ".tsx"]);
const ALLOWED = /[—–‘’“”•…×→]/;

function walk(path) {
  const entries = readdirSync(path);
  const out = [];
  for (const entry of entries) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTS.has(extname(full))) out.push(full);
  }
  return out;
}

const files = [];
for (const root of ROOTS) {
  try {
    if (statSync(root).isDirectory()) files.push(...walk(root));
    else if (EXTS.has(extname(root))) files.push(root);
  } catch {
    /* path belum ada */
  }
}

let bad = 0;
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const stripped = line.replace(ALLOWED, "");
      if (/[^\x00-\x7F]/.test(stripped)) {
        console.log(`${file}:${i + 1}: ${line.trim()}`);
        bad += 1;
      }
    });
}
console.log(bad === 0 ? "OK: tidak ada karakter asing yang tidak disengaja" : `${bad} baris perlu diperiksa`);