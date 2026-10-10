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

describe('Permanent delete of onboarding employees (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyIds: number[] = [];
  let userEmails: string[] = [];
  let companyId: number;
  let adminEmail: string;
  const password = 'PermanentDelete!2026';
  let phoneCounter = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    for (const id of companyIds) {
      await dataSource.query(
        'UPDATE employees SET reports_to = NULL WHERE company_id = $1',
        [id],
      );
      await dataSource.query(
        'DELETE FROM employee_reporting_lines WHERE employee_id IN (SELECT id FROM employees WHERE company_id = $1)',
        [id],
      );
      await dataSource.query(
        'DELETE FROM employee_employment_events WHERE employee_id IN (SELECT id FROM employees WHERE company_id = $1)',
        [id],
      );
      await dataSource.query('DELETE FROM employees WHERE company_id = $1', [
        id,
      ]);
      await dataSource.query(
        'DELETE FROM employee_number_sequences WHERE company_id = $1',
        [id],
      );
      await dataSource.query(
        'DELETE FROM company_users WHERE company_id = $1',
        [id],
      );
    }
    if (userEmails.length) {
      await dataSource.query('DELETE FROM users WHERE email = ANY($1)', [
        userEmails,
      ]);
    }
    for (const id of companyIds) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [id]);
    }
    companyIds = [];
    userEmails = [];
  });

  function suffix() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  function nextPhone() {
    phoneCounter += 1;
    const tail = `${Date.now() % 1_000_000}${phoneCounter}`.slice(-6);
    return `+255713${tail.padStart(6, '0')}`;
  }

  async function createCompany(): Promise<number> {
    const s = suffix();
    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Permanent Delete ${s}`,
        slug: `e2e-permanent-delete-${s}`,
        status: 'active',
      }),
    );
    companyIds.push(company.id);
    await dataSource.query(
      `INSERT INTO employee_number_sequences (company_id, prefix, padding, next_number) VALUES ($1, 'PD', 4, 1)`,
      [company.id],
    );
    return company.id;
  }

  beforeEach(async () => {
    companyId = await createCompany();
    const s = suffix();
    adminEmail = `permanent.delete.admin.${s}@example.com`;
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-PD-${s}`.slice(0, 20),
        first_name: 'Delete',
        last_name: 'Admin',
        phone: nextPhone(),
        email: adminEmail,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userEmails.push(adminEmail);
    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: user.id,
        status: 'active',
        is_default: true,
      }),
    );
    const permissions = await dataSource.getRepository(Permission).find({
      where: [
        'employees:create',
        'employees:read',
        'employees:delete',
        'data_scope:company',
      ].map((name) => ({ name })),
    });
    for (const permission of permissions) {
      await dataSource.getRepository(CompanyUserPermission).save(
        dataSource.getRepository(CompanyUserPermission).create({
          company_user_id: membership.id,
          permission_id: permission.id,
        }),
      );
    }
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(201);
    return response.body.access_token as string;
  }

  async function createEmployee(
    token: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: number; email: string }> {
    const email = `onboarding.${suffix()}@example.com`;
    userEmails.push(email);
    const response = await request(app.getHttpServer() as App)
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        first_name: 'Onboard',
        last_name: 'Person',
        gender: 'female',
        employment_status: 'onboarding',
        contacts: [
          {
            contact_type: 'work',
            email,
            phone_number: nextPhone(),
            is_primary: true,
          },
        ],
        onboarding: { auto_start: false },
        ...extra,
      });
    if (response.status !== 201) {
      throw new Error(
        `Employee creation failed with ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }
    return { id: response.body.id as number, email };
  }

  async function count(sql: string, params: unknown[]): Promise<number> {
    const [row]: Array<{ count: string }> = await dataSource.query(
      `SELECT COUNT(*) AS count FROM ${sql}`,
      params,
    );
    return Number(row.count);
  }

  it('removes the employee, child records, membership and unused login', async () => {
    const token = await login();
    const employee = await createEmployee(token);
    const [{ company_user_id: companyUserId }]: Array<{
      company_user_id: number;
    }> = await dataSource.query(
      'SELECT company_user_id FROM employees WHERE id = $1',
      [employee.id],
    );
    expect(companyUserId).toEqual(expect.any(Number));
    expect(
      await count('employee_contacts WHERE employee_id = $1', [employee.id]),
    ).toBeGreaterThan(0);

    const response = await request(app.getHttpServer() as App)
      .delete(`/api/employees/${employee.id}/permanent`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        employee_id: employee.id,
        company_user_removed: true,
        user_account_removed: true,
      }),
    );
    expect(await count('employees WHERE id = $1', [employee.id])).toBe(0);
    expect(
      await count('employee_contacts WHERE employee_id = $1', [employee.id]),
    ).toBe(0);
    expect(
      await count('employee_employment_events WHERE employee_id = $1', [
        employee.id,
      ]),
    ).toBe(0);
    expect(await count('company_users WHERE id = $1', [companyUserId])).toBe(0);
    expect(await count('users WHERE email = $1', [employee.email])).toBe(0);
    expect(
      await count(
        `security_events WHERE event_type = 'EMPLOYEE_PERMANENTLY_DELETED' AND resource_id = $1`,
        [String(employee.id)],
      ),
    ).toBe(1);
  });

  it('keeps the login when the person belongs to another company', async () => {
    const token = await login();
    const employee = await createEmployee(token);
    const otherCompanyId = await createCompany();
    const [{ id: userId }]: Array<{ id: number }> = await dataSource.query(
      'SELECT id FROM users WHERE email = $1',
      [employee.email],
    );
    await dataSource.query(
      `INSERT INTO company_users (company_id, user_id, status, is_default) VALUES ($1, $2, 'active', false)`,
      [otherCompanyId, userId],
    );

    const response = await request(app.getHttpServer() as App)
      .delete(`/api/employees/${employee.id}/permanent`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.company_user_removed).toBe(true);
    expect(response.body.user_account_removed).toBe(false);
    expect(await count('users WHERE id = $1', [userId])).toBe(1);
    expect(
      await count('company_users WHERE user_id = $1 AND company_id = $2', [
        userId,
        otherCompanyId,
      ]),
    ).toBe(1);
  });

  it('refuses an employee who is no longer onboarding', async () => {
    const token = await login();
    const employee = await createEmployee(token, {
      employment_status: 'active',
    });

    await request(app.getHttpServer() as App)
      .delete(`/api/employees/${employee.id}/permanent`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(await count('employees WHERE id = $1', [employee.id])).toBe(1);
  });

  it('refuses an employee who manages someone else', async () => {
    const token = await login();
    const manager = await createEmployee(token);
    await createEmployee(token, { reports_to: manager.id });

    const response = await request(app.getHttpServer() as App)
      .delete(`/api/employees/${manager.id}/permanent`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(String(response.body.message)).toMatch(/manager/);
    expect(await count('employees WHERE id = $1', [manager.id])).toBe(1);
  });

  it('requires the employees:delete permission', async () => {
    const token = await login();
    const employee = await createEmployee(token);
    await dataSource.query(
      `DELETE FROM company_user_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'employees:delete')
          AND company_user_id IN (SELECT id FROM company_users WHERE company_id = $1)`,
      [companyId],
    );
    const freshToken = await login();

    await request(app.getHttpServer() as App)
      .delete(`/api/employees/${employee.id}/permanent`)
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(403);

    expect(await count('employees WHERE id = $1', [employee.id])).toBe(1);
  });
});
