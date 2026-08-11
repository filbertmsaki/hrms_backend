process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Global auth guard defaults (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps public endpoints reachable without a bearer token', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/health/live')
      .unset('Authorization')
      .expect(200);

    await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({
        email: 'nobody@example.com',
        password: 'wrong-password',
      })
      .expect(401);
  });

  it('denies a protected endpoint without a bearer token', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .unset('Authorization')
      .expect(401);
  });
});
