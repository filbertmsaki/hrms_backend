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
import { OPERATIONAL_REPORTS } from '../src/modules/analytics/services/analytics-core.services';
import { Permission } from '../src/modules/permissions/entities/permission.entity';
import { PermissionScope } from '../src/modules/permissions/enums/permission-scope.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Analytics operational reports (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let token: string;
  const createdPermissionIds: number[] = [];
  const password = 'AnalyticsReports!2026';

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const email = `analytics.reports.${suffix}@example.com`;

    const company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Analytics Reports Co ${suffix}`,
        slug: `e2e-analytics-reports-${suffix}`,
        status: 'active',
      }),
    );
    companyId = company.id;

    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-AR-${suffix}`.slice(0, 20),
        first_name: 'Analytics',
        last_name: 'Reporter',
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

    const permissionNames = new Set([
      'analytics:reports',
      'data_scope:company',
      ...OPERATIONAL_REPORTS.flatMap((definition) => definition.permissions),
    ]);

    for (const name of permissionNames) {
      const permission = await findOrCreatePermission(name);
      await dataSource.getRepository(CompanyUserPermission).save(
        dataSource.getRepository(CompanyUserPermission).create({
          company_user_id: companyUserId,
          permission_id: permission.id,
        }),
      );
    }

    const response = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    token = response.body.access_token as string;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
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
      for (const permissionId of createdPermissionIds) {
        await dataSource.query('DELETE FROM permissions WHERE id = $1', [
          permissionId,
        ]);
      }
    }
    await app?.close();
  });

  async function findOrCreatePermission(name: string): Promise<Permission> {
    const repository = dataSource.getRepository(Permission);
    const existing = await repository.findOne({ where: { name } });
    if (existing) return existing;

    const permission = await repository.save(
      repository.create({
        name,
        display_name: name,
        description: 'Created by analytics operational reports e2e smoke test.',
        scope: PermissionScope.COMPANY,
        is_system_generated: false,
      }),
    );
    createdPermissionIds.push(permission.id);
    return permission;
  }

  it('lists and executes every operational report code over the real API', async () => {
    const listResponse = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      listResponse.body.map((item: { code: string }) => item.code),
    ).toEqual(
      expect.arrayContaining(
        OPERATIONAL_REPORTS.map((definition) => definition.code),
      ),
    );

    for (const definition of OPERATIONAL_REPORTS) {
      const response = await request(app.getHttpServer() as App)
        .get(`/api/analytics/reports/operational/${definition.code}`)
        .query({
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          limit: 1,
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        report_code: definition.code,
        report_name: definition.name,
        page: 1,
        limit: 1,
      });
      expect(Array.isArray(response.body.rows)).toBe(true);
    }
  });
});
