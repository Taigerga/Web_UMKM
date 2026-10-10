import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './utils/test-app.js';
import { APP_CONFIG } from '../src/config/configuration.js';
import type { INestApplication } from '@nestjs/common';
import type { AppConfig } from '../src/config/configuration.js';

describe('Error envelope 5xx tidak bocor', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('AppError 5xx dikolaps jadi INTERNAL_ERROR dan tidak membocorkan detail koneksi', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/echo/boom-app-error',
    );

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    // Detail internal (host, port, user) tidak boleh sampai ke client.
    expect(res.body.error.message).not.toContain('mariadb');
    expect(res.body.error.message).not.toContain('127.0.0.1');
    expect(res.body.error.message).not.toContain('3306');
    expect(res.body.error.message).not.toContain('DB_DOWN');
    expect(res.body.error.message).not.toContain('root');
  });

  it('HttpException 5xx juga menghasilkan INTERNAL_ERROR, bukan HTTP_ERROR', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/echo/boom-http',
    );

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toContain('10.0.0.5');
    expect(res.body.error.message).not.toContain('acme');
  });

  it('body POST dengan beberapa field invalid membawa detail per-field', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/echo')
      .send({ name: 'ab', email: 'bukan-email', age: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // Pesan top-level tetap generik.
    expect(res.body.error.message).toBe('Permintaan tidak valid.');
    // Tapi detail per-field harus tersimpan supaya form frontend bisa merender.
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);

    const serialized = JSON.stringify(res.body.error.details);
    expect(serialized).toContain('name');
    expect(serialized).toContain('email');
    expect(serialized).toContain('age');
  });
});

describe('Konfigurasi test authoritative', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('menyelesaikan ke database test dan NODE_ENV=test walau ada .env lokal', () => {
    const config = app.get<AppConfig>(APP_CONFIG);

    expect(config.nodeEnv).toBe('test');
    expect(config.databaseUrl).toContain('bisnis_insight_test');
    expect(config.databaseUrl).not.toContain('bisnis_insight_analytics_db');
  });
});