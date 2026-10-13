import path from "node:path";
import url from "node:url";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service.js";
import { buildTestApp } from "./utils/test-app.js";

const VALID_PASSWORD = "rahasia-kuat-123";
let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await buildTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await cleanup();
  await app.close();
});

async function cleanup() {
  await prisma.orderItems.deleteMany({});
  await prisma.orders.deleteMany({});
  await prisma.productPrices.deleteMany({});
  await prisma.products.deleteMany({});
  await prisma.customers.deleteMany({});
  await prisma.datasetIssues.deleteMany({});
  await prisma.datasetMappings.deleteMany({});
  await prisma.datasets.deleteMany({});
  await prisma.auditLogs.deleteMany({});
  await prisma.refreshTokens.deleteMany({});
  await prisma.storeInvites.deleteMany({});
  await prisma.storeMembers.deleteMany({});
  await prisma.stores.deleteMany({});
  await prisma.users.deleteMany({});
}

beforeEach(async () => {
  await cleanup();
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

describe("dataset validation", () => {
  it("maps and validates csv", async () => {
    const email = uniqueEmail("owner");
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({ name: "Owner", email, password: VALID_PASSWORD }).expect(201);
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password: VALID_PASSWORD }).expect(201);
    const token = login.body.data.accessToken;
    const store = await request(app.getHttpServer()).post("/api/v1/stores").set("Authorization", `Bearer ${token}`).send({ name: "Toko Test", city: "Bandung" }).expect(201);
    const storeId = store.body.data.id;
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const file = path.join(__dirname, "fixtures", "datasets", "flow.csv");
    const upload = await request(app.getHttpServer()).post(`/api/v1/stores/${storeId}/datasets`).set("Authorization", `Bearer ${token}`).attach("file", file).expect(201);
    const datasetId = upload.body.data.id;
    const mapping = {
      order_id: "order_id",
      order_date: "order_date",
      customer_code: "customer_code",
      product_code: "product_code",
      qty: "qty",
      unit_price: "unit_price",
      total_price: "total_price",
      channel: "channel",
    };
    await request(app.getHttpServer()).post(`/api/v1/stores/${storeId}/datasets/${datasetId}/mapping`).set("Authorization", `Bearer ${token}`).send(mapping).expect(201);
    const validated = await request(app.getHttpServer()).post(`/api/v1/stores/${storeId}/datasets/${datasetId}/validate`).set("Authorization", `Bearer ${token}`).expect(201);
    expect(validated.body.data.status).toBe("VALIDATED");
    expect(validated.body.data.rowCount).toBe(2);
    expect(validated.body.data.issues).toHaveLength(0);

    const committed = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/commit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(committed.body.data.status).toBe("IMPORTED");

    const rolledBack = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/rollback`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(rolledBack.body.data.status).toBe("ROLLED_BACK");
  });
});
