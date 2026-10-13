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
  await prisma.orderItems.deleteMany({});
  await prisma.orders.deleteMany({});
  await prisma.datasetIssues.deleteMany({});
  await prisma.datasetMappings.deleteMany({});
  await prisma.datasets.deleteMany({});
  await prisma.stores.deleteMany({});
  await prisma.users.deleteMany({});
  await app.close();
});

beforeEach(async () => {
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
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

describe("POST /stores/:storeId/datasets", () => {
  it("uploads csv and stores dataset row", async () => {
    const email = uniqueEmail("owner");
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ name: "Owner", email, password: VALID_PASSWORD })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: VALID_PASSWORD })
      .expect(201);
    const token = login.body.data.accessToken;

    const store = await request(app.getHttpServer())
      .post("/api/v1/stores")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Toko Test", city: "Bandung" })
      .expect(201);
    const storeId = store.body.data.id;

    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const file = path.join(__dirname, "fixtures", "datasets", "mini.csv");

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stores/${storeId}/datasets`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", file)
      .expect(201);

    expect(res.body.data.fileName).toBe("mini.csv");
    expect(res.body.data.status).toBe("UPLOADED");
  });
});
