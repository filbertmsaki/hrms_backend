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
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { PerformanceAggregate } from '../src/modules/hr/performance/entities/performance-aggregate.entity';
import { PerformanceFinancialYear } from '../src/modules/hr/performance/entities/performance-financial-year.entity';
import { PerformancePeriod } from '../src/modules/hr/performance/entities/performance-period.entity';
import { PerformanceAggregationMethodEnum } from '../src/modules/hr/performance/enums/performance-aggregation-method.enum';
import { PerformancePeriodTypeEnum } from '../src/modules/hr/performance/enums/performance-period-type.enum';
import { PerformancePeriodStatusEnum } from '../src/modules/hr/performance/enums/performance-period-status.enum';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Analytics operational reports (e2e, real Postgres)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let companyId: number;
  let userId: number;
  let companyUserId: number;
  let employeeId: number;
  let financialYearId: number;
  let quarterlyPeriodId: number;
  const aggregateIds: number[] = [];
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

    const employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: null,
        employee_no: `DEMO-KPI-${suffix}`.slice(0, 50),
        first_name: 'KPI',
        middle_name: null,
        last_name: 'Demo Employee',
        preferred_name: null,
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
        metadata: { e2e_demo: true, feature: 'weekly-annual-reporting' },
      }),
    );
    employeeId = employee.id;

    const financialYear = await dataSource
      .getRepository(PerformanceFinancialYear)
      .save(
        dataSource.getRepository(PerformanceFinancialYear).create({
          companyId,
          code: `E2E-${suffix}`.slice(0, 30),
          name: `E2E Reporting FY ${suffix}`.slice(0, 100),
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          status: 'ACTIVE',
          annualAggregationMethod:
            PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE,
          aggregationConfiguration: { e2e_demo: true },
          isLocked: false,
          lockedAt: null,
          lockedByCompanyUserId: null,
        }),
      );
    financialYearId = financialYear.id;

    const quarterlyPeriod = await dataSource
      .getRepository(PerformancePeriod)
      .save(
        dataSource.getRepository(PerformancePeriod).create({
          companyId,
          financialYearId,
          periodType: PerformancePeriodTypeEnum.QUARTERLY,
          sequenceNumber: 1,
          name: 'Q1 2026',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          status: PerformancePeriodStatusEnum.PUBLISHED,
          generationSnapshot: { e2e_demo: true },
        }),
      );
    quarterlyPeriodId = quarterlyPeriod.id;

    const aggregates = await dataSource
      .getRepository(PerformanceAggregate)
      .save([
        {
          companyId,
          employeeId,
          financialYearId,
          periodType: PerformancePeriodTypeEnum.QUARTERLY,
          sequenceNumber: 1,
          name: 'Q1 2026',
          aggregationMethod:
            PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE,
          aggregateScore: '88.5000',
          ratingCode: 'EXCEEDS_EXPECTATIONS',
          sourceReviewHashes: ['e2e-quarter-review'],
          calculationSnapshot: { e2e_demo: true, source_count: 3 },
          publishedAt: new Date('2026-04-01T00:00:00.000Z'),
          lockedAt: null,
        },
        {
          companyId,
          employeeId,
          financialYearId,
          periodType: PerformancePeriodTypeEnum.ANNUAL,
          sequenceNumber: 1,
          name: 'FY 2026',
          aggregationMethod:
            PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE,
          aggregateScore: '91.2500',
          ratingCode: 'OUTSTANDING',
          sourceReviewHashes: ['e2e-annual-review'],
          calculationSnapshot: { e2e_demo: true, source_count: 12 },
          publishedAt: new Date('2027-01-01T00:00:00.000Z'),
          lockedAt: null,
        },
      ]);
    aggregateIds.push(...aggregates.map((aggregate) => aggregate.id));

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
      if (aggregateIds.length) {
        await dataSource
          .getRepository(PerformanceAggregate)
          .delete(aggregateIds);
      }
      if (quarterlyPeriodId) {
        await dataSource
          .getRepository(PerformancePeriod)
          .delete(quarterlyPeriodId);
      }
      if (financialYearId) {
        await dataSource
          .getRepository(PerformanceFinancialYear)
          .delete(financialYearId);
      }
      if (employeeId) {
        await dataSource.getRepository(Employee).delete(employeeId);
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

  it('returns seeded demo quarterly and annual scores through authorized reports', async () => {
    const cases = [
      {
        code: 'QUARTERLY_KPI_AVERAGE',
        query: {
          year: 2026,
          quarter: 1,
          date_from: '2026-01-01',
          date_to: '2026-03-31',
        },
        score: '88.5000',
      },
      {
        code: 'ANNUAL_KPI_AVERAGE',
        query: {
          year: 2026,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
        },
        score: '91.2500',
      },
    ];

    for (const testCase of cases) {
      const response = await request(app.getHttpServer() as App)
        .get(`/api/analytics/reports/operational/${testCase.code}`)
        .query({ ...testCase.query, employee_id: employeeId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.rows[0]).toMatchObject({
        employee_number: expect.stringContaining('DEMO-KPI-'),
        score: testCase.score,
      });
    }
  });
});
