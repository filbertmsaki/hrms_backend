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

/**
 * Proves the exact production invariant Phase 9 requires: session
 * revocation is enforced by the database, not by Redis or the token's own
 * expiry. A previously issued, unexpired access token must stop working the
 * moment the authoritative DB state changes -- token version bump (logout
 * everywhere / password change), an invalidated-before timestamp, an
 * inactive user, or an inactive company membership (offboarding exit).
 *
 * This boots the real AppModule (real JwtStrategy, real guards) against a
 * dedicated Postgres test database and drives it purely over HTTP.
 */
describe('Auth session revocation (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let companyId: number;
  let userId: number;
  let companyUserId: number;
  const password = 'RevocationTest!2026';
  let email: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
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
    await app.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    email = `revocation.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Revocation Co ${suffix}`,
        slug: `e2e-revocation-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-${suffix}`.slice(0, 20),
        first_name: 'Revocation',
        last_name: 'Subject',
        phone: `+2557${suffix}`.slice(0, 20),
        email,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
        auth_token_invalid_before: null,
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

    expect(response.body.access_token).toBeDefined();
    return response.body.access_token as string;
  }

  it('allows an authenticated request with a freshly issued token', async () => {
    const token = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects the old token after auth_token_version is bumped (logout-everywhere / password change)', async () => {
    const token = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await dataSource.query(
      'UPDATE users SET auth_token_version = auth_token_version + 1 WHERE id = $1',
      [userId],
    );

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects the old token once auth_token_invalid_before is set in the future of the token issue time', async () => {
    const token = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await dataSource.query(
      "UPDATE users SET auth_token_invalid_before = now() + interval '1 minute' WHERE id = $1",
      [userId],
    );

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects the old token once the user account is deactivated', async () => {
    const token = await login();

    await dataSource.query('UPDATE users SET status = $1 WHERE id = $2', [
      'inactive',
      userId,
    ]);

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects the old token once the company membership is deactivated (offboarding exit)', async () => {
    const token = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await dataSource.query(
      'UPDATE company_users SET status = $1 WHERE id = $2',
      ['inactive', companyUserId],
    );

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a request with no token', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .expect(401);
  });

  it('rejects a request with a malformed token', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });
});
