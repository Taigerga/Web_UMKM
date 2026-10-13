import mysql from "mysql2/promise";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hash } from "@node-rs/argon2";

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL || "mysql://root@127.0.0.1:3306/bisnis_insight_analytics_db",
  localInfile: true,
});
await conn.query("SET GLOBAL local_infile = 1");
await conn.query("SET FOREIGN_KEY_CHECKS = 0");
await conn.query("SET UNIQUE_CHECKS = 0");

const DEMO_USER_ID = "8f63d4ba-1f11-4f37-9f44-0d3d68dcb001";
const DEMO_STORE_ID = "8f63d4ba-1f11-4f37-9f44-0d3d68dcb021";
const PRODUCT_COUNT = 100;
const CUSTOMER_COUNT = 200;
const ORDER_COUNT = 200;
const NOW = "2026-01-01 00:00:00";

function uuid() {
  return crypto.randomUUID();
}

// Clean previous demo data - truncate all to avoid lock timeout
await conn.query("TRUNCATE TABLE order_items");
await conn.query("TRUNCATE TABLE orders");
await conn.query("TRUNCATE TABLE product_prices");
await conn.query("TRUNCATE TABLE products");
await conn.query("TRUNCATE TABLE customers");
await conn.query("TRUNCATE TABLE store_members");
await conn.query("TRUNCATE TABLE stores");
await conn.query("TRUNCATE TABLE users");

const passwordHash = await hash("seed-password!");
await conn.query(
  "INSERT INTO users (id, email, name, passwordHash, role, isActive, failedLoginCount, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)",
  [DEMO_USER_ID, "demo-toko@bisnisinsight.test", "Owner Demo", passwordHash, "OWNER", true, 0, new Date(NOW), new Date(NOW)],
);
await conn.query(
  "INSERT INTO stores (id, name, city, timezone, status, createdById, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)",
  [DEMO_STORE_ID, "Toko Demo", "Bandung", "Asia/Jakarta", "ACTIVE", DEMO_USER_ID, new Date(NOW), new Date(NOW)],
);
await conn.query("INSERT INTO store_members (storeId, userId, role, joinedAt) VALUES (?,?,?,?)", [
  DEMO_STORE_ID,
  DEMO_USER_ID,
  "OWNER",
  new Date(NOW),
]);

const outDir = path.resolve(process.cwd(), "storage", "temporary");
fs.mkdirSync(outDir, { recursive: true });

function writeCsv(fileName, header, rows) {
  const filePath = path.join(outDir, fileName);
  const stream = fs.createWriteStream(filePath);
  stream.write(`${header.join(",")}\n`);
  for (const row of rows) {
    stream.write(row.join(",") + "\n");
  }
  stream.end();
  return filePath;
}

const started = Date.now();

// Products and prices
const productIds = [];
const productsRows = [];
const priceRows = [];
for (let i = 1; i <= PRODUCT_COUNT; i += 1) {
  const id = crypto.randomUUID();
  productIds.push(id);
  productsRows.push([id, DEMO_STORE_ID, `SKU-${String(i).padStart(5, "0")}`, `Produk ${i}`, `Kategori ${i % 12}`, "pcs", null, NOW, NOW]);
  priceRows.push([crypto.randomUUID(), id, 1000 + (i % 20) * 250, NOW]);
}
const productsFile = writeCsv("seed_products.csv", ["id", "store_id", "sku", "name", "category", "unit", "deleted_at", "created_at", "updated_at"], productsRows);
const pricesFile = writeCsv("seed_product_prices.csv", ["id", "product_id", "price", "effective_from"], priceRows);
await loadFile("products", productsFile, ["id", "store_id", "sku", "name", "category", "unit", "deleted_at", "created_at", "updated_at"]);
await loadFile("product_prices", pricesFile, ["id", "product_id", "price", "effective_from"]);

// Customers
const customerIds = [];
const customerRows = [];
for (let i = 1; i <= CUSTOMER_COUNT; i += 1) {
  const id = crypto.randomUUID();
  customerIds.push(id);
  customerRows.push([id, DEMO_STORE_ID, `C${String(i).padStart(5, "0")}`, `Pelanggan ${i}`, null, NOW, NOW]);
}
const customersFile = writeCsv("seed_customers.csv", ["id", "store_id", "code", "name", "segment", "created_at", "updated_at"], customerRows);
await loadFile("customers", customersFile, ["id", "store_id", "code", "name", "segment", "created_at", "updated_at"]);

// Orders + items
const orderRows = [];
const itemRows = [];
let itemTotal = 0;
for (let i = 1; i <= ORDER_COUNT; i += 1) {
  const orderId = crypto.randomUUID();
  const customerId = customerIds[i % customerIds.length];
  const itemCount = 21 - (i % 3);
  let total = 0;
  for (let j = 0; j < itemCount; j += 1) {
    const productId = productIds[(i * 13 + j * 7) % productIds.length];
    const qty = 1 + ((i + j) % 4);
    const price = 1000 + ((j * 17) % 100) * 250;
    const lineTotal = qty * price;
    itemRows.push([crypto.randomUUID(), orderId, productId, qty, price, ""]);
    total += lineTotal;
    itemTotal += 1;
  }
  orderRows.push([orderId, DEMO_STORE_ID, null, customerId, "2026-01-01 00:00:00", "online", total, "CONFIRMED", NOW, NOW]);
}
const ordersFile = writeCsv("seed_orders.csv", ["id", "store_id", "dataset_id", "customer_id", "order_date", "channel", "total", "status", "created_at", "updated_at"], orderRows);
await loadFile("orders", ordersFile, ["id", "store_id", "dataset_id", "customer_id", "order_date", "channel", "total", "status", "created_at", "updated_at"]);

const itemsFile = writeCsv(
  "seed_order_items.csv",
  ["id", "order_id", "product_id", "qty", "price", "discount"],
  itemRows,
);
await loadFile("order_items", itemsFile, ["id", "order_id", "product_id", "qty", "price", "discount"]);

await conn.query("SET UNIQUE_CHECKS = 1");
await conn.query("SET FOREIGN_KEY_CHECKS = 1");

const [rows] = await conn.query("SELECT COUNT(*) AS c FROM order_items");
const elapsed = ((Date.now() - started) / 1000).toFixed(2);
console.log(`Seed selesai dalam ${elapsed}s; order_items = ${rows[0].c}`);
await conn.end();

async function loadFile(table, filePath, columns) {
  const sql = `LOAD DATA LOCAL INFILE ? INTO TABLE ${table}
FIELDS TERMINATED BY ',' LINES TERMINATED BY '\\n' IGNORE 1 LINES (${columns.join(", ")})`;
  try {
    await conn.query({ sql, values: [filePath], infileStreamFactory: () => fs.createReadStream(filePath) });
  } catch (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}
