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
import { WorkActivityReminderService } from '../src/modules/hr/work-activities/services/work-activity-reminder.service';
import { PerformanceAggregate } from '../src/modules/hr/performance/entities/performance-aggregate.entity';
import { PerformanceFinancialYear } from '../src/modules/hr/performance/entities/performance-financial-year.entity';
import { PerformancePeriod } from '../src/modules/hr/performance/entities/performance-period.entity';
import { PerformanceAggregationMethodEnum } from '../src/modules/hr/performance/enums/performance-aggregation-method.enum';
import { PerformancePeriodTypeEnum } from '../src/modules/hr/performance/enums/performance-period-type.enum';
import { PerformancePeriodStatusEnum } from '../src/modules/hr/performance/enums/performance-period-status.enum';
import { createE2eApp } from './helpers/create-e2e-app';
import { inflateRawSync, inflateSync } from 'node:zlib';

function readZipEntry(zip: Buffer, name: string) {
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Invalid XLSX ZIP directory.');
  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== centralSignature) {
      throw new Error('Invalid XLSX central directory entry.');
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const entryName = zip
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8');
    if (entryName === name) {
      if (zip.readUInt32LE(localOffset) !== localSignature) {
        throw new Error('Invalid XLSX local file header.');
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
      if (method === 0) return compressed.toString('utf8');
      if (method === 8) return inflateRawSync(compressed).toString('utf8');
      throw new Error(`Unsupported XLSX ZIP compression method ${method}.`);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  throw new Error(`Missing XLSX entry ${name}.`);
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readXlsxStringCells(zip: Buffer, worksheetXml: string) {
  const sharedStringsXml = readZipEntry(zip, 'xl/sharedStrings.xml');
  const sharedStrings = [
    ...sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
  ].map((item) =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join(''),
  );
  return (cellReference: string) => {
    const cell = worksheetXml.match(
      new RegExp(`<c\\b[^>]*\\br="${cellReference}"[^>]*>([\\s\\S]*?)<\\/c>`),
    );
    if (!cell) return undefined;
    const value = cell[1].match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (value === undefined) return undefined;
    return /\bt="s"/.test(cell[0])
      ? sharedStrings[Number(value)]
      : Number(value);
  };
}

function excelColumn(index: number) {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

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
  let otherCompanyId: number;
  let otherEmployeeId: number;
  let noActivityEmployeeId: number;
  let categoryId: number;
  let reportId: number;
  let escalationReportId: number;
  let notificationPolicyId: number;
  const visitIds: number[] = [];
  let unauthorizedToken: string;
  let unauthorizedUserId: number;
  let unauthorizedCompanyUserId: number;
  let employeeToken: string;
  let employeeUserId: number;
  let employeeCompanyUserId: number;
  let managerToken: string;
  let managerUserId: number;
  let managerCompanyUserId: number;
  let managerEmployeeId: number;
  const today = new Date().toISOString().slice(0, 10);
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

    const otherCompany = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `E2E Analytics Other Co ${suffix}`,
        slug: `e2e-analytics-other-${suffix}`,
        status: 'active',
      }),
    );
    otherCompanyId = otherCompany.id;
    const otherEmployee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: otherCompanyId,
        company_user_id: null,
        employee_no: `OTHER-${suffix}`.slice(0, 50),
        first_name: 'Other',
        last_name: 'Tenant',
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
      }),
    );
    otherEmployeeId = otherEmployee.id;
    const noActivityEmployee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: null,
        employee_no: `NOACT-${suffix}`.slice(0, 50),
        first_name: 'Attendance',
        last_name: 'Only',
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
      }),
    );
    noActivityEmployeeId = noActivityEmployee.id;

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
    const managerAccount = await createRoleAccount(
      `analytics.manager.${suffix}@example.com`,
      `E2E-MGR-${suffix}`,
      ['work_activities:manager:read'],
    );
    managerUserId = managerAccount.userId;
    managerCompanyUserId = managerAccount.companyUserId;
    const managerEmployee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: companyId,
        company_user_id: managerCompanyUserId,
        employee_no: `MGR-${suffix}`.slice(0, 50),
        first_name: 'Phase 9',
        last_name: 'Manager',
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
      }),
    );
    managerEmployeeId = managerEmployee.id;
    await dataSource.getRepository(Employee).update(employeeId, {
      reports_to: managerEmployeeId,
    });

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

    // A signed-in account without analytics or HR report permissions is used
    // to prove role denial against the populated operational report endpoint.
    const unauthorizedEmail = `analytics.denied.${suffix}@example.com`;
    const unauthorizedUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E2E-DENY-${suffix}`.slice(0, 20),
        first_name: 'Unauthorized',
        last_name: 'Reporter',
        phone: `+2557${suffix}`.slice(0, 20),
        email: unauthorizedEmail,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    unauthorizedUserId = unauthorizedUser.id;
    const unauthorizedMembership = await dataSource
      .getRepository(CompanyUser)
      .save(
        dataSource.getRepository(CompanyUser).create({
          company_id: companyId,
          user_id: unauthorizedUserId,
          status: 'active',
          is_default: true,
        }),
      );
    unauthorizedCompanyUserId = unauthorizedMembership.id;
    const unauthorizedLogin = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email: unauthorizedEmail, password })
      .expect(201);
    unauthorizedToken = unauthorizedLogin.body.access_token as string;

    const employeeAccount = await createRoleAccount(
      `analytics.employee.${suffix}@example.com`,
      `E2E-EMP-${suffix}`,
      [
        'work_activities:self-service:read',
        'work_activities:self-service:update',
      ],
    );
    employeeUserId = employeeAccount.userId;
    employeeCompanyUserId = employeeAccount.companyUserId;
    employeeToken = employeeAccount.token;
    await dataSource.getRepository(Employee).update(noActivityEmployeeId, {
      company_user_id: employeeCompanyUserId,
    });

    const managerLogin = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({
        email: `analytics.manager.${suffix}@example.com`,
        password,
      })
      .expect(201);
    managerToken = managerLogin.body.access_token as string;

    await seedProductivityFixture();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (reportId) {
        await dataSource.query(
          'DELETE FROM daily_activity_entries WHERE daily_activity_report_id = $1',
          [reportId],
        );
        await dataSource.query(
          'DELETE FROM daily_activity_reports WHERE id = $1',
          [reportId],
        );
      }
      if (escalationReportId) {
        await dataSource.query(
          'DELETE FROM daily_activity_reports WHERE id = $1',
          [escalationReportId],
        );
      }
      if (visitIds.length) {
        await dataSource.query(
          'DELETE FROM field_opportunities WHERE field_visit_id = ANY($1::int[])',
          [visitIds],
        );
        await dataSource.query(
          'DELETE FROM field_visits WHERE id = ANY($1::int[])',
          [visitIds],
        );
      }
      if (noActivityEmployeeId) {
        await dataSource.query(
          `DELETE FROM field_mobile_sync_requests
           WHERE company_id = $1 AND employee_id = $2`,
          [companyId, noActivityEmployeeId],
        );
        await dataSource.query(
          `DELETE FROM daily_activity_entries entry
           USING daily_activity_reports report
           WHERE entry.daily_activity_report_id = report.id
             AND report.company_id = $1 AND report.employee_id = $2`,
          [companyId, noActivityEmployeeId],
        );
        await dataSource.query(
          'DELETE FROM daily_activity_reports WHERE company_id = $1 AND employee_id = $2',
          [companyId, noActivityEmployeeId],
        );
        await dataSource.query(
          'DELETE FROM attendance_daily_summaries WHERE company_id = $1 AND employee_id = $2 AND attendance_date = $3',
          [companyId, noActivityEmployeeId, today],
        );
      }
      if (categoryId)
        await dataSource.query(
          'DELETE FROM activity_categories WHERE id = $1',
          [categoryId],
        );
      if (notificationPolicyId) {
        await dataSource.query('DELETE FROM activity_policies WHERE id = $1', [
          notificationPolicyId,
        ]);
      }
      if (companyId) {
        await dataSource.query(
          'DELETE FROM action_items WHERE company_id = $1',
          [companyId],
        );
      }
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
      if (noActivityEmployeeId) {
        await dataSource.getRepository(Employee).delete(noActivityEmployeeId);
      }
      if (managerEmployeeId) {
        await dataSource.getRepository(Employee).delete(managerEmployeeId);
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
      if (otherEmployeeId)
        await dataSource.getRepository(Employee).delete(otherEmployeeId);
      if (unauthorizedCompanyUserId) {
        await dataSource.query(
          'DELETE FROM company_user_permissions WHERE company_user_id = $1',
          [unauthorizedCompanyUserId],
        );
        await dataSource.query('DELETE FROM company_users WHERE id = $1', [
          unauthorizedCompanyUserId,
        ]);
      }
      if (unauthorizedUserId)
        await dataSource.query('DELETE FROM users WHERE id = $1', [
          unauthorizedUserId,
        ]);
      if (employeeCompanyUserId) {
        await dataSource.query(
          'DELETE FROM company_user_permissions WHERE company_user_id = $1',
          [employeeCompanyUserId],
        );
        await dataSource.query('DELETE FROM company_users WHERE id = $1', [
          employeeCompanyUserId,
        ]);
      }
      if (employeeUserId)
        await dataSource.query('DELETE FROM users WHERE id = $1', [
          employeeUserId,
        ]);
      if (managerCompanyUserId) {
        await dataSource.query(
          'DELETE FROM company_user_permissions WHERE company_user_id = $1',
          [managerCompanyUserId],
        );
        await dataSource.query('DELETE FROM company_users WHERE id = $1', [
          managerCompanyUserId,
        ]);
      }
      if (managerUserId)
        await dataSource.query('DELETE FROM users WHERE id = $1', [
          managerUserId,
        ]);
      if (companyId) {
        await dataSource.query('DELETE FROM companies WHERE id = $1', [
          companyId,
        ]);
      }
      if (otherCompanyId)
        await dataSource.getRepository(Company).delete(otherCompanyId);
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

  async function createRoleAccount(
    email: string,
    userNo: string,
    permissionNames: string[],
  ) {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: userNo.slice(0, 20),
        first_name: 'Phase 9',
        last_name: 'Role Account',
        phone: `+2558${Date.now()}`.slice(0, 20),
        email,
        password: await hashPassword(password),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
        auth_token_version: 1,
      }),
    );
    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: companyId,
        user_id: user.id,
        status: 'active',
        is_default: true,
      }),
    );
    for (const name of permissionNames) {
      const permission = await findOrCreatePermission(name);
      await dataSource.getRepository(CompanyUserPermission).save(
        dataSource.getRepository(CompanyUserPermission).create({
          company_user_id: membership.id,
          permission_id: permission.id,
        }),
      );
    }
    const login = await request(app.getHttpServer() as App)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    return {
      userId: user.id,
      companyUserId: membership.id,
      token: login.body.access_token as string,
    };
  }

  async function seedProductivityFixture() {
    const [category] = await dataSource.query(
      `INSERT INTO activity_categories (company_id, code, name, version)
       VALUES ($1, $2, $3, 1) RETURNING id`,
      [companyId, `P9-${Date.now()}`, 'Phase 9 synthetic activity'],
    );
    categoryId = Number(category.id);
    const [report] = await dataSource.query(
      `INSERT INTO daily_activity_reports (
         company_id, employee_id, activity_date, status, employee_snapshot,
         policy_snapshot, submitted_at, version
       ) VALUES ($1, $2, $3, 'APPROVED', $4::jsonb, $5::jsonb, NOW(), 1)
       RETURNING id`,
      [
        companyId,
        employeeId,
        today,
        JSON.stringify({ employee_no: `DEMO-KPI-${employeeId}` }),
        JSON.stringify({ daily_submission_required: true }),
      ],
    );
    reportId = Number(report.id);
    const previousDate = new Date(`${today}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const [escalationReport] = await dataSource.query(
      `INSERT INTO daily_activity_reports (
         company_id, employee_id, activity_date, status, employee_snapshot,
         policy_snapshot, submitted_at, manager_employee_id,
         manager_company_user_id, version
       ) VALUES ($1, $2, $3, 'MANAGER_REVIEW_PENDING', $4::jsonb,
                 $5::jsonb, NOW() - INTERVAL '48 hours', $6, $7, 1)
       RETURNING id`,
      [
        companyId,
        employeeId,
        previousDate.toISOString().slice(0, 10),
        JSON.stringify({ employee_no: `DEMO-KPI-${employeeId}` }),
        JSON.stringify({ manager_review_due_hours: 24 }),
        managerEmployeeId,
        managerCompanyUserId,
      ],
    );
    escalationReportId = Number(escalationReport.id);
    await dataSource.query(
      `INSERT INTO daily_activity_entries
         (company_id, daily_activity_report_id, activity_category_id, title,
          description, status, version)
       VALUES
         ($1, $2, $3, 'Completed synthetic task', 'Independent reconciliation', 'COMPLETED', 1),
         ($1, $2, $3, 'Planned synthetic task', 'Independent reconciliation', 'PLANNED', 1),
         ($1, $2, $3, 'Deferred synthetic task', 'Independent reconciliation', 'DEFERRED', 1)`,
      [companyId, reportId, categoryId],
    );

    for (const [index, isUnplanned] of [false, true].entries()) {
      const [visit] = await dataSource.query(
        `INSERT INTO field_visits (
           company_id, employee_id, visit_no, visit_date, visit_type, status,
           is_unplanned, purpose, manager_review_status, employee_snapshot,
           policy_snapshot, version
         ) VALUES ($1, $2, $3, $4, 'CUSTOMER_VISIT', 'REVIEWED', $5,
                   'Phase 9 synthetic visit', 'APPROVED', $6::jsonb, $7::jsonb, 1)
         RETURNING id`,
        [
          companyId,
          employeeId,
          `P9-${Date.now()}-${index}`,
          today,
          isUnplanned,
          JSON.stringify({ employee_no: `DEMO-KPI-${employeeId}` }),
          JSON.stringify({}),
        ],
      );
      visitIds.push(Number(visit.id));
    }
    await dataSource.query(
      `INSERT INTO field_opportunities (
         company_id, field_visit_id, employee_id, opportunity_type, title,
         potential_value, currency, actual_value, status,
         validated_by_manager, version
       ) VALUES ($1, $2, $3, 'LEAD', 'Phase 9 synthetic opportunity',
                 1250, 'TZS', 500, 'WON', true, 1)`,
      [companyId, visitIds[0], employeeId],
    );
    await dataSource.query(
      `INSERT INTO attendance_daily_summaries (
         company_id, employee_id, attendance_date, schedule_source, timezone,
         attendance_status, check_in_at
       ) VALUES ($1, $2, $3, 'PHASE9_SYNTHETIC', 'Africa/Dar_es_Salaam',
                 'PRESENT', $4::timestamp)`,
      [companyId, noActivityEmployeeId, today, `${today} 08:00:00`],
    );
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

  it('reconciles populated productivity rows and CSV/XLSX/PDF exports', async () => {
    const query = { date_from: today, date_to: today, employee_id: employeeId };
    const response = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY')
      .query(query)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    const row = response.body.rows[0] as Record<string, unknown>;
    // Independent expected values: three planned activity statuses with one
    // completed; one planned approved visit and one unplanned approved visit.
    expect(Number(row.planned_activity_count)).toBe(3);
    expect(Number(row.completed_activity_count)).toBe(1);
    expect(Number(row.planned_visit_count)).toBe(1);
    expect(Number(row.completed_visit_count)).toBe(1);
    expect(Number(row.visit_completion_rate)).toBe(100);
    expect(Number(row.lead_count)).toBe(1);
    expect(Number(row.reported_potential_value)).toBe(1250);
    expect(Number(row.validated_actual_value)).toBe(500);

    const binaryParser = (
      res: NodeJS.ReadableStream,
      callback: (error: Error | null, body?: Buffer) => void,
    ) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      res.on('end', () => callback(null, Buffer.concat(chunks)));
      res.on('error', (error: Error) => callback(error));
    };
    const csv = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY/export')
      .query({ ...query, output_format: 'CSV' })
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const csvText = (csv.body as Buffer).toString('utf8');
    expect(csvText).toContain('completed_visit_count');
    expect(csvText).toContain('100');

    const xlsx = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY/export')
      .query({ ...query, output_format: 'XLSX' })
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const xlsxBuffer = xlsx.body as Buffer;
    const worksheetXml = readZipEntry(xlsxBuffer, 'xl/worksheets/sheet1.xml');
    const readCell = readXlsxStringCells(xlsxBuffer, worksheetXml);
    const headers = Array.from({ length: 40 }, (_, index) => index + 1).map(
      (column) => readCell(`${excelColumn(column)}1`),
    );
    const completedVisitColumn = headers.indexOf('completed visit count') + 1;
    const visitCompletionColumn = headers.indexOf('visit completion rate') + 1;
    expect(completedVisitColumn).toBeGreaterThan(0);
    expect(visitCompletionColumn).toBeGreaterThan(0);
    expect(readCell(`${excelColumn(completedVisitColumn)}2`)).toBe(1);
    expect(Number(readCell(`${excelColumn(visitCompletionColumn)}2`))).toBe(
      100,
    );

    const pdf = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY/export')
      .query({ ...query, output_format: 'PDF' })
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const pdfBuffer = pdf.body as Buffer;
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    const pdfStructure = pdfBuffer.toString('latin1');
    expect(pdfStructure).toContain('%%EOF');
    expect(Number(pdfStructure.match(/\/Count\s+(\d+)/)?.[1])).toBeGreaterThan(
      1,
    );
    const pdfText = [
      ...pdfStructure.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
    ]
      .map((stream) => {
        try {
          const content = inflateSync(Buffer.from(stream[1], 'latin1'), {
            maxOutputLength: 100_000,
          }).toString('latin1');
          if (!content.includes('BT')) return '';
          return [...content.matchAll(/<([0-9a-fA-F]+)>/g)]
            .map((token) => Buffer.from(token[1], 'hex').toString('latin1'))
            .join('');
        } catch {
          return '';
        }
      })
      .join('');
    expect(pdfText).toContain('completed visit count');
    expect(pdfText).toContain('planned activity count');
    expect(pdfText).toContain('100');
  });

  it('reconciles attendance-without-activity against its synthetic population', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/ATTENDANCE_WITHOUT_ACTIVITY')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.rows[0]).toMatchObject({
      employee_number: expect.stringContaining('NOACT-'),
      attendance_status: 'PRESENT',
      exception_type: 'ATTENDANCE_WITHOUT_ACTIVITY',
    });
    expect(
      response.body.rows.some(
        (row: { employee_id: number }) => row.employee_id === employeeId,
      ),
    ).toBe(false);
  });

  it('denies unauthorized accounts and returns no cross-tenant report rows', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY')
      .query({ date_from: today, date_to: today, employee_id: employeeId })
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .expect(403);

    const response = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY')
      .query({ date_from: today, date_to: today, employee_id: otherEmployeeId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.total).toBe(0);
    expect(response.body.rows).toEqual([]);

    const crossTenantExport = await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY/export')
      .query({
        date_from: today,
        date_to: today,
        employee_id: otherEmployeeId,
        output_format: 'CSV',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(crossTenantExport.text).not.toContain(`OTHER-${otherEmployeeId}`);

    await request(app.getHttpServer() as App)
      .get('/api/hr/activities/planned-completed')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .expect(403);
  });

  it('enforces employee and manager scopes and replays offline sync idempotently', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/me/activities/categories')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    await request(app.getHttpServer() as App)
      .get('/api/hr/activities/planned-completed')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);

    const team = await request(app.getHttpServer() as App)
      .get('/api/manager/activities/team')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(team.body).toBeDefined();
    await request(app.getHttpServer() as App)
      .get('/api/hr/activities/planned-completed')
      .query({ date_from: today, date_to: today })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    await request(app.getHttpServer() as App)
      .get('/api/analytics/reports/operational/FIELD_PRODUCTIVITY/export')
      .query({ date_from: today, date_to: today, output_format: 'CSV' })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);

    const syncRequestId = 'e78f701a-2a1c-4e0c-8d95-9d65eab863b5';
    const syncPayload = {
      sync_request_id: syncRequestId,
      device_identifier: 'phase9-synthetic-offline-device',
      items: [
        {
          client_request_id: '6f0afbb1-ae5a-417c-a7fc-b33de969c068',
          operation: 'UPSERT_SELF_TASK',
          payload: {
            activity_date: today,
            activity_category_id: categoryId,
            title: 'Phase 9 offline replay task',
            description: 'Synthetic API replay test task.',
          },
        },
      ],
    };
    const firstReplay = await request(app.getHttpServer() as App)
      .post('/api/me/activities/sync')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(syncPayload)
      .expect(201);
    const replay = await request(app.getHttpServer() as App)
      .post('/api/me/activities/sync')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(syncPayload)
      .expect(201);
    expect(replay.body).toEqual(firstReplay.body);
    const replayEntries = await dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM daily_activity_entries entry
       JOIN daily_activity_reports report
         ON report.id = entry.daily_activity_report_id
       WHERE report.company_id = $1 AND report.employee_id = $2
         AND entry.title = 'Phase 9 offline replay task'`,
      [companyId, noActivityEmployeeId],
    );
    expect(Number(replayEntries[0].count)).toBe(1);
    const syncRequests = await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM field_mobile_sync_requests
       WHERE company_id = $1 AND employee_id = $2 AND sync_request_id = $3`,
      [companyId, noActivityEmployeeId, syncRequestId],
    );
    expect(Number(syncRequests[0].count)).toBe(1);
  });

  it('runs reminder and escalation jobs into the tenant action-item sink idempotently', async () => {
    const [policy] = await dataSource.query(
      `INSERT INTO activity_policies (
         company_id, daily_submission_required, submission_cutoff_time,
         submission_timezone, manager_review_due_hours, effective_from,
         priority, status, version
       ) VALUES ($1, true, '00:00', 'Africa/Dar_es_Salaam', 24, $2, 100,
                 'ACTIVE', 1)
       RETURNING id`,
      [companyId, today],
    );
    notificationPolicyId = Number(policy.id);

    const reminders = app.get(WorkActivityReminderService);
    await reminders.sendSubmissionReminders(companyId);
    await reminders.sendSubmissionReminders(companyId);
    const reminderRows = await dataSource.query(
      `SELECT COUNT(*)::int AS count, MIN(metadata->>'timezone') AS timezone
       FROM action_items
       WHERE company_id = $1 AND assignee_company_user_id = $2
         AND source_key = $3`,
      [
        companyId,
        employeeCompanyUserId,
        `daily-activity:missing:${noActivityEmployeeId}:${today}`,
      ],
    );
    expect(Number(reminderRows[0].count)).toBe(1);
    expect(reminderRows[0].timezone).toBe('Africa/Dar_es_Salaam');

    await reminders.sendReviewAndFollowUpReminders(companyId);
    await reminders.sendReviewAndFollowUpReminders(companyId);
    const escalationRows = await dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM action_items
       WHERE company_id = $1 AND assignee_company_user_id = $2
         AND source_key = $3`,
      [
        companyId,
        managerCompanyUserId,
        `daily-activity:overdue-review:${escalationReportId}`,
      ],
    );
    expect(Number(escalationRows[0].count)).toBe(1);
  });
});
