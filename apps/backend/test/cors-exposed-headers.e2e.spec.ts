import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { buildTestApp } from './utils/test-app.js';

/**
 * Header rate limit harus TERBACA peramban lintas origin.
 *
 * ## Kenapa ini perlu test sendiri
 *
 * `@nestjs/throttler` memang sudah mengirim `Retry-After-auth`, dan frontend
 * memang sudah membacanya. Tapi `Retry-After` bukan response header yang aman
 * secara CORS: tanpa `Access-Control-Expose-Headers`, JavaScript di origin lain
 *uels melihat `null` walau header-nya ada di respons.
 *
 * Kegagalan itu tidak terlihat dari `curl`: `curl` tidak Teguran CORS sama
 * sekali. Frontend melihat `headers.get('retry-after-auth') === null`, lalu
 * `retryAfterSeconds` selalu `null`, lalu pesan "coba lagi dalam N detik" tidak
 * pernah muncul - dan tidak ada satu pun error yang menghubungkan penyebabnya.
 *
 * Jadi test ini memeriksa BAGIAN yang tidak terlihat dari request biasa:
 * header `Access-Control-Expose-Headers` pada respons yang benar-benar di
 *-throttle, untuk origin yang Allowed.
 */
describe('CORS: header throttle harus bisa dibaca peramban', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Default `buildTestApp` sengaja memakai satu throttler `default` yang
    // longgar (limit 10.000) supaya test lain tidak flaky. Karena
    // `overrideProvider` itu MENGGANTI seluruh daftar throttler, throttler
    // bernama `auth` hilang kalau tidak dideklarasikan di sini - dan
    // `@Throttle({ auth: ... })` di `AuthController` lalu diam-diam tidak
    // membatasi apa pun, sehingga tidak akan pernah ada respons 429.
    //
    // Karena itu kedua throttler dideklarasikan eksplisit dengan batas yang
    // sama dengan produksi.
    app = await buildTestApp({
      throttlerOptions: [
        { name: 'default', ttl: 60_000, limit: 300 },
        { name: 'auth', ttl: 60_000, limit: 20 },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('membuka Retry-After-auth DAN Retry-After pada respons 429', async () => {
    // `auth` throttler mengizinkan 5 percobaan per menit per (ip, email).
    // Enam percobaan dengan email yang sama dijamin melewati batas itu.
    const email = `cors-throttle-${randomUUID()}@test.local`;
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3001')
        .send({ email, password: 'salah-sekali' });

    let throttled: request.Response | undefined;
    for (let i = 0; i < 6 && !throttled; i += 1) {
      const res = await attempt();
      if (res.status === 429) throttled = res;
    }

    expect(throttled, 'harus sampai ke respons 429').toBeDefined();

    // Header throttle benar-benar dikirim...
    expect(throttled!.headers['retry-after-auth']).toBeDefined();

    // ...dan - ini bagian yang tidak terlihat tanpa browser - browser
    // DIIZINKAN membacanya.
    const expose = String(throttled!.headers['access-control-expose-headers'] ?? '');
    expect(expose).toContain('Retry-After-auth');
    // Throttler `default` menulis header polos, jadi bentuk itu juga harus
    // terbuka;frontend membaca keduanya.
    expect(expose).toContain('Retry-After');
  });

  it('tetap mengizinkan credentials dan hanya origin yang diizinkan', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ email: `cors-creds-${randomUUID()}@test.local`, password: 'salah' });

    // `credentials: true` tetap ada: tanpa itu cookie sesi HttpOnly dibuang
    // peramban dan refresh token tidak pernah sampai.
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });

  it('tidak mengirim Access-Control-Allow-Origin untuk origin yang tidak diizinkan', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: `cors-evil-${randomUUID()}@test.local`, password: 'salah' });

    // Allowlist harus tetap bekerja. `exposedHeaders` ditambahkan supaya header
    // terbaca - BUKAN supaya siapa pun boleh_origins.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
