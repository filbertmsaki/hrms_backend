process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Deployment tooling (smoke tests, orchestrator readiness probes) must be
 * able to trust these two endpoints unconditionally: no auth required, no
 * 3xx/4xx treated as "healthy", and /ready must reflect the real state of
 * the database/Redis/disk checks rather than always returning 200.
 */
describe('Health endpoints (e2e, real Postgres)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/live returns 200 with no authentication', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/health/live')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('hrms-backend');
    expect(response.body.timestamp).toBeDefined();
  });

  it('GET /api/health/ready returns 200 with all checks up when dependencies are healthy', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .expect(200);

    expect(response.body.status).toBe('ready');
    expect(response.body.checks.database.status).toBe('up');
    expect(response.body.checks.disk.status).toBe('up');
  });

  it('does not require an Authorization header for either health endpoint', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/health/live')
      .unset('Authorization')
      .expect(200);

    await request(app.getHttpServer() as App)
      .get('/api/health/ready')
      .unset('Authorization')
      .expect(200);
  });

  it('every response carries a correlation ID header', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/health/live')
      .expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
  });
});
