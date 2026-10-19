import path from "node:path";
import url from "node:url";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service.js";
import { buildTestApp } from "./utils/test-app.js";

/**
 * Alur end-to-end 15 langkah (Promt §20.5) dalam SATU urutan nyata.
 *
 * Bukan simulasi: HTTP sungguhan ke aplikasi Nest yang dibangun identik dengan
 * produksi, MySQL sungguhan (`bisnis_insight_test`), worker ML sungguhan yang
 * jalan di app instance, dan Python ML service yang HARUS hidup untuk
 * langkah 8-9 (`ML_SERVICE_URL`, default http://127.0.0.1:8000). Kalau service
 * mati, job berstatus `failed` dengan pesan jelas dan test ini gagal - sesuai
 * prinsip "jangan mengarang hasil".
 */

const VALID_PASSWORD = "rahasia-kuat-123";
const ANALYSIS_TIMEOUT_MS = 120_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await prisma.mlJobs.deleteMany({});
  await prisma.notifications.deleteMany({});
  await prisma.orderItems.deleteMany({});
  await prisma.orders.deleteMany({});
  await prisma.productPrices.deleteMany({});
  await prisma.products.deleteMany({});
  await prisma.customers.deleteMany({});
  await prisma.datasetIssues.deleteMany({});
  await prisma.datasetMappings.deleteMany({});
  await prisma.datasets.deleteMany({});
  await prisma.auditLogs.deleteMany({});
  await prisma.storeInvites.deleteMany({});
  await prisma.storeMembers.deleteMany({});
  await prisma.stores.deleteMany({});
  await prisma.refreshTokens.deleteMany({});
  await prisma.users.deleteMany({});
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

async function registerAndLogin(prefix: string) {
  const email = uniqueEmail(prefix);
  const register = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ name: prefix, email, password: VALID_PASSWORD })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password: VALID_PASSWORD })
    .expect(201);
  return {
    email,
    userId: register.body.data.user.id as string,
    token: login.body.data.accessToken as string,
  };
}

async function pollJobUntilDone(
  ownerToken: string,
  storeId: string,
  jobId: string,
) {
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/analytics/jobs/${jobId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const job = res.body.data as {
      status: string;
      result: unknown;
      errorMessage: string | null;
    };
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(
        `Job gagal (mungkin ML service tidak hidup?): ${job.errorMessage ?? "tanpa pesan"}`,
      );
    }
    await sleep(1500);
  }
  throw new Error(`Timeout ${ANALYSIS_TIMEOUT_MS}ms menunggu job ${jobId}`);
}

