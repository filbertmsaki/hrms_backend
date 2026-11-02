process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import './setup-e2e';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import { FieldParty } from '../src/modules/hr/work-activities/entities/activity-config.entities';
import {
  FieldOpportunity,
  FieldVisit,
  FieldVisitEvidence,
  FieldVisitExpense,
  FieldVisitLocationEvent,
  FieldVisitPlan,
  FieldVisitPlanItem,
  FieldFollowUp,
  FieldVisitCommercialPolicy,
} from '../src/modules/hr/work-activities/entities/field-visit.entities';
import {
  FieldLocationAccessLog,
  WorkActivityAuditLog,
  WorkActivityException,
} from '../src/modules/hr/work-activities/entities/analytics.entities';
import { DailyActivityReport } from '../src/modules/hr/work-activities/entities/daily-activity.entities';
import { AttendanceBusinessTrip } from '../src/modules/hr/attendance/processing/entities/attendance-business-trip.entity';
import { ActivityPolicyService } from '../src/modules/hr/work-activities/services/activity-policy.service';
import { WorkActivityAuditService } from '../src/modules/hr/work-activities/services/work-activity-audit.service';
import { WorkActivityExceptionService } from '../src/modules/hr/work-activities/services/work-activity-exception.service';
import { FieldVisitService } from '../src/modules/hr/work-activities/services/field-visit.service';
import { WorkActivityInsightsService } from '../src/modules/hr/work-activities/services/work-activity-insights.service';
import { WorkActivityKpiProviderService } from '../src/modules/hr/work-activities/services/work-activity-kpi-provider.service';
import { ActionItemsService } from '../src/modules/hr/action-inbox/action-items.service';
import { FieldOpportunityTypeEnum } from '../src/modules/hr/work-activities/enums/work-activity.enums';

