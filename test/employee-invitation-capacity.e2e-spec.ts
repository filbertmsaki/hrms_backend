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

describe('Employee invitation position capacity (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let companyId: number;
  let otherCompanyId: number;
  let membershipId: number;
  let positionId: number;
  let otherPositionId: number;
  let foreignPositionId: number;
  let adminEmail: string;
  const password = 'PositionCapacity!2026';

  async function insertPosition(company: number, headcount: number) {
    const [row]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO positions (company_id, name, headcount) VALUES ($1, $2, $3) RETURNING id`,
      [company, `E2E Capacity ${Date.now()}-${Math.random()}`, headcount],
    );
    return row.id;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
    const s = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const companies = dataSource.getRepository(Company);
    companyId = (
      await companies.save(
        companies.create({
          name: `E2E Capacity ${s}`,
          slug: `e2e-capacity-${s}`,
          status: 'active',
        }),
      )
    ).id;
    otherCompanyId = (
      await companies.save(
        companies.create({
          name: `E2E Capacity Other ${s}`,
          slug: `e2e-capacity-other-${s}`,
          status: 'active',
        }),
      )
    ).id;

    adminEmail = `capacity.admin.${s}@example.com`;
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        user_no: `E2E-CAP-${s}`.slice(0, 20),
        first_name: 'Capacity',
        last_name: 'Admin',
        phone: `+255716${String(Date.now()).slice(-6)}`,
        email: adminEmail,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    membershipId = (
      await dataSource.getRepository(CompanyUser).save({
        company_id: companyId,
        user_id: user.id,
        status: 'active',
        is_default: true,
      })
    ).id;
    const permission = await dataSource
      .getRepository(Permission)
      .findOneByOrFail({ name: 'employees:create' });
    await dataSource.getRepository(CompanyUserPermission).save({
      company_user_id: membershipId,
      permission_id: permission.id,
    });

    positionId = await insertPosition(companyId, 2);
    otherPositionId = await insertPosition(companyId, 5);
    foreignPositionId = await insertPosition(otherCompanyId, 1);

    // Filled seats: only onboarding/active/suspended count.
    let n = 0;
    const employee = async (position: number, status: string) => {
      n += 1;
      await dataSource.query(
        `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version,
                                primary_position_id, employment_status)
         VALUES ($1, $2, 'Cap', 'Tester', 'female', 1, $3, $4)`,
        [companyId, `CAP-${s}-${n}`.slice(0, 50), position, status],
      );
    };
    await employee(positionId, 'active');
    await employee(positionId, 'terminated');
    await employee(otherPositionId, 'onboarding');

    // Pending seats: only unexpired pending invitations count. Branch and
    // department fixtures are irrelevant, so skip FK checks for these rows.
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SET session_replication_role = replica');
      const invite = async (status: string, expiresIn: string, i: number) =>
        runner.query(
          `INSERT INTO employee_invitations
             (company_id, token_hash, first_name, last_name, gender, email, phone,
              primary_branch_id, primary_department_id, primary_position_id, employment_type,
              status, email_delivery_status, sms_delivery_status, expires_at, created_at, updated_at)
           VALUES ($1, md5(random()::text), 'Cap', 'Invitee', 'female', $2, $3, 1, 1, $4,
                   'full_time', $5, 'sent', 'skipped', now() + $6::interval, now(), now())`,
          [
            companyId,
            `cap.${s}.${i}@example.com`,
            `+255717${String(Date.now()).slice(-5)}${i}`,
            positionId,
            status,
            expiresIn,
          ],
        );
      await invite('pending', '2 days', 1);
      await invite('pending', '-1 hour', 2);
      await invite('cancelled', '2 days', 3);
    } finally {
      await runner.query('SET session_replication_role = DEFAULT');
      await runner.release();
    }
  });

  afterAll(async () => {
    await dataSource.query(
      'DELETE FROM employee_invitations WHERE company_id = $1',
      [companyId],
    );
    await dataSource.query('DELETE FROM employees WHERE company_id = $1', [
      companyId,
    ]);
    await dataSource.query('DELETE FROM positions WHERE company_id = ANY($1)', [
      [companyId, otherCompanyId],
    ]);
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

  async function capacity(id: number, expected = 200) {
    const login = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(201);
    const response = await request(app.getHttpServer() as App)
      .get(`/api/employee-invitations/position-capacity/${id}`)
      .set('Authorization', `Bearer ${login.body.access_token as string}`)
      .expect(expected);
    return response.body as Record<string, unknown>;
  }

  it('counts filled seats and unexpired pending invitations', async () => {
    await expect(capacity(positionId)).resolves.toEqual({
      position_id: positionId,
      headcount: 2,
      filled: 1,
      pending_invitations: 1,
      available: 0,
      will_overfill: true,
    });
  });

  it('reports room left when the headcount allows it', async () => {
    await dataSource.query('UPDATE positions SET headcount = 3 WHERE id = $1', [
      positionId,
    ]);
    await expect(capacity(positionId)).resolves.toEqual(
      expect.objectContaining({ available: 1, will_overfill: false }),
    );
  });

  it('only counts employees in that position', async () => {
    await expect(capacity(otherPositionId)).resolves.toEqual(
      expect.objectContaining({ filled: 1, pending_invitations: 0 }),
    );
  });

  it('hides positions that belong to another company', async () => {
    await capacity(foreignPositionId, 404);
  });
});
