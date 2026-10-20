// Generator data contoh "Toko Demo" untuk unggah dataset di dashboard BisnisInsight.
// Deterministik (PRNG berbijak), 61 hari (2026-09-01 .. 2026-10-31), format 12 kolom
// persis template backend (GET /datasets/template.csv).
//
// Desain supaya kelima analisis ML punya sesuatu yang artinya:
// - tren harian naik-turun dengan angkat akhir pekan  -> grafik omzet & peramalan
// - 3 hari janggal (lonjakan bulk + hari sepi ekstrem) -> anomali menemukan target
// - customer dengan kebiasaan belanja berbeda          -> segmen RFM & churn terlihat
// - banyak order 2-4 item berbeda                      -> basket menemukan pasangan

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// mulberry32: PRNG kecil yang deterministik dan cukup merata.
let seed = 0x18d2b4a1;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

/** Produk tetap: harga IDR wajar untuk kafe/toko sembako kecil. */
const PRODUCTS = [
  { code: "P1",  name: "Teh Botol 350ml",      category: "Minuman",  unit: "botol",   price: 5000 },
  { code: "P2",  name: "Kopi Bubuk Arabika 100g", category: "Minuman", unit: "pack",  price: 18000 },
  { code: "P3",  name: "Gula Aren 500g",       category: "Bahan",    unit: "kemasan", price: 15000 },
  { code: "P4",  name: "Kacang Panggang 200g", category: "Makanan",  unit: "kemasan", price: 12000 },
  { code: "P5",  name: "Keripik Singkong 250g", category: "Makanan", unit: "pack",    price: 8000 },
  { code: "P6",  name: "Susu UHT 1L",          category: "Minuman",  unit: "kotak",   price: 17000 },
  { code: "P7",  name: "Minyak Goreng 1L",     category: "Bahan",    unit: "botol",   price: 19000 },
  { code: "P8",  name: "Beras Premium 5kg",    category: "Bahan",    unit: "karung",  price: 72000 },
  { code: "P9",  name: "Roti Tawar Klasik",    category: "Makanan",  unit: "pack",    price: 14000 },
  { code: "P10", name: "Air Mineral 1500ml",   category: "Minuman",  unit: "botol",   price: 6000 },
];

/** 25 pelanggan. `w` = kecenderungan muncul (rajin vs jarang).
 *  C19 sengaja berhenti datang mid-September -> target uji churn. */
const CUSTOMERS = [];
const NAMES = [
  "Ridho", "Siti", "Budi", "Sari", "Andra", "Dewi", "Fajar", "Gita", "Hendra",
  "Indah", "Joko", "Kirana", "Lutfi", "Maya", "Nadia", "Oki", "Putri", "Rani",
  "Salim", "Tia", "Umar", "Vina", "Wulan", "Yoga", "Zahra",
];
for (let i = 0; i < NAMES.length; i++) {
  CUSTOMERS.push({ code: `C${i + 1}`, name: NAMES[i], w: 0.4 + rand() * 2.6 });
}

const START = new Date("2026-09-01T00:00:00Z");
const DAYS = 61;
const ANOMALY_DATES = new Set(["2026-09-17", "2026-10-09", "2026-10-26"]);
// C19 (Salim) pembeli tetap yang stopped mid-september -> churn.
const CHURN_CUTOFF = new Date("2026-09-14T00:00:00Z");

const weightOf = (i, date) =>
  CUSTOMERS[i].code === "C19" && date.getTime() > CHURN_CUTOFF.getTime() ? 0 : CUSTOMERS[i].w;

const rows = [];
let orderNo = 0;

for (let d = 0; d < DAYS; d++) {
  const date = new Date(START.getTime() + d * 86400000);
  const iso = date.toISOString().slice(0, 10);
  const dow = date.getUTCDay(); // 0 = Minggu, 6 = Sabtu
  const weekend = dow === 0 || dow === 6;

  let orderCount;
  if (ANOMALY_DATES.has(iso)) {
    // 17 Sep & 26 Okt: hari pemborongan besar. 9 Okt: hari henti total (sepi).
    orderCount = iso === "2026-10-09" ? 0 : 16;
  } else {
    orderCount = randInt(weekend ? 7 : 4, weekend ? 12 : 7);
  }

  for (let o = 0; o < orderCount; o++) {
    // Pilih pelanggan tertimbang (recently/frequency terbentuk otomatis).
    const weights = CUSTOMERS.map((_, i) => weightOf(i, date));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let ci = 0;
    while (r > weights[ci]) {
      r -= weights[ci];
      ci += 1;
    }
    const customer = CUSTOMERS[ci];

    // SATU order_id untuk semua item di order ini - dasar analisis basket:
    // backend mengelompokkan item yang dibeli bersama lewat order_id yang sama.
    orderNo += 1;
    const orderId = `ORD-${orderNo}`;

    const items = randInt(1, 4);
    const chosen = new Set();
    for (let it = 0; it < items; it++) {
      let p = pick(PRODUCTS);
      while (chosen.has(p.code)) p = pick(PRODUCTS);
      chosen.add(p.code);

      // Hari anomali: qty borongan besar; hari biasa: 1-5.
      const qty = ANOMALY_DATES.has(iso) ? randInt(12, 30) : randInt(1, 5);
      const unitPrice = p.price;
      rows.push([
        orderId,
        iso,
        customer.code,
        customer.name,
        p.code,
        p.name,
        p.category,
        String(qty),
        p.unit,
        String(unitPrice),
        String(qty * unitPrice),
        rand() < 0.35 ? "online" : "offline",
      ].join(","));
    }
  }
}

const HEADER = "order_id,order_date,customer_code,customer_name,product_code,product_name,category,qty,unit,unit_price,total_price,channel";
const outDir = join(process.cwd(), "data", "samples");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "demo-toko-2bulan.csv");
writeFileSync(outPath, [HEADER, ...rows].join("\n") + "\n", "utf8");

// Ringkasan supaya generatornya bisa diaudit tanpa membuka CSV-nya.
const byDate = new Map();
for (const r of rows) {
  const d = r.split(",")[1];
  byDate.set(d, (byDate.get(d) ?? 0) + 1);
}
console.log(`Tulis ${rows.length} baris -> ${outPath}`);
console.log(`Periode: ${[...byDate.keys()].sort()[0]} .. ${[...byDate.keys()].sort().pop()} (${byDate.size} hari)`);