describe('Field visit opportunity commercial values (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let company: Company;
  let employee: Employee;
  let user: User;
  let membership: CompanyUser;
  let visit: FieldVisit;
  let service: FieldVisitService;
  let insights: WorkActivityInsightsService;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const actor = (): AuthenticatedUser => ({
    id: user.id,
    email: user.email,
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyName: company.name,
    companyMembershipId: membership.id,
    employeeId: employee.id,
    permissions: [],
    roles: [],
  });

  beforeAll(async () => {
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `Field Visits ${suffix}`,
        slug: `field-visits-${suffix}`,
        status: 'active',
        metadata: { source: 'field-visit-commercial-e2e' },
      }),
    );
    user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FV${suffix}`.slice(0, 20),
        first_name: 'Field',
        last_name: 'Seller',
        phone: `+255${suffix}`.slice(0, 20),
        email: `field.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: company.id,
        user_id: user.id,
        status: 'active',
        is_default: true,
      }),
    );
    employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: company.id,
        company_user_id: membership.id,
        employee_no: `FV-${suffix}`.slice(0, 50),
        first_name: 'Field',
        last_name: 'Seller',
        gender: 'male',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2023-01-01',
      }),
    );

    const hrAccess = {
      ensureActorCompanyId: jest.fn(
        (current: AuthenticatedUser) => current.companyId,
      ),
      getAccessibleEmployeeSqlScope: jest.fn(async () => ({
        companyWide: true,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: null,
      })),
      getAccessibleEmployeeIds: jest.fn(async () => [employee.id]),
    } as unknown as HrAccessService;
    const policy = {
      resolveForEmployee: jest.fn(async () => ({
        allowUnplannedVisits: true,
        fieldVisitPlanRequired: false,
        requireDeviceBinding: false,
      })),
    } as unknown as ActivityPolicyService;
    const config = {
      get: (_key: string, fallback?: unknown) => fallback,
    } as unknown as ConfigService;
    const repo = <T extends object>(entity: new () => T) =>
      dataSource.getRepository(entity);
    const audit = new WorkActivityAuditService(repo(WorkActivityAuditLog));
    insights = new WorkActivityInsightsService(
      hrAccess,
      {} as WorkActivityKpiProviderService,
      repo(DailyActivityReport),
      repo(FieldVisit),
      repo(FieldVisitPlanItem),
      repo(FieldOpportunity),
      repo(FieldVisitCommercialPolicy),
      repo(FieldFollowUp),
      repo(WorkActivityException),
    );
    service = new FieldVisitService(
      dataSource,
      config,
      hrAccess,
      {} as ActionItemsService,
      policy,
      audit,
      {
        reconcileForEmployeeDate: jest.fn(),
      } as unknown as WorkActivityExceptionService,
      repo(Employee),
      repo(FieldParty),
      repo(FieldVisitPlan),
      repo(FieldVisitPlanItem),
      repo(FieldVisit),
      repo(FieldVisitLocationEvent),
      repo(FieldVisitEvidence),
      repo(FieldOpportunity),
      repo(FieldFollowUp),
      repo(FieldVisitExpense),
      repo(FieldLocationAccessLog),
      repo(AttendanceBusinessTrip),
      repo(FieldVisitCommercialPolicy),
    );
    visit = (await service.createUnplannedVisit(actor(), {
      visit_date: new Date().toISOString().slice(0, 10),
      visit_type: 'CUSTOMER_VISIT' as never,
      purpose: 'Commercial field visit',
      unplanned_reason: 'Customer requested meeting',
    })) as FieldVisit;
  });

  afterAll(async () => {
    if (company?.id) {
      for (const table of [
        'field_visit_location_events',
        'field_visit_evidence',
        'field_opportunities',
        'field_visit_commercial_policies',
        'work_activity_audit_logs',
        'field_visit_expenses',
        'field_follow_ups',
        'field_visits',
        'field_visit_plan_items',
        'field_visit_plans',
      ]) {
        await dataSource.query(
          `DELETE FROM "${table}" WHERE "company_id" = $1`,
          [company.id],
        );
      }
      if (employee?.id)
        await dataSource.query('DELETE FROM "employees" WHERE "id" = $1', [
          employee.id,
        ]);
      if (membership?.id)
        await dataSource.query('DELETE FROM "company_users" WHERE "id" = $1', [
          membership.id,
        ]);
      if (user?.id)
        await dataSource.query('DELETE FROM "users" WHERE "id" = $1', [
          user.id,
        ]);
      await dataSource.query('DELETE FROM "companies" WHERE "id" = $1', [
        company.id,
      ]);
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('persists separate potential sales and premium values, and returns them in the visit', async () => {
    const response = await service.addOpportunity(actor(), visit.id, {
      client_request_id: '00000000-0000-4000-8000-000000000481',
      opportunity_type: FieldOpportunityTypeEnum.NEW_BUSINESS,
      title: 'Regional fleet policy',
      potential_value: 4500000,
      currency: 'TZS',
      premium_value: 275000,
      premium_currency: 'tzs',
    });
    const persisted = await dataSource
      .getRepository(FieldOpportunity)
      .findOneByOrFail({ fieldVisitId: visit.id });
    expect(persisted.potentialValue).toBe('4500000.00');
    expect(persisted.currency).toBe('TZS');
    expect(persisted.premiumValue).toBe('275000.00');
    expect(persisted.premiumCurrency).toBe('TZS');
    expect(persisted.actualValue).toBeNull();
    expect(persisted.status).toBe('IDENTIFIED');
    expect(response.opportunities.map(({ id }) => id)).toContain(persisted.id);
    const retry = await service.addOpportunity(actor(), visit.id, {
      client_request_id: '00000000-0000-4000-8000-000000000481',
      opportunity_type: FieldOpportunityTypeEnum.NEW_BUSINESS,
      title: 'Regional fleet policy',
      potential_value: 4500000,
      currency: 'TZS',
      premium_value: 275000,
      premium_currency: 'TZS',
    });
    expect(
      retry.opportunities.filter(({ id }) => id === persisted.id),
    ).toHaveLength(1);
    expect(
      await dataSource
        .getRepository(FieldOpportunity)
        .countBy({ fieldVisitId: visit.id }),
    ).toBe(1);
  });

  it('enforces company currencies and persists manager-owned actual values and opportunity stages', async () => {
    await service.upsertCommercialPolicy(actor(), {
      default_currency: 'USD',
      supported_currencies: ['USD', 'TZS'],
    });
    const response = await service.addOpportunity(actor(), visit.id, {
      opportunity_type: FieldOpportunityTypeEnum.LEAD,
      title: 'Cross-border account',
      potential_value: 1250,
    });
    const opportunity = response.opportunities.find(
      ({ title }) => title === 'Cross-border account',
    );
    expect(opportunity?.currency).toBe('USD');
    await expect(
      service.addOpportunity(actor(), visit.id, {
        opportunity_type: FieldOpportunityTypeEnum.LEAD,
        title: 'Unsupported currency',
        potential_value: 200,
        currency: 'EUR',
      }),
    ).rejects.toThrow(
      'Sales currency must be one of the currencies configured for this company',
    );
    await expect(
      service.updateOpportunityCommercial(actor(), opportunity!.id, {
        status: 'WON' as never,
        reason: 'Won without realized value',
      }),
    ).rejects.toThrow('A realized sales value is required');

    await service.updateOpportunityCommercial(actor(), opportunity!.id, {
      actual_value: 1000,
      status: 'WON' as never,
      reason: 'Confirmed customer contract',
    });
    const persisted = await dataSource
      .getRepository(FieldOpportunity)
      .findOneByOrFail({ id: opportunity!.id });
    expect(persisted.actualValue).toBe('1000.00');
    expect(persisted.status).toBe('WON');
    expect(persisted.validatedByManager).toBe(true);
    await expect(
      service.updateOpportunityCommercial(actor(), opportunity!.id, {
        status: 'FOLLOW_UP' as never,
        reason: 'Attempt to reopen a terminal stage',
      }),
    ).rejects.toThrow('Terminal stages cannot be changed');

    const summary = await insights.getCommercialSummary(actor());
    const usd = summary.sales_by_currency.find((row) => row.currency === 'USD');
    expect(usd?.potential_value).toBe('1250.00');
    expect(usd?.validated_actual_value).toBe('1000.00');
    expect(summary.premium_by_currency).toEqual([
      expect.objectContaining({ currency: 'TZS', premium_value: '275000.00' }),
    ]);
    expect(summary.opportunity_status_counts).toContainEqual({
      status: 'WON',
      opportunity_count: 1,
    });

    const auditEntries = await dataSource
      .getRepository(WorkActivityAuditLog)
      .find({
        where: {
          companyId: company.id,
          entityType: 'FIELD_OPPORTUNITY',
          entityId: String(opportunity!.id),
        },
      });
    expect(
      auditEntries.some(
        (entry) =>
          entry.action === 'FIELD_VISIT_OPPORTUNITY_COMMERCIAL_UPDATED',
      ),
    ).toBe(true);

    await service.upsertCommercialPolicy(actor(), {
      default_currency: 'USD',
      supported_currencies: ['USD', 'TZS'],
      allow_employee_opportunity_values: false,
    });
    await expect(
      service.addOpportunity(actor(), visit.id, {
        opportunity_type: FieldOpportunityTypeEnum.LEAD,
        title: 'Policy-disabled opportunity',
      }),
    ).rejects.toThrow('disabled by company policy');
  });
});
