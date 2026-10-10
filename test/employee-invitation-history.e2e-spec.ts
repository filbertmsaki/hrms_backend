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
import { CompanyUserPermission } from '../src/modules/companies/entities/company-user-permission.entity';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Employee invitation history (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let companyId: number;
  let otherCompanyId: number;
  let membershipId: number;
  let adminEmail: string;
  const password = 'InvitationHistory!2026';
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);

    const s = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const companies = dataSource.getRepository(Company);
    companyId = (
      await companies.save(
        companies.create({
          name: `E2E Invitation History ${s}`,
          slug: `e2e-invitation-history-${s}`,
          status: 'active',
        }),
      )
    ).id;
    otherCompanyId = (
      await companies.save(
        companies.create({
          name: `E2E Invitation History Other ${s}`,
          slug: `e2e-invitation-history-other-${s}`,
          status: 'active',
        }),
      )
    ).id;

    adminEmail = `invitation.history.${s}@example.com`;
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        user_no: `E2E-IH-${s}`.slice(0, 20),
        first_name: 'History',
        last_name: 'Admin',
        phone: `+255714${String(Date.now()).slice(-6)}`,
        email: adminEmail,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    const memberships = dataSource.getRepository(CompanyUser);
    membershipId = (
      await memberships.save(
        memberships.create({
          company_id: companyId,
          user_id: user.id,
          status: 'active',
          is_default: true,
        }),
      )
    ).id;
    const permission = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ name: 'onboarding_requests:read' });
    await dataSource.getRepository(CompanyUserPermission).save({
      company_user_id: membershipId,
      permission_id: permission.id,
    });

    // Invitation rows reference branches/departments/positions. Those
    // fixtures are irrelevant here, so skip FK checks for these inserts only.
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET session_replication_role = replica`);
      const insert = async (
        key: string,
        company: number,
        firstName: string,
        email: string,
        phone: string,
        status: string,
        expiresIn: string,
        createdAgo: string,
      ) => {
        const [row]: Array<{ id: number }> = await runner.query(
          `INSERT INTO employee_invitations
             (company_id, token_hash, first_name, last_name, gender, email, phone,
              primary_branch_id, primary_department_id, primary_position_id, employment_type,
              status, email_delivery_status, sms_delivery_status, created_by_company_user_id,
              expires_at, created_at, updated_at)
           VALUES ($1, md5(random()::text), $2, 'Tester', 'female', $3, $4, 1, 1, 1, 'full_time',
                   $5, 'sent', 'skipped', $6, now() + $7::interval, now() - $8::interval, now())
           RETURNING id`,
          [
            company,
            firstName,
            email,
            phone,
            status,
            membershipId,
            expiresIn,
            createdAgo,
          ],
        );
        ids[key] = row.id;
      };
      const p = String(Date.now()).slice(-5);
      await insert(
        'pending',
        companyId,
        'Neema',
        `neema.${s}@example.com`,
        `+255715${p}1`,
        'pending',
        '2 days',
        '1 minute',
      );
      await insert(
        'overdue',
        companyId,
        'Juma',
        `juma.${s}@example.com`,
        `+255715${p}2`,
        'pending',
        '-1 hour',
        '2 minutes',
      );
      await insert(
        'expired',
        companyId,
        'Rehema',
        `rehema.${s}@example.com`,
        `+255715${p}3`,
        'expired',
        '-2 days',
        '3 minutes',
      );
      await insert(
        'accepted',
        companyId,
        'Baraka',
        `baraka.${s}@example.com`,
        `+255715${p}4`,
        'accepted',
        '1 day',
        '4 minutes',
      );
      await insert(
        'cancelled',
        companyId,
        'Zawadi',
        `zawadi_50%.${s}@example.com`,
        `+255715${p}5`,
        'cancelled',
        '1 day',
        '5 minutes',
      );
      await insert(
        'foreign',
        otherCompanyId,
        'Neema',
        `neema.other.${s}@example.com`,
        `+255715${p}6`,
        'pending',
        '2 days',
        '1 minute',
      );
    } finally {
      await runner.query(`SET session_replication_role = DEFAULT`);
      await runner.release();
    }
  });

  afterAll(async () => {
    await dataSource.query(
      'DELETE FROM employee_invitations WHERE company_id = ANY($1)',
      [[companyId, otherCompanyId]],
    );
    await dataSource.query(
      'DELETE FROM company_user_permissions WHERE company_user_id = $1',
      [membershipId],
    );
    await dataSource.query('DELETE FROM company_users WHERE company_id = $1', [
      companyId,
    ]);
    await dataSource.query('DELETE FROM users WHERE email = $1', [adminEmail]);
    await dataSource.query('DELETE FROM companies WHERE id = ANY($1)', [
      [companyId, otherCompanyId],
    ]);
    await app.close();
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(201);
    return response.body.access_token as string;
  }

  async function history(token: string, query: Record<string, string> = {}) {
    const response = await request(app.getHttpServer() as App)
      .get('/api/employee-invitations/history')
      .query(query)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as {
      data: Array<{ id: number; status: string; effective_status: string }>;
      meta: { totalItems: number; totalPages: number; currentPage: number };
    };
  }

  const idsOf = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

  it('lists every status for the company only, newest first', async () => {
    const body = await history(await login());
    expect(idsOf(body.data)).toEqual([
      ids.pending,
      ids.overdue,
      ids.expired,
      ids.accepted,
      ids.cancelled,
    ]);
    expect(body.meta.totalItems).toBe(5);
  });

  it('uses the effective status for pending vs expired', async () => {
    const token = await login();
    expect(idsOf((await history(token, { status: 'pending' })).data)).toEqual([
      ids.pending,
    ]);
    const expired = await history(token, { status: 'expired' });
    expect(idsOf(expired.data)).toEqual([ids.overdue, ids.expired]);
    expect(expired.data[0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        effective_status: 'expired',
      }),
    );
  });

  it('filters accepted and cancelled exactly', async () => {
    const token = await login();
    expect(idsOf((await history(token, { status: 'accepted' })).data)).toEqual([
      ids.accepted,
    ]);
    expect(idsOf((await history(token, { status: 'cancelled' })).data)).toEqual(
      [ids.cancelled],
    );
  });

  it('searches by name and treats LIKE wildcards literally', async () => {
    const token = await login();
    expect(idsOf((await history(token, { search: 'neema' })).data)).toEqual([
      ids.pending,
    ]);
    expect(
      idsOf((await history(token, { search: 'juma tester' })).data),
    ).toEqual([ids.overdue]);
    expect(idsOf((await history(token, { search: '50%' })).data)).toEqual([
      ids.cancelled,
    ]);
    // Only the row whose email contains a literal '%' matches; an unescaped
    // '%' would match all five.
    expect(idsOf((await history(token, { search: '%' })).data)).toEqual([
      ids.cancelled,
    ]);
  });

  it('paginates', async () => {
    const page2 = await history(await login(), { limit: '2', page: '2' });
    expect(idsOf(page2.data)).toEqual([ids.expired, ids.accepted]);
    expect(page2.meta).toEqual(
      expect.objectContaining({ totalItems: 5, totalPages: 3, currentPage: 2 }),
    );
  });

  it('rejects invalid query parameters', async () => {
    const token = await login();
    for (const query of [
      { status: 'bogus' },
      { limit: '101' },
      { page: '0' },
    ]) {
      await request(app.getHttpServer() as App)
        .get('/api/employee-invitations/history')
        .query(query)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }
  });

  it('returns one invitation by id and hides other companies', async () => {
    const token = await login();
    const response = await request(app.getHttpServer() as App)
      .get(`/api/employee-invitations/${ids.accepted}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({ id: ids.accepted, status: 'accepted' }),
    );

    await request(app.getHttpServer() as App)
      .get(`/api/employee-invitations/${ids.foreign}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
