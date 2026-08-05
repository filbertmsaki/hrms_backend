process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = 'hrms_test_db';

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { hashPassword } from '../src/common/utils/hash.util';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../src/modules/companies/entities/company-user-permission.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Proves that company scoping is enforced server-side on the employee
 * detail endpoint, not just hidden in the UI: a user authenticated for
 * Company A, holding the real "employees:read" permission, must never be
 * able to read an employee record that belongs to Company B by guessing or
 * incrementing an ID in the URL.
 */
describe('Tenant isolation (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyAId: number;
  let companyBId: number;
  let userAId: number;
  let companyUserAId: number;
  let employeeAId: number;
  let employeeBId: number;
  let employeeUserAId: number;
  let employeeUserBId: number;
  let employeeMembershipAId: number;
  let employeeMembershipBId: number;
  const password = 'TenantIsolation!2026';
  let emailA: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (employeeAId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeAId,
      ]);
    }
    if (employeeBId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeBId,
      ]);
    }
    if (employeeMembershipAId) {
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        employeeMembershipAId,
      ]);
    }
    if (employeeMembershipBId) {
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        employeeMembershipBId,
      ]);
    }
    if (employeeUserAId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [
        employeeUserAId,
      ]);
    }
    if (employeeUserBId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [
        employeeUserBId,
      ]);
    }
    if (companyUserAId) {
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id = $1',
        [companyUserAId],
      );
      await dataSource.query('DELETE FROM company_users WHERE id = $1', [
        companyUserAId,
      ]);
    }
    if (userAId) {
      await dataSource.query('DELETE FROM users WHERE id = $1', [userAId]);
    }
    if (companyAId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyAId,
      ]);
    }
    if (companyBId) {
      await dataSource.query('DELETE FROM companies WHERE id = $1', [
        companyBId,
      ]);
    }
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    emailA = `tenant.a.${suffix}@example.com`;

    const companyA = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Tenant A ${suffix}`,
        slug: `e2e-tenant-a-${suffix}`,
        status: 'active',
      }),
    );
    companyAId = companyA.id;

    const companyB = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Tenant B ${suffix}`,
        slug: `e2e-tenant-b-${suffix}`,
        status: 'active',
      }),
    );
    companyBId = companyB.id;

    const userA = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-TA-${suffix}`.slice(0, 20),
        first_name: 'Tenant',
        last_name: 'A-User',
        phone: `+2558${suffix}`.slice(0, 20),
        email: emailA,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    userAId = userA.id;

    const membershipA = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyAId,
        user_id: userAId,
        status: 'active',
        is_default: true,
      }),
    );
    companyUserAId = membershipA.id;

    const requiredPermissionNames = ['employees:read', 'data_scope:company'];
    const requiredPermissions = await dataSource
      .getRepository(Permission)
      .find({ where: requiredPermissionNames.map((name) => ({ name })) });

    for (const permission of requiredPermissions) {
      await dataSource.getRepository(CompanyUserPermission).save(
        dataSource.getRepository(CompanyUserPermission).create({
          company_user_id: companyUserAId,
          permission_id: permission.id,
        }),
      );
    }

    const employeeUserA = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-EA-${suffix}`.slice(0, 20),
        first_name: 'Alice',
        last_name: 'TenantA',
        phone: `+2559${suffix}`.slice(0, 20),
        email: `tenant.employee.a.${suffix}@example.com`,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    employeeUserAId = employeeUserA.id;
    const employeeMembershipA = await dataSource
      .getRepository(CompanyUser)
      .save(
        dataSource.getRepository(CompanyUser).create({
          company_id: companyAId,
          user_id: employeeUserA.id,
          status: 'active',
          is_default: true,
        }),
      );
    employeeMembershipAId = employeeMembershipA.id;

    const employeeA = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyAId,
        company_user_id: employeeMembershipA.id,
        employee_no: `EMP-A-${suffix}`.slice(0, 50),
        first_name: 'Alice',
        last_name: 'TenantA',
        gender: 'female',
      }),
    );
    employeeAId = employeeA.id;

    const employeeUserB = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-EB-${suffix}`.slice(0, 20),
        first_name: 'Bob',
        last_name: 'TenantB',
        phone: `+2550${suffix}`.slice(0, 20),
        email: `tenant.employee.b.${suffix}@example.com`,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    employeeUserBId = employeeUserB.id;
    const employeeMembershipB = await dataSource
      .getRepository(CompanyUser)
      .save(
        dataSource.getRepository(CompanyUser).create({
          company_id: companyBId,
          user_id: employeeUserB.id,
          status: 'active',
          is_default: true,
        }),
      );
    employeeMembershipBId = employeeMembershipB.id;

    const employeeB = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyBId,
        company_user_id: employeeMembershipB.id,
        employee_no: `EMP-B-${suffix}`.slice(0, 50),
        first_name: 'Bob',
        last_name: 'TenantB',
        gender: 'male',
      }),
    );
    employeeBId = employeeB.id;
  });

  async function loginAsCompanyA(): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: emailA, password })
      .expect(201);

    expect(response.body.access_token).toBeDefined();
    return response.body.access_token as string;
  }

  it('allows a Company A user to read a Company A employee', async () => {
    const token = await loginAsCompanyA();

    const response = await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id ?? response.body.employee?.id).toBeDefined();
  });

  it('blocks a Company A user from reading a Company B employee by ID', async () => {
    const token = await loginAsCompanyA();

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeBId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json')
      .expect((response) => {
        expect([403, 404]).toContain(response.status);
      });
  });

  it('blocks an unauthenticated request to any employee record', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeAId}`)
      .expect(401);
  });
});