describe("alur end-to-end 15 langkah (Promt 20.5)", () => {
  it(
    "registrasi toko undangan dataset analisis laporan dan pemisahan akses",
    { timeout: 300_000 },
    async () => {
      // --- Langkah 1: pemilik registrasi dan login ---
      const owner = await registerAndLogin("owner");
      expect(owner.token).toBeTruthy();

      // --- Langkah 2: pemilik membuat toko ---
      const store = await request(app.getHttpServer())
        .post("/api/v1/stores")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "Toko Alur Penuh", city: "Bandung" })
        .expect(201);
      const storeId = store.body.data.id;
      expect(storeId).toBeTruthy();

      // --- Langkah 3: pemilik mengundang pegawai (token mentah hanya sekali) ---
      const staffCandidate = await registerAndLogin("staff");
      const invite = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/invitations`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ email: staffCandidate.email, role: "STAFF" })
        .expect(201);
      const inviteToken = invite.body.data.token;
      expect(inviteToken).toBeTruthy();

      // --- Langkah 4: pegawai menerima undangan ---
      const preview = await request(app.getHttpServer())
        .get(`/api/v1/invitations/${inviteToken}`) // publik: ringkasan sebelum accept
        .expect(200);
      expect(preview.body.data.role).toBe("STAFF");
      expect(preview.body.data.storeName).toBe("Toko Alur Penuh");

      const accepted = await request(app.getHttpServer())
        .post(`/api/v1/invitations/${inviteToken}/accept`)
        .set("Authorization", `Bearer ${staffCandidate.token}`)
        .expect(201);
      expect(accepted.body.data.role).toBe("STAFF");

      // --- Langkah 5: pemilik mengunggah dataset ---
      const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
      const file = path.join(__dirname, "fixtures", "datasets", "flow-ml.csv");
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/datasets`)
        .set("Authorization", `Bearer ${owner.token}`)
        .attach("file", file)
        .expect(201);
      const datasetId = upload.body.data.id;

      // --- Langkah 6: validasi dan pembersihan ---
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
      await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/mapping`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send(mapping)
        .expect(201);
      const validated = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/validate`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(201);
      expect(validated.body.data.status).toBe("VALIDATED");
      expect(validated.body.data.rowCount).toBe(40);

      // --- Langkah 7: data disimpan ke database ---
      const committed = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/datasets/${datasetId}/commit`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(201);
      expect(committed.body.data.status).toBe("IMPORTED");

      const products = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/products`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(products.body.data.length).toBe(3);

      const orders = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/orders`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(orders.body.data.length).toBe(40);

      // --- Langkah 8: pemilik menjalankan analisis (job async) ---
      const run = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/analytics/run`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ jobType: "forecast", parameters: { horizonDays: 14 } })
        .expect(202);
      const forecastJobId = run.body.data.jobId as string;
      expect(forecastJobId).toBeTruthy();

      // --- Langkah 9: Python menghasilkan prediksi (per-toko, bukan artefak global) ---
      // --- Langkah 10: NestJS menyimpan hasil (job.result bertahan di DB) ---
      const forecastJob = await pollJobUntilDone(owner.token, storeId, forecastJobId);
      const forecasts = (forecastJob.result as { forecasts?: unknown[] }).forecasts ?? [];
      expect(forecasts.length).toBe(14);
      const metadata = (forecastJob.result as { metadata?: { model?: string } }).metadata;
      expect(metadata?.model).toContain("per_store");
      const firstForecast = forecasts[0] as { date: string; predicted: number };
      expect(firstForecast.predicted).toBeGreaterThanOrEqual(0);

      // Hasil tersimpan secara persisten, bukan hanya di memori proses ML.
      const reread = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/analytics/jobs/${forecastJobId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(reread.body.data.status).toBe("completed");
      expect(reread.body.data.result).toBeTruthy();

      // Analisis lain yang butuh masukan berbeda: segmentasi & churn.
      const runSeg = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/analytics/run`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ jobType: "segmentation" })
        .expect(202);
      const segJob = await pollJobUntilDone(owner.token, storeId, runSeg.body.data.jobId);
      expect((segJob.result as { segments?: unknown[] }).segments?.length).toBeGreaterThanOrEqual(1);

      const runChurn = await request(app.getHttpServer())
        .post(`/api/v1/stores/${storeId}/analytics/run`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ jobType: "churn" })
        .expect(202);
      const churnJob = await pollJobUntilDone(owner.token, storeId, runChurn.body.data.jobId);
      const churnResult = churnJob.result as { summary?: Record<string, number> };
      expect(churnResult.summary).toBeTruthy();

      // --- Langkah 11: dashboard membaca hasil aktual (endpoint analytics) ---
      const summary = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/analytics/summary`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      // Summary default periode 30d, sedangkan dataset 40 hari (dari
      // today-39 sampai hari ini): pas di tepi jendela, jadi asersi longgar
      // di bawah-bawah yang tetap mendeteksi dashboard kosong.
      expect(summary.body.data.totalOrders).toBeGreaterThanOrEqual(30);
      expect(Number(summary.body.data.totalSales)).toBeGreaterThan(0);

      const trend = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/analytics/trend?period=30d`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(trend.body.data.length).toBeGreaterThan(0);

      const topProducts = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/analytics/top-products?limit=3`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(topProducts.body.data.length).toBe(3);

      // --- Langkah 12: pemilik mengunduh laporan ---
      const htmlReport = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/reports/sales-summary`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(htmlReport.headers["content-type"]).toContain("text/html");
      expect(String(htmlReport.text)).toContain("Toko Alur Penuh");

      const csvReport = await request(app.getHttpServer())
        .get(`/api/v1/stores/${storeId}/reports/detailed`)
        .set("Authorization", `Bearer ${owner.token}`)
        .expect(200);
      expect(csvReport.headers["content-type"]).toContain("text/csv");

      // --- Langkah 13: pegawai hanya melihat toko yang ditugaskan ---
      const staffStores = await request(app.getHttpServer())
        .get("/api/v1/stores")
        .set("Authorization", `Bearer ${staffCandidate.token}`)
        .expect(200);
      expect(staffStores.body.data.length).toBe(1);
      expect(staffStores.body.data[0].id).toBe(storeId);

      // --- Langkah 14: pegawai tidak dapat mengakses toko lain ---
      const otherOwner = await registerAndLogin("owner2");
      const otherStore = await request(app.getHttpServer())
        .post("/api/v1/stores")
        .set("Authorization", `Bearer ${otherOwner.token}`)
        .send({ name: "Toko Lain", city: "Jakarta" })
        .expect(201);
      const otherStoreId = otherStore.body.data.id;

      const denied = await request(app.getHttpServer())
        .get(`/api/v1/stores/${otherStoreId}/orders`)
        .set("Authorization", `Bearer ${staffCandidate.token}`);
      expect(denied.status).toBe(403);
      expect(denied.body.error?.code ?? "").toBe("STORE_FORBIDDEN");

      // --- Langkah 15: admin memantau status sistem dan log yang diizinkan ---
      const admin = await registerAndLogin("admin");
      await prisma.users.update({
        where: { id: admin.userId },
        data: { role: "ADMIN" },
      });
      // Login ulang supaya access token membawa peran terbaru dari DB.
      const adminLogin = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: admin.email, password: VALID_PASSWORD })
        .expect(201);
      const adminToken = adminLogin.body.data.accessToken;

      const adminStores = await request(app.getHttpServer())
        .get("/api/v1/admin/stores")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(adminStores.body.meta.total).toBeGreaterThanOrEqual(2);

      const adminJobs = await request(app.getHttpServer())
        .get("/api/v1/admin/ml-jobs")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(adminJobs.body.meta.total).toBeGreaterThanOrEqual(3);
      const monitored = adminJobs.body.data.find(
        (j: { id: string }) => j.id === forecastJobId,
      );
      expect(monitored.status).toBe("completed");

      const adminModels = await request(app.getHttpServer())
        .get("/api/v1/admin/ml-models")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      // ML service hidup untuk langkah 8-9, jadi status harus `ok`.
      expect(adminModels.body.data.status).toBe("ok");
      expect(adminModels.body.data.models).toBeTruthy();
    },
  );
});
