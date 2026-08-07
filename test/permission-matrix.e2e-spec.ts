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
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Proves PermissionsGuard is enforced on every request from the real
 * database, not cached in the JWT: granting a permission takes effect on
 * the very next request without a new login, and revoking one blocks
 * access immediately -- an admin removing access mid-session must actually
 * work, not just look like it worked in the admin UI.
 */
describe('Permission matrix (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let employeeId: number;
  let employeesReadPermissionId: number;
  let dataScopeCompanyPermissionId: number;
  const password = 'PermissionMatrix!2026';
  let email: string;
  let token: string;

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);

    const employeesRead = await dataSource
      .getRepository(Permission)
      .findOneOrFail({ where: { name: 'employees:read' } });
    employeesReadPermissionId = employeesRead.id;

    const dataScopeCompany = await dataSource
      .getRepository(Permission)
      .findOneOrFail({ where: { name: 'data_scope:company' } });
    dataScopeCompanyPermissionId = dataScopeCompany.id;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (employeeId) {
      await dataSource.query('DELETE FROM employees WHERE id = $1', [
        employeeId,
      ]);
    }
    if (companyUserId) {
      await dataSource.query(
        'DELETE FROM company_user_permissions WHERE company_user_id = $1',
        [companyUserId],
      );
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
    email = `permission.matrix.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Permission Matrix Co ${suffix}`,
        slug: `e2e-permission-matrix-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-PM-${suffix}`.slice(0, 20),
        first_name: 'Permission',
        last_name: 'Matrix',
        phone: `+2553${suffix}`.slice(0, 20),
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

    const employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: companyUserId,
        employee_no: `EMP-PM-${suffix}`.slice(0, 50),
        first_name: 'Permission',
        last_name: 'Matrix',
        gender: 'female',
      }),
    );
    employeeId = employee.id;

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = response.body.access_token as string;
  });

  async function grantPermission(permissionId: number): Promise<void> {
    await dataSource.getRepository(CompanyUserPermission).save(
      dataSource.getRepository(CompanyUserPermission).create({
        company_user_id: companyUserId,
        permission_id: permissionId,
      }),
    );
  }

  async function revokePermission(permissionId: number): Promise<void> {
    await dataSource.query(
      'DELETE FROM company_user_permissions WHERE company_user_id = $1 AND permission_id = $2',
      [companyUserId, permissionId],
    );
  }

  it('denies access to a protected resource when the required permission is missing', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows access on the very next request after the permission is granted, with no new login', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await grantPermission(employeesReadPermissionId);
    await grantPermission(dataScopeCompanyPermissionId);

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('denies access again immediately after the permission is revoked, with the same still-valid token', async () => {
    await grantPermission(employeesReadPermissionId);
    await grantPermission(dataScopeCompanyPermissionId);

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await revokePermission(employeesReadPermissionId);

    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects an unauthenticated request before permissions are even evaluated', async () => {
    await request(app.getHttpServer() as App)
      .get(`/api/employees/${employeeId}`)
      .expect(401);
  });
});
