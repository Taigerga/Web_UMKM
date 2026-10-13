#!/usr/bin/env node
import mysql from "mysql2/promise";
import crypto from "node:crypto";
import { hash } from "@node-rs/argon2";

const TARGET_ITEMS = 535000; // ~535k baris gabungan-ish
const PRODUCT_COUNT = 1200;
const CUSTOMER_COUNT = 5000;
const ORDER_COUNT = 25500; // 25500 * ~21 = 535500 item
const AVG_ITEMS_PER_ORDER = 21;
const ITEMS_PER_CHUNK = 15000;

const DEMO_USER_ID = "8f63d4ba-1f11-4f37-9f44-0d3d68dcb001";
const DEMO_STORE_ID = "8f63d4ba-1f11-4f37-9f44-0d3d68dcb021";

function uuid() {
  return crypto.randomUUID();
}

async function aChunk(conn, sql, chunk) {
  if (chunk.length === 0) return;
  await conn.query(sql, [chunk]);
}

async function seed() {
  const started = Date.now();
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL ?? "mysql://root@127.0.0.1:3306/bisnis_insight_analytics_db",
    multipleStatements: false,
  });

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = ?)", [
      DEMO_STORE_ID,
    ]);
    await conn.query("DELETE FROM orders WHERE store_id = ?", [DEMO_STORE_ID]);
    await conn.query("DELETE FROM product_prices WHERE product_id IN (SELECT id FROM products WHERE store_id = ?)", [
      DEMO_STORE_ID,
    ]);
    await conn.query("DELETE FROM products WHERE store_id = ?", [DEMO_STORE_ID]);
    await conn.query("DELETE FROM customers WHERE store_id = ?", [DEMO_STORE_ID]);
    await conn.query("DELETE FROM store_members WHERE storeId = ?", [DEMO_STORE_ID]);
    await conn.query("DELETE FROM stores WHERE id = ?", [DEMO_STORE_ID]);
    await conn.query("DELETE FROM users WHERE id = ?", [DEMO_USER_ID]);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    const passwordHash = await hash("seed-password!");
    await conn.query(
      `INSERT INTO users (id, email, name, passwordHash, role, isActive, failedLoginCount, createdAt, updatedAt)
       VALUES (?, 'demo-toko@bisnisinsight.test', 'Owner Demo', ?, 'OWNER', true, 0, NOW(), NOW())`,
      [DEMO_USER_ID, passwordHash],
    );
    await conn.query(
      `INSERT INTO stores (id, name, city, timezone, status, createdById, createdAt, updatedAt)
       VALUES (?, 'Toko Demo', 'Bandung', 'Asia/Jakarta', 'ACTIVE', ?, NOW(), NOW())`,
      [DEMO_STORE_ID, DEMO_USER_ID],
    );
    await conn.query(
      `INSERT INTO store_members (storeId, userId, role, joinedAt) VALUES (?, ?, 'OWNER', NOW())`,
      [DEMO_STORE_ID, DEMO_USER_ID],
    );

    console.log("Products...");
    const productIds = [];
    const productRows = [];
    for (let i = 0; i < PRODUCT_COUNT; i += 1) {
      const id = uuid();
      productIds.push(id);
      productRows.push([
        id,
        DEMO_STORE_ID,
        `SKU-${String(i + 1).padStart(5, "0")}`,
        `Produk Demo ${i + 1}`,
        `Kategori ${i % 12}`,
        "pcs",
        null,
        new Date(),
        new Date(),
      ]);
    }
    for (let i = 0; i < productRows.length; i += ITEMS_PER_CHUNK) {
      await aChunk(
        conn,
        `INSERT INTO products (id, store_id, sku, name, category, unit, deleted_at, created_at, updated_at)
         VALUES ?`,
        productRows.slice(i, i + ITEMS_PER_CHUNK),
      );
    }

    console.log("Product prices...");
    const priceRows = [];
    for (let i = 0; i < PRODUCT_COUNT; i += 1) {
      priceRows.push([uuid(), productIds[i], 1000 + (i % 17) * 250, new Date()]);
    }
    for (let i = 0; i < priceRows.length; i += ITEMS_PER_CHUNK) {
      await aChunk(conn, "INSERT INTO product_prices (id, product_id, price, effective_from) VALUES ?", priceRows.slice(i, i + ITEMS_PER_CHUNK));
    }

    console.log("Customers...");
    const customerIds = [];
    const customerRows = [];
    for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
      const id = uuid();
      customerIds.push(id);
      customerRows.push([
        id,
        DEMO_STORE_ID,
        `C${String(i + 1).padStart(5, "0")}`,
        `Pelanggan Demo ${i + 1}`,
        null,
        new Date(),
        new Date(),
      ]);
    }
    for (let i = 0; i < customerRows.length; i += ITEMS_PER_CHUNK) {
      await aChunk(
        conn,
        `INSERT INTO customers (id, store_id, code, name, segment, created_at, updated_at) VALUES ?`,
        customerRows.slice(i, i + ITEMS_PER_CHUNK),
      );
    }

    console.log("Orders and order items...");
    let insertedItems = 0;
    const orderRows = [];
    const orderItemRowsToInsert = [];
    const orderMap = new Map();

    for (let o = 0; o < ORDER_COUNT; o += 1) {
      const orderId = uuid();
      const customerId = customerIds[o % customerIds.length];
      const itemQty = AVG_ITEMS_PER_ORDER + (o % 5);
      const items = [];

      for (let j = 0; j < itemQty; j += 1) {
        const pid = productIds[(o * 13 + j * 7) % productIds.length];
        const qty = 1 + ((o + j) % 4);
        const price = 1000 + ((hashNumber(pid) >> 3) % 100) * 250;
        const total = qty * price;
        items.push([uuid(), orderId, pid, qty, price, total]);
        insertedItems += 1;
      }

      orderMap.set(orderId, items);
      const total = items.reduce((sum, item) => sum + item[4] * item[3], 0);
      orderRows.push([orderId, DEMO_STORE_ID, null, customerId, new Date(), "online", total, "CONFIRMED", new Date(), new Date()]);
    }

    for (let i = 0; i < orderRows.length; i += ITEMS_PER_CHUNK) {
      await aChunk(
        conn,
        `INSERT INTO orders (id, store_id, dataset_id, customer_id, order_date, channel, total, status, created_at, updated_at) VALUES ?`,
        orderRows.slice(i, i + ITEMS_PER_CHUNK),
      );
    }

    const allOrderItems = [];
    for (const items of orderMap.values()) {
      allOrderItems.push(...items);
    }
    for (let i = 0; i < allOrderItems.length; i += ITEMS_PER_CHUNK) {
      await aChunk(conn, "INSERT INTO order_items (id, order_id, product_id, qty, price, discount) VALUES ?", allOrderItems.slice(i, i + ITEMS_PER_CHUNK).map(([id, orderId, pid, qty, price, total]) => [
          id,
          orderId,
          pid,
          qty,
          price,
          null,
        ]));
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(2);
    const [rows] = await conn.query("SELECT COUNT(*) AS c FROM order_items");
    console.log(`Seed selesai dalam ${elapsed}s`);
    console.log(`Rows generated target ≈ ${TARGET_ITEMS}, actual order_items = ${rows[0].c}`);
  } finally {
    await conn.end();
  }
}

function hashNumber(input) {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) >>> 0;
  }
  return value;
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
