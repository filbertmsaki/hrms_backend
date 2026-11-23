process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { OidcClientService } from '../src/modules/auth/oidc-client.service';
import { OidcProvider } from '../src/modules/auth/entities/oidc.entity';
import { AuthPolicy } from '../src/modules/auth/entities/auth-policy.entity';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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

  it('requires authentication to view the effective session policy', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/auth/session-policy')
      .expect(401);

    const token = await login();
    const response = await request(app.getHttpServer() as App)
      .get('/api/auth/session-policy')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        access_token_lifetime: expect.any(String),
        refresh_token_lifetime: expect.any(String),
        absolute_session_lifetime_seconds: expect.any(Number),
        inactivity_timeout: expect.any(Number),
        concurrent_session_limit: expect.any(Number),
      }),
    );
    expect(response.headers['cache-control']).toContain('no-store');
  });

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

  it('rejects access and refresh beyond the absolute session lifetime', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const token = loginResponse.body.access_token as string;
    const sessions = await request(app.getHttpServer() as App)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const id = sessions.body.data[0].session_id as string;
    await dataSource.query(
      "UPDATE auth_sessions SET created_at = NOW() - INTERVAL '91 days' WHERE id = $1",
      [id],
    );
    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: loginResponse.body.refresh_token })
      .expect(401);
  });

  it('keeps both access tokens valid after a second login', async () => {
    const firstToken = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);

    const secondToken = await login();

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(200);

    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
  });

  it('keeps an earlier refresh token valid after a later login', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const firstRefreshToken = loginResponse.body.refresh_token as string;

    await login();

    const refreshResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: firstRefreshToken })
      .expect(201);

    expect(refreshResponse.body).toEqual(
      expect.objectContaining({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
      }),
    );
    expect(refreshResponse.body.refresh_token).not.toBe(firstRefreshToken);
  });

  it('rotates refresh tokens and revokes the session on reuse', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const original = loginResponse.body.refresh_token as string;
    const rotated = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: original })
      .expect(201);
    await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: original })
      .expect(401);
    await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: rotated.body.refresh_token })
      .expect(401);
    await request(app.getHttpServer() as App)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${rotated.body.access_token}`)
      .expect(401);
  });

  it('upgrades a session-bound legacy refresh token on first use', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const jwt = app.get(JwtService);
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('JWT_REFRESH_SECRET');
    const payload = jwt.verify<Record<string, unknown>>(
      loginResponse.body.refresh_token,
      { secret },
    );
    const sessionId = payload.sessionId as string;
    delete payload.jti;
    delete payload.iat;
    delete payload.exp;
    const legacyToken = jwt.sign(payload, { secret, expiresIn: '7d' });
    await dataSource.query(
      'UPDATE auth_sessions SET current_refresh_jti = NULL WHERE id = $1',
      [sessionId],
    );
    const rotated = await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: legacyToken })
      .expect(201);
    await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: rotated.body.refresh_token })
      .expect(201);
  });

  it('issues a usable replacement refresh token during a company switch', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const switched = await request(app.getHttpServer() as App)
      .post('/api/auth/switch-company')
      .set('Authorization', `Bearer ${loginResponse.body.access_token}`)
      .send({ company_id: companyId })
      .expect(201);
    expect(switched.body.refresh_token).not.toBe(
      loginResponse.body.refresh_token,
    );
    await request(app.getHttpServer() as App)
      .post('/api/auth/refresh')
      .send({ refresh_token: switched.body.refresh_token })
      .expect(201);
  });

  it('rejects switching to an unassigned company without invalidating the session', async () => {
    const other = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `Other company ${Date.now()}`,
        slug: `auth-other-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        status: 'active',
      }),
    );
    try {
      const loginResponse = await request(app.getHttpServer() as App)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(201);
      const profile = await request(app.getHttpServer() as App)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${loginResponse.body.access_token}`)
        .expect(200);
      expect(profile.body.companies).toEqual([
        { id: companyId, name: expect.any(String) },
      ]);
      await request(app.getHttpServer() as App)
        .post('/api/auth/switch-company')
        .set('Authorization', `Bearer ${loginResponse.body.access_token}`)
        .send({ company_id: other.id })
        .expect(401);
      await request(app.getHttpServer() as App)
        .post('/api/auth/refresh')
        .send({ refresh_token: loginResponse.body.refresh_token })
        .expect(201);
    } finally {
      await dataSource.getRepository(Company).delete(other.id);
    }
  });

  it('allows only one concurrent use of a refresh token', async () => {
    const loginResponse = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const refreshToken = loginResponse.body.refresh_token as string;
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer() as App)
          .post('/api/auth/refresh')
          .send({ refresh_token: refreshToken }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 401]);
  });
  it('counts foreground activity, rejects idle access and never extends idle time on refresh', async () => {
    const server = app.getHttpServer() as App;
    const { body: tokens } = await request(server)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    const bearer = 'Bearer ' + String(tokens.access_token);
    const { body: before } = await request(server)
      .get('/api/auth/session-policy')
      .set('Authorization', bearer)
      .expect(200);
    const { body: rotated } = await request(server)
      .post('/api/auth/refresh')
      .send({ refresh_token: tokens.refresh_token })
      .expect(201);
    const auth = 'Bearer ' + String(rotated.access_token);
    const { body: after } = await request(server)
      .get('/api/auth/session-policy')
      .set('Authorization', auth)
      .expect(200);
    expect(after.idle_expires_at).toBe(before.idle_expires_at);
    const { body: active } = await request(server)
      .post('/api/auth/sessions/activity')
      .set('Authorization', auth)
      .expect(201);
    expect(active.idle_expires_at).toBeGreaterThan(before.idle_expires_at);
    await dataSource.query(
      "UPDATE auth_sessions SET last_activity_at=now()-interval '2 days' WHERE id=$1",
      [before.session_id],
    );
    await request(server)
      .post('/api/auth/sessions/activity')
      .set('Authorization', auth)
      .expect(401);
    await request(server)
      .get('/api/users/me')
      .set('Authorization', auth)
      .expect(401);
    await request(server)
      .post('/api/auth/refresh')
      .send({ refresh_token: rotated.refresh_token })
      .expect(401);
  });

  it('applies bounded owner policy at sign-in and admits concurrent devices atomically', async () => {
    const server = app.getHttpServer() as App;
    const token = await login();
    const update = '/api/auth/administration/policy';
    const policy = {
      access_seconds: 300,
      refresh_seconds: 7200,
      absolute_seconds: 3600,
      idle_seconds: 300,
      max_sessions: 2,
    };
    await request(server)
      .put(update)
      .set('Authorization', 'Bearer ' + token)
      .send(policy)
      .expect(403);
    const previous = await dataSource.manager.findOneBy(AuthPolicy, { id: 1 });
    await dataSource.getRepository(User).update(userId, { user_type: 'OWNER' });
    try {
      const owner = await login();
      await request(server)
        .put(update)
        .set('Authorization', 'Bearer ' + owner)
        .send({ ...policy, idle_seconds: 1 })
        .expect(400);
      await request(server)
        .put(update)
        .set('Authorization', 'Bearer ' + owner)
        .send(policy)
        .expect(200);
      const { body: old } = await request(server)
        .get('/api/auth/session-policy')
        .set('Authorization', 'Bearer ' + owner)
        .expect(200);
      expect(old.idle_seconds).not.toBe(300);
      const logins = await Promise.all([login(), login(), login()]);
      const results = await Promise.all(
        logins.map((t) =>
          request(server)
            .get('/api/auth/session-policy')
            .set('Authorization', 'Bearer ' + t),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 401]);
      for (const result of results.filter((r) => r.status === 200))
        expect(result.body).toMatchObject(policy);
      const jwt = app
        .get(JwtService)
        .decode<{ exp: number; iat: number }>(logins[0]);
      expect(jwt.exp - jwt.iat).toBe(300);
    } finally {
      if (previous) await dataSource.manager.save(AuthPolicy, previous);
      else await dataSource.manager.delete(AuthPolicy, 1);
    }
  });

  it('restricts administrator session lists, revocation and authentication events to their company', async () => {
    const server = app.getHttpServer() as App;
    const token = await login();
    const bearer = 'Bearer ' + token;
    await request(server)
      .get('/api/auth/administration/sessions')
      .set('Authorization', bearer)
      .expect(403);
    await request(server)
      .get('/api/auth/sso/provider')
      .set('Authorization', bearer)
      .expect(403);
    await grant('company_users:manage');
    await grant('security_events:read');
    const { body: own } = await request(server)
      .get('/api/auth/session-policy')
      .set('Authorization', bearer)
      .expect(200);
    const second = await login();
    const { body: other } = await request(server)
      .get('/api/auth/session-policy')
      .set('Authorization', 'Bearer ' + second)
      .expect(200);
    await dataSource.query(
      'UPDATE auth_sessions SET company_id=NULL WHERE id=$1',
      [other.session_id],
    );
    const { body: list } = await request(server)
      .get('/api/auth/administration/sessions')
      .set('Authorization', bearer)
      .expect(200);
    expect(list.data).toEqual([
      expect.objectContaining({ id: own.session_id, user_id: userId }),
    ]);
    await request(server)
      .delete('/api/auth/administration/sessions/' + String(other.session_id))
      .set('Authorization', bearer)
      .expect(404);
    await request(server)
      .delete('/api/auth/administration/sessions/' + String(own.session_id))
      .set('Authorization', bearer)
      .expect(200);
    await request(server)
      .get('/api/auth/session-policy')
      .set('Authorization', bearer)
      .expect(401);
    const latest = await login();
    const { body: events } = await request(server)
      .get('/api/security-events?category=authentication')
      .set('Authorization', 'Bearer ' + latest)
      .expect(200);
    expect(events.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'SESSION_REVOKED',
          company_id: companyId,
        }),
      ]),
    );
  });

  async function grant(name: string) {
    await dataSource.query(
      'INSERT INTO permissions (name,display_name) VALUES ($1,$1) ON CONFLICT (name) DO NOTHING',
      [name],
    );
    await dataSource.query(
      'INSERT INTO company_user_permissions (company_user_id,permission_id) SELECT $1,id FROM permissions WHERE name=$2 ON CONFLICT DO NOTHING',
      [companyUserId, name],
    );
  }

  it('tests a draft provider, links an existing account with proof and preserves membership on sign-in', async () => {
    const server = app.getHttpServer() as App;
    const token = await login();
    const bearer = 'Bearer ' + token;
    await grant('company_users:manage');
    const issuer = 'https://sso.example.test/tenant';
    const previousIssuer = process.env.OIDC_ALLOWED_ISSUERS;
    const previousKeys = process.env.FIELD_ENCRYPTION_KEYS;
    const previousActive = process.env.FIELD_ENCRYPTION_ACTIVE_KEY;
    process.env.OIDC_ALLOWED_ISSUERS = issuer;
    process.env.FIELD_ENCRYPTION_KEYS =
      'test:' + randomBytes(32).toString('base64');
    process.env.FIELD_ENCRYPTION_ACTIVE_KEY = 'test';
    const gateway = app.get(OidcClientService);
    const authorize = jest
      .spyOn(gateway, 'authorize')
      .mockImplementation(async () => {
        const state = randomBytes(32).toString('hex');
        return {
          url: issuer + '/authorize?state=' + state,
          state,
          nonce: 'nonce',
          verifier: 'verifier',
        };
      });
    const identify = jest
      .spyOn(gateway, 'identify')
      .mockResolvedValue('stable-subject');
    const key = randomBytes(32).toString('hex');
    const { slug } = await dataSource
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    const start = async (
      purpose: string,
      extra: Record<string, string> = {},
    ) => {
      const req = request(server)
        .post('/api/auth/sso/' + purpose + '/start')
        .send({ browser_key: key, ...extra });
      if (purpose !== 'login') req.set('Authorization', bearer);
      const { body } = await req.expect(201);
      return new URL(String(body.authorization_url)).searchParams.get('state');
    };
    const finish = (purpose: string, state: string | null, browser = key) => {
      const req = request(server)
        .post('/api/auth/sso/' + purpose + '/finish')
        .send({ code: 'test-code', state, browser_key: browser });
      if (purpose !== 'login') req.set('Authorization', bearer);
      return req;
    };
    try {
      const conf = {
        issuer,
        client_id: 'test-registration',
        client_secret: 'test-credential',
      };
      await request(server)
        .put('/api/auth/sso/provider')
        .set('Authorization', bearer)
        .send({ ...conf, issuer: 'https://unapproved.example.invalid' })
        .expect(400);
      const { body: p } = await request(server)
        .put('/api/auth/sso/provider')
        .set('Authorization', bearer)
        .send(conf)
        .expect(200);
      expect(p).not.toHaveProperty('client_secret');
      expect(p).not.toHaveProperty('secret_ciphertext');
      const stored = await dataSource.manager
        .createQueryBuilder(OidcProvider, 'p')
        .addSelect('p.secret_ciphertext')
        .where('company_id=:id', { id: companyId })
        .getOneOrFail();
      expect(stored.secret_ciphertext).toMatch(/^fenc:/);
      const enable = () =>
        request(server)
          .put('/api/auth/sso/provider/enabled')
          .set('Authorization', bearer)
          .send({ enabled: true });
      await enable().expect(400);
      const test = await start('test');
      await finish('test', test).expect(201);
      await enable().expect(200);
      await finish('login', await start('login', { company: slug })).expect(
        401,
      );
      await request(server)
        .post('/api/auth/sso/link/start')
        .set('Authorization', bearer)
        .send({ browser_key: key, password: 'incorrect' })
        .expect(403);
      const link = await start('link', { password });
      await finish('link', link, randomBytes(32).toString('hex')).expect(401);
      await finish('link', link).expect(201);
      await finish('link', link).expect(401);
      const { body: signed } = await finish(
        'login',
        await start('login', { company: slug }),
      ).expect(201);
      expect(signed.user.id).toBe(userId);
      expect(signed.company.id).toBe(companyId);
      await request(server)
        .get('/api/users/me')
        .set('Authorization', 'Bearer ' + String(signed.access_token))
        .expect(200);
      await request(server)
        .post('/api/auth/sso/unlink')
        .set('Authorization', bearer)
        .send({ password })
        .expect(201);
      await finish('login', await start('login', { company: slug })).expect(
        401,
      );
    } finally {
      authorize.mockRestore();
      identify.mockRestore();
      for (const [name, value] of Object.entries({
        OIDC_ALLOWED_ISSUERS: previousIssuer,
        FIELD_ENCRYPTION_KEYS: previousKeys,
        FIELD_ENCRYPTION_ACTIVE_KEY: previousActive,
      })) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
