import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './utils/test-app.js';
import type { INestApplication } from '@nestjs/common';

describe('App bootstrap', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health mengembalikan 200 dengan bentuk envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { status: 'ok', timestamp: expect.any(String) },
    });
  });

  it('GET /api/v1/tidak-ada mengembalikan 404 dengan kode error stabil', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).not.toContain('at ');
  });

  it('body POST tidak valid menghasilkan VALIDATION_ERROR, bukan 500', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/echo').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});