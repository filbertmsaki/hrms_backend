process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Auth sessions (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  const password = 'AuthSessions!2026';
  let email: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (companyUserId) {
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        companyUserId,
      ]);
    }
    if (userId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (companyId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyId,
      ]);
    }
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    email = `auth.sessions.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Auth Sessions Co ${suffix}`,
        slug: `e2e-auth-sessions-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-AS-${suffix}`.slice(0, 20),
        first_name: 'Session',
        last_name: 'Owner',
        phone: `+2556${suffix}`.slice(0, 20),
        email,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userId = user.id;

    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserId = membership.id;
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);

    return response.body.access_token as string;
  }

  it('lists the active session after login and revokes it by session id', async () => {
    const token = await login();

    const sessionsResponse = await request(app.getHttpServer() as App)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [currentSession] = sessionsResponse.body.data as Array<{
      session_id: string;
      is_current: boolean;
      device_name: string;
    }>;

    expect(currentSession).toEqual(
      expect.objectContaining({
        session_id: expect.any(String),
        is_current: true,
        device_name: expect.any(String),
      }),
    );

    await request(app.getHttpServer() as App)
      .delete(`/api/auth/sessions/${currentSession.session_id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('revokes all sessions and blocks the current token immediately', async () => {
    const token = await login();

    await request(app.getHttpServer() as App)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('enforces a single active session: a fresh login immediately invalidates the previous one with a SESSION_REPLACED code', async () => {
    const firstToken = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);

    const secondToken = await login();

    const replacedResponse = await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(401);

    expect(replacedResponse.body).toMatchObject({ code: 'SESSION_REPLACED' });

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
  });

  it('rejects a refresh attempt from a device whose session was replaced by a later login', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const firstRefreshToken = loginResponse.body.refresh_token as string;

    await login();

    const refreshResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: firstRefreshToken })
      .expect(401);

    expect(refreshResponse.body).toMatchObject({ code: 'SESSION_REPLACED' });
  });
});
