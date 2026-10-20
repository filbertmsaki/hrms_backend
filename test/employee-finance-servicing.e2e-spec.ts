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
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollRun,
} from '../src/modules/hr/payroll/entities/payroll-run.entities';
import {
  PayrollCalendar,
  PayrollPeriod,
} from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceApplicationDocument,
  EmployeeFinanceApplicationGuarantor,
  EmployeeFinanceSanctionLetter,
} from '../src/modules/hr/employee-finance/entities/employee-finance-application.entities';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceDefermentRequest,
  EmployeeFinanceDisbursement,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
  EmployeeFinanceRepayment,
  EmployeeFinanceRepaymentAllocation,
  EmployeeFinanceReschedule,
  EmployeeFinanceSettlementQuote,
} from '../src/modules/hr/employee-finance/entities/employee-finance-account.entities';
import {
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
} from '../src/modules/hr/employee-finance/entities/employee-finance-product.entities';
import {
  EmployeeFinanceAdjustment,
  EmployeeFinanceApprovalDelegation,
  EmployeeFinanceLetterTemplate,
} from '../src/modules/hr/employee-finance/entities/employee-finance-servicing.entities';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceAuditService,
  EmployeeFinanceDefermentService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinanceProductService,
  EmployeeFinanceReconciliationService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceRescheduleService,
  EmployeeFinanceSettlementService,
} from '../src/modules/hr/employee-finance/services/employee-finance-core.services';
import {
  EmployeeFinanceAccountStatusService,
  EmployeeFinanceDelegationService,
  EmployeeFinanceLetterTemplateService,
  EmployeeFinancePermissionDirectoryService,
} from '../src/modules/hr/employee-finance/services/employee-finance-policy.services';
import {
  EmployeeFinanceAdjustmentService,
  EmployeeFinanceEscalationService,
  EmployeeFinancePayrollOpsService,
} from '../src/modules/hr/employee-finance/services/employee-finance-workflow.services';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceAdjustmentTypeEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceDecisionEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceRequestStatusEnum,
} from '../src/modules/hr/employee-finance/employee-finance.enums';

class TestConfigService {
  private readonly values = new Map<string, unknown>([
    ['EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS', 1],
    ['EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION', true],
    ['EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL', true],
    ['EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL', true],
    ['EMPLOYEE_FINANCE_REQUIRE_DISTINCT_APPROVERS', true],
    ['EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY', 28],
    ['EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY', 35],
    ['EMPLOYEE_FINANCE_OVERDUE_GRACE_DAYS', 5],
    ['EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR', 2],
    ['EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS', 7],
    ['EMPLOYEE_FINANCE_APPROVAL_REMINDER_HOURS', 24],
    ['EMPLOYEE_FINANCE_APPROVAL_ESCALATION_HOURS', 48],
  ]);

  get<T>(key: string, defaultValue?: T): T {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

describe('Employee finance phases 1-4: routing, servicing, and payroll ops (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let company: Company;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const people: Record<
    string,
    { userId: number; membershipId: number; employeeId?: number }
  > = {};

  const notices: Array<{ kind: string; title: string }> = [];
  const notifier = {
    notifyEmployee: jest.fn(
      async (_c: number, _e: number, notice: { title: string }) => {
        notices.push({ kind: 'employee', title: notice.title });
        return [];
      },
    ),
    notifyStageApprovers: jest.fn(
      async (_a: unknown, stage: string, notice: { title: string }) => {
        notices.push({ kind: `stage:${stage}`, title: notice.title });
        return [];
      },
    ),
    notifyMemberships: jest.fn(
      async (_c: number, ids: number[], notice: { title: string }) => {
        notices.push({ kind: `members:${ids.length}`, title: notice.title });
        return ids;
      },
    ),
    approverMembershipIds: jest.fn(async () => [] as number[]),
  };

  const hrAccessService = {
    ensureActorCompanyId: jest.fn(
      (actor: AuthenticatedUser) => actor.companyId,
    ),
    assertCanAccessEmployee: jest.fn(),
    assertCompanyScopedActor: jest.fn(),
  } as unknown as HrAccessService;

  const configService = new TestConfigService() as unknown as ConfigService;

  const actorFor = (
    key: string,
    permissions: string[] = [],
  ): AuthenticatedUser => ({
    id: people[key].userId,
    email: `${key}.${suffix}@example.com`,
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyName: company.name,
    companyMembershipId: people[key].membershipId,
    employeeId: people[key].employeeId,
    permissions,
    roles: [],
  });

  let productService: EmployeeFinanceProductService;
  let applicationService: EmployeeFinanceApplicationService;
  let approvalService: EmployeeFinanceApprovalService;
  let disbursementService: EmployeeFinanceDisbursementService;
  let repaymentService: EmployeeFinanceRepaymentService;
  let settlementService: EmployeeFinanceSettlementService;
  let defermentService: EmployeeFinanceDefermentService;
  let rescheduleService: EmployeeFinanceRescheduleService;
  let reconciliationService: EmployeeFinanceReconciliationService;
  let accountStatusService: EmployeeFinanceAccountStatusService;
  let adjustmentService: EmployeeFinanceAdjustmentService;
  let escalationService: EmployeeFinanceEscalationService;
  let delegationService: EmployeeFinanceDelegationService;
  let payrollOpsService: EmployeeFinancePayrollOpsService;
  let templateService: EmployeeFinanceLetterTemplateService;
  let ledgerService: EmployeeFinanceLedgerService;
  let productId: number;
  let periodId: number;
  let calendarId: number;

  async function createPerson(
    key: string,
    withEmployee: boolean,
    managerEmployeeId?: number,
  ) {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `E${Object.keys(people).length}${suffix}`.slice(0, 20),
        first_name: key,
        last_name: 'Servicing',
        phone: `+255${Math.floor(Math.random() * 1e9)}`.slice(0, 20),
        email: `${key}.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    const membership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: company.id,
        user_id: user.id,
        status: 'active',
        is_default: true,
      }),
    );
    let employeeId: number | undefined;
    if (withEmployee) {
      const employee = await dataSource.getRepository(Employee).save(
        dataSource.getRepository(Employee).create({
          company_id: company.id,
          company_user_id: membership.id,
          employee_no: `EFS-${key}-${suffix}`.slice(0, 50),
          first_name: key,
          last_name: 'Servicing',
          gender: 'female',
          employment_status: EmploymentStatusEnum.ACTIVE,
          hire_date: '2024-01-01',
          reports_to: managerEmployeeId ?? null,
        }),
      );
      employeeId = employee.id;
    }
    people[key] = { userId: user.id, membershipId: membership.id, employeeId };
  }

  async function grantPermission(membershipId: number, name: string) {
    await dataSource.query(
      `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
       SELECT $1::varchar, $1::varchar, $1::text, 'company', true
       WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "name" = $1::varchar)`,
      [name],
    );
    await dataSource.query(
      `INSERT INTO "company_user_permissions" ("company_user_id", "permission_id")
       SELECT $1, "id" FROM "permissions" WHERE "name" = $2
       ON CONFLICT DO NOTHING`,
      [membershipId, name],
    );
  }

  async function expectReconciled(accountId: number) {
    const result = await reconciliationService.reconcile(
      actorFor('finance'),
      accountId,
    );
    expect('issues' in result ? result.issues : []).toEqual([]);
  }

  beforeAll(async () => {
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `Loan Servicing E2E ${suffix}`,
        slug: `loan-servicing-e2e-${suffix}`,
        status: 'active',
        metadata: { source: 'employee-finance-servicing-e2e' },
      }),
    );
    await createPerson('manager', true);
    await createPerson('employee', true, people.manager.employeeId);
    for (const key of ['hr', 'finance', 'checker', 'management', 'delegate']) {
      await createPerson(key, false);
    }
    await dataSource.getRepository(EmployeeCompensationVersion).save(
      dataSource.getRepository(EmployeeCompensationVersion).create({
        companyId: company.id,
        employeeId: people.employee.employeeId!,
        movementId: null,
        baseSalary: '2000000.00',
        currency: 'TZS',
        salaryStructureCode: null,
        payFrequency: 'MONTHLY',
        effectiveFrom: '2024-01-01',
        effectiveTo: null,
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        revisionReference: 'LOAN-SERVICING-E2E',
        justification: 'Compensation for loan servicing e2e',
        approvedByCompanyUserId: people.finance.membershipId,
        createdByCompanyUserId: people.finance.membershipId,
        payrollSyncStatus: 'READY',
      }),
    );
    const calendar = await dataSource.getRepository(PayrollCalendar).save(
      dataSource.getRepository(PayrollCalendar).create({
        companyId: company.id,
        code: `EFS-${suffix}`.slice(0, 80),
        name: 'Loan servicing calendar',
        frequency: 'MONTHLY',
        cutoffDay: 20,
        paymentDay: 28,
        timezone: 'Africa/Dar_es_Salaam',
      }),
    );
    calendarId = calendar.id;
    const period = await dataSource.getRepository(PayrollPeriod).save(
      dataSource.getRepository(PayrollPeriod).create({
        companyId: company.id,
        payrollCalendarId: calendar.id,
        periodCode: `EFS-${suffix}`.slice(0, 30),
        periodYear: 2100,
        periodMonth: 12,
        startDate: '2020-01-01',
        endDate: '2100-12-31',
        cutoffDate: '2100-12-20',
        paymentDate: '2100-12-28',
        status: 'OPEN',
      } as Partial<PayrollPeriod>),
    );
    periodId = period.id;

    const repo = <T extends object>(entity: new () => T) =>
      dataSource.getRepository(entity);
    const auditService = new EmployeeFinanceAuditService(
      hrAccessService,
      repo(EmployeeFinanceAuditLog),
    );
    const directory = new EmployeeFinancePermissionDirectoryService(dataSource);
    templateService = new EmployeeFinanceLetterTemplateService(
      repo(EmployeeFinanceLetterTemplate),
    );
    delegationService = new EmployeeFinanceDelegationService(
      directory,
      repo(EmployeeFinanceApprovalDelegation),
    );
    accountStatusService = new EmployeeFinanceAccountStatusService(
      configService,
      notifier as never,
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
      repo(EmployeeFinanceAdjustment),
    );
    productService = new EmployeeFinanceProductService(
      configService,
      hrAccessService,
      auditService,
      repo(EmployeeFinanceProduct),
      repo(EmployeeFinanceApplication),
    );
    const eligibilityService = new EmployeeFinanceEligibilityService(
      configService,
      hrAccessService,
      productService,
      repo(Employee),
      repo(EmployeeCompensationVersion),
      repo(EmployeePayrollResult),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceProductApplicability),
    );
    const interestService = new EmployeeFinanceInterestService();
    ledgerService = new EmployeeFinanceLedgerService(
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceLedgerEntry),
    );
    const accountService = new EmployeeFinanceAccountService(
      configService,
      hrAccessService,
      interestService,
      auditService,
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceApplication),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinanceLedgerEntry),
      repo(EmployeeFinanceDisbursement),
      repo(EmployeeFinanceRepayment),
      repo(EmployeeFinanceDefermentRequest),
      repo(EmployeeFinanceReschedule),
      repo(EmployeeFinanceSettlementQuote),
    );
    applicationService = new EmployeeFinanceApplicationService(
      configService,
      hrAccessService,
      productService,
      eligibilityService,
      accountService,
      auditService,
      repo(Employee),
      repo(EmployeeFinanceApplication),
      repo(EmployeeFinanceApplicationDocument),
      repo(EmployeeFinanceApplicationGuarantor),
      repo(EmployeeFinanceSanctionLetter),
      {} as never,
      notifier as never,
      templateService,
    );
    approvalService = new EmployeeFinanceApprovalService(
      configService,
      hrAccessService,
      auditService,
      {} as never,
      {
        enqueueSmsConfiguredNotification: jest
          .fn()
          .mockResolvedValue(undefined),
      } as never,
      repo(Employee),
      repo(EmployeeFinanceApplication),
      repo(EmployeeFinanceApplicationApproval),
      repo(EmployeeFinanceApplicationDocument),
      repo(EmployeeFinanceApplicationGuarantor),
      repo(EmployeeFinanceSanctionLetter),
      interestService,
      templateService,
      notifier as never,
      delegationService,
      directory,
    );
    disbursementService = new EmployeeFinanceDisbursementService(
      ledgerService,
      auditService,
      {} as never,
      {
        enqueueSmsConfiguredNotification: jest
          .fn()
          .mockResolvedValue(undefined),
      } as never,
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceApplication),
      repo(EmployeeFinanceDisbursement),
      notifier as never,
    );
    repaymentService = new EmployeeFinanceRepaymentService(
      ledgerService,
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinanceRepayment),
      repo(EmployeeFinanceRepaymentAllocation),
      repo(EmployeeFinanceSettlementQuote),
      auditService,
      accountStatusService,
    );
    settlementService = new EmployeeFinanceSettlementService(
      configService,
      ledgerService,
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceSettlementQuote),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinanceRepayment),
      auditService,
    );
    defermentService = new EmployeeFinanceDefermentService(
      configService,
      repo(EmployeeFinanceProduct),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinanceDefermentRequest),
      repo(EmployeeFinancePayrollInstruction),
      auditService,
      accountStatusService,
      notifier as never,
    );
    rescheduleService = new EmployeeFinanceRescheduleService(
      repo(EmployeeFinanceProduct),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceReschedule),
      configService,
      interestService,
      ledgerService,
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
      auditService,
      accountStatusService,
      notifier as never,
    );
    reconciliationService = new EmployeeFinanceReconciliationService(
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
      ledgerService,
      repo(EmployeeFinanceLedgerEntry),
      auditService,
    );
    adjustmentService = new EmployeeFinanceAdjustmentService(
      ledgerService,
      auditService,
      accountStatusService,
      notifier as never,
      repo(EmployeeFinanceAdjustment),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
    );
    escalationService = new EmployeeFinanceEscalationService(
      configService,
      notifier as never,
      directory,
      delegationService,
      auditService,
      repo(EmployeeFinanceApplication),
    );
    payrollOpsService = new EmployeeFinancePayrollOpsService(
      auditService,
      repaymentService,
      rescheduleService,
      repo(PayrollPeriod),
      repo(PayrollRun),
      repo(EmployeePayrollLineItem),
      repo(EmployeePayrollResult),
      repo(Employee),
      repo(EmployeeFinanceAccount),
      repo(EmployeeFinanceInstallment),
      repo(EmployeeFinancePayrollInstruction),
      repo(EmployeeFinanceLedgerEntry),
    );

    const product = await productService.create(actorFor('finance'), {
      product_type: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
      code: `SL-SERV-${suffix}`.slice(0, 40),
      name: 'Servicing staff loan',
      interest_method: EmployeeFinanceInterestMethodEnum.FLAT_RATE,
      annual_interest_rate: '12',
      processing_fee_method: 'FLAT',
      processing_fee_value: '10000',
      minimum_amount: '100000',
      maximum_amount: '1000000',
      maximum_term_months: 12,
      maximum_installment_percentage: '50',
      maximum_active_accounts: 1,
      allow_during_probation: true,
      effective_from: '2024-01-01',
      eligibility_configuration: {
        policy_configuration: { penalty: { method: 'FLAT', value: '5000' } },
      },
      approval_configuration: {
        approval_tiers: [
          {
            minimum_amount: '0',
            maximum_amount: '500000',
            stages: ['MANAGER', 'HR'],
          },
          {
            minimum_amount: '500000.01',
            stages: ['MANAGER', 'HR', 'FINANCE', 'MANAGEMENT'],
          },
        ],
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!company?.id) return;
    const companyId = company.id;
    for (const table of [
      'employee_finance_adjustments',
      'employee_finance_approval_delegations',
      'employee_finance_letter_templates',
      'employee_finance_repayment_allocations',
      'employee_finance_repayments',
      'employee_finance_settlement_quotes',
      'employee_finance_reschedules',
      'employee_finance_deferment_requests',
      'employee_finance_payroll_instructions',
      'employee_finance_ledger_entries',
      'employee_finance_installments',
      'employee_finance_disbursements',
      'employee_finance_accounts',
      'employee_finance_sanction_letters',
      'employee_finance_application_approvals',
      'employee_finance_applications',
      'employee_finance_products',
      'employee_finance_audit_logs',
      'employee_compensation_versions',
      'payroll_periods',
      'payroll_calendars',
    ]) {
      await dataSource.query(`DELETE FROM "${table}" WHERE "company_id" = $1`, [
        companyId,
      ]);
    }
    const memberships = Object.values(people).map(
      (person) => person.membershipId,
    );
    await dataSource.query(
      `DELETE FROM "company_user_permissions" WHERE "company_user_id" = ANY($1)`,
      [memberships],
    );
    await dataSource.query(`DELETE FROM "employees" WHERE "company_id" = $1`, [
      companyId,
    ]);
    await dataSource.query(
      `DELETE FROM "company_users" WHERE "company_id" = $1`,
      [companyId],
    );
    await dataSource.query(`DELETE FROM "users" WHERE "id" = ANY($1)`, [
      Object.values(people).map((person) => person.userId),
    ]);
    await dataSource.query(`DELETE FROM "companies" WHERE "id" = $1`, [
      companyId,
    ]);
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('finds only active same-company guarantor candidates and excludes the applicant', async () => {
    const candidates = await applicationService.searchGuarantorCandidates(
      actorFor('employee'),
      `EFS-manager-${suffix}`,
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      people.manager.employeeId,
    ]);
    await expect(
      applicationService.searchGuarantorCandidates(actorFor('employee'), 'x'),
    ).rejects.toThrow('at least two characters');
  });

  it('routes by amount, returns for correction, and issues a sanction letter on the corrected cycle', async () => {
    await templateService.upsert(actorFor('hr'), {
      letterhead: 'Loan Servicing E2E Ltd',
      body: 'Dear {{employee_name}}, {{approved_amount}} over {{term_months}} months at {{monthly_installment}} per month.',
      signatory_name: 'Head of HR',
      signatory_title: 'Human Resources',
    });
    const application = await applicationService.createMine(
      actorFor('employee'),
      {
        product_id: productId,
        requested_amount: '600000',
        requested_term_months: 6,
        purpose: 'School fees',
      },
    );
    const submitted = await applicationService.submitMine(
      actorFor('employee'),
      application.id,
    );
    expect(submitted.approvalRoute).toEqual([
      'MANAGER',
      'HR',
      'FINANCE',
      'MANAGEMENT',
    ]);
    expect(submitted.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
    );

    await expect(
      productService.update(actorFor('finance'), productId, {
        product_type: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
        code: 'X',
        name: 'X',
        minimum_amount: '1',
        maximum_term_months: 1,
        effective_from: '2024-01-01',
      }),
    ).rejects.toThrow('immutable');

    await approvalService.approve(actorFor('manager'), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.MANAGER,
      snapshot_hash: submitted.eligibilitySnapshotHash,
    });
    await expect(
      approvalService.decide(actorFor('hr'), application.id, {
        stage: EmployeeFinanceApprovalStageEnum.HR,
        decision: EmployeeFinanceDecisionEnum.RETURNED,
        comments: 'Reduce to 400,000',
      }),
    ).rejects.toThrow('permission');
    const returned = await approvalService.decide(
      actorFor('hr', ['employee_finance:applications:hr-approve']),
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.HR,
        decision: EmployeeFinanceDecisionEnum.RETURNED,
        comments: 'Reduce to 400,000',
      },
    );
    expect(returned.status).toBe(
      EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
    );

    const corrected = await applicationService.updateMine(
      actorFor('employee'),
      application.id,
      {
        requested_amount: '400000',
      },
    );
    const resubmitted = await applicationService.submitMine(
      actorFor('employee'),
      corrected.id,
    );
    expect(resubmitted.approvalCycle).toBe(2);
    expect(resubmitted.approvalRoute).toEqual(['MANAGER', 'HR']);

    await approvalService.approve(actorFor('manager'), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.MANAGER,
      snapshot_hash: resubmitted.eligibilitySnapshotHash,
    });
    const approved = await approvalService.approve(
      actorFor('hr'),
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.HR,
        snapshot_hash: resubmitted.eligibilitySnapshotHash,
      },
    );
    expect(approved.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
    );

    const letter = await applicationService.getSanctionLetter(
      actorFor('employee'),
      application.id,
    );
    expect(letter?.content).toContain('400,000.00 over 6 months');
    expect(letter?.templateId).not.toBeNull();
    const pdf = await applicationService.getSanctionLetterPdf(
      actorFor('employee'),
      application.id,
    );
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');

    const history = await approvalService.listApprovals(
      actorFor('hr'),
      application.id,
    );
    expect(
      history.approvals.map(
        (item) => `${item.approvalCycle}:${item.stage}:${item.decision}`,
      ),
    ).toEqual([
      '1:MANAGER:RECOMMENDED',
      '1:HR:RETURNED',
      '2:MANAGER:RECOMMENDED',
      '2:HR:APPROVED',
    ]);
  });

  it('services the loan: accrual, overdue + penalty, repayment, deferment, waiver, reschedule, and early settlement stay reconciled', async () => {
    const application = await dataSource
      .getRepository(EmployeeFinanceApplication)
      .findOneOrFail({
        where: {
          companyId: company.id,
          employeeId: people.employee.employeeId,
        },
        order: { id: 'DESC' },
      });
    const account = await applicationService.acceptMine(
      actorFor('employee'),
      application.id,
    );
    const letter = await applicationService.getSanctionLetter(
      actorFor('employee'),
      application.id,
    );
    expect(letter?.acceptedAt).toBeTruthy();
    // 400,000 flat 12% over 6 months = 24,000 interest; 10,000 fee on instalment 1.
    expect(account.interestAmount).toBe('24000.00');
    expect(account.feeAmount).toBe('10000.00');
    expect(account.totalPayable).toBe('434000.00');

    await expect(
      disbursementService.create(actorFor('finance'), {
        account_id: account.id,
        amount: '1000',
        payment_reference: `BANK-${suffix}`,
        payment_date: today(),
      }),
    ).rejects.toThrow('full approved principal');
    const disbursement = await disbursementService.create(actorFor('finance'), {
      account_id: account.id,
      amount: '400000.00',
      payment_reference: `BANK-${suffix}`,
      payment_date: today(),
    });
    await disbursementService.approve(actorFor('checker'), disbursement.id);
    await expect(
      disbursementService.approve(actorFor('checker'), disbursement.id),
    ).rejects.toThrow('awaiting approval');
    await disbursementService.confirm(actorFor('finance'), disbursement.id);
    let balance = await ledgerService.calculateBalance(company.id, account.id);
    expect(balance).toEqual({
      principal: '400000.00',
      interest: '24000.00',
      fees: '10000.00',
      total: '434000.00',
    });
    await expectReconciled(account.id);

    // Overdue: push instalment 1 into the past and run the sweep.
    const installments = dataSource.getRepository(EmployeeFinanceInstallment);
    const first = await installments.findOneOrFail({
      where: {
        accountId: account.id,
        installmentNumber: 1,
        scheduleVersion: 1,
      },
    });
    await installments.update({ id: first.id }, { dueDate: '2025-01-28' });
    const sweep = await accountStatusService.markOverdue(company.id);
    expect(sweep.marked_overdue).toBe(1);
    expect(sweep.penalties_raised).toBe(1);
    expect(
      (
        await dataSource
          .getRepository(EmployeeFinanceAccount)
          .findOneByOrFail({ id: account.id })
      ).status,
    ).toBe(EmployeeFinanceAccountStatusEnum.IN_ARREARS);
    const [penalty] = await adjustmentService.list(actorFor('finance'), {
      account_id: account.id,
    });
    expect(penalty.adjustmentType).toBe(
      EmployeeFinanceAdjustmentTypeEnum.PENALTY,
    );
    await adjustmentService.decide(actorFor('checker'), penalty.id, {
      decision: EmployeeFinanceRequestStatusEnum.APPROVED,
    });
    await expectReconciled(account.id);

    // Pay instalment 1 (principal 66,666.66 + interest 4,000 + fee 10,000 + penalty 5,000).
    const owed = await installments.findOneByOrFail({ id: first.id });
    const repayment = await repaymentService.create(actorFor('finance'), {
      account_id: account.id,
      amount: owed.totalDue,
      payment_reference: `REPAY-${suffix}`,
      payment_date: today(),
    });
    await expect(
      repaymentService.approve(actorFor('finance'), repayment.id),
    ).rejects.toThrow('maker');
    await repaymentService.approve(actorFor('checker'), repayment.id);
    await expect(
      repaymentService.approve(actorFor('checker'), repayment.id),
    ).rejects.toThrow('already posted');
    expect((await installments.findOneByOrFail({ id: first.id })).status).toBe(
      EmployeeFinanceInstallmentStatusEnum.PAID,
    );
    expect(
      (
        await dataSource
          .getRepository(EmployeeFinanceAccount)
          .findOneByOrFail({ id: account.id })
      ).status,
    ).toBe(EmployeeFinanceAccountStatusEnum.ACTIVE);
    await expectReconciled(account.id);

    // Defer instalment 2 to after the last instalment.
    const second = await installments.findOneOrFail({
      where: {
        accountId: account.id,
        installmentNumber: 2,
        scheduleVersion: 1,
      },
    });
    const deferment = await defermentService.request(
      actorFor('employee'),
      account.id,
      { installment_id: second.id, reason: 'Medical expenses this month' },
      { selfService: true },
    );
    expect(deferment.status).toBe(EmployeeFinanceRequestStatusEnum.PENDING);
    const decided = await defermentService.decide(
      actorFor('checker'),
      deferment.id,
      {
        decision: EmployeeFinanceRequestStatusEnum.APPROVED,
      },
    );
    const last = await installments.findOneOrFail({
      where: {
        accountId: account.id,
        installmentNumber: 6,
        scheduleVersion: 1,
      },
    });
    expect(decided.newDueDate! > last.dueDate).toBe(true);
    await expectReconciled(account.id);

    // Waive 1,000 of interest.
    const waiver = await adjustmentService.create(
      actorFor('finance'),
      account.id,
      {
        adjustment_type: EmployeeFinanceAdjustmentTypeEnum.INTEREST_WAIVER,
        amount: '1000',
        reason: 'Goodwill waiver',
      },
    );
    await adjustmentService.decide(actorFor('checker'), waiver.id, {
      decision: EmployeeFinanceRequestStatusEnum.APPROVED,
    });
    await expectReconciled(account.id);

    // Reschedule the remainder over 3 months.
    const reschedule = await rescheduleService.request(
      actorFor('finance'),
      account.id,
      {
        new_term_months: 3,
        reason: 'Employee requested shorter term',
      },
    );
    expect(reschedule.status).toBe(EmployeeFinanceRequestStatusEnum.PENDING);
    await expect(
      rescheduleService.decide(actorFor('finance'), reschedule.id, {
        decision: EmployeeFinanceRequestStatusEnum.APPROVED,
      }),
    ).rejects.toThrow('cannot approve');
    await rescheduleService.decide(actorFor('checker'), reschedule.id, {
      decision: EmployeeFinanceRequestStatusEnum.APPROVED,
    });
    const restructured = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .findOneByOrFail({ id: account.id });
    expect(restructured.scheduleVersion).toBe(2);
    expect(restructured.status).toBe(
      EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
    );
    expect(
      await installments.count({
        where: { accountId: account.id, scheduleVersion: 2 },
      }),
    ).toBe(3);
    await expectReconciled(account.id);

    // Payroll preview sees the new schedule.
    const preview = await payrollOpsService.preview(
      actorFor('finance'),
      periodId,
    );
    expect(preview.totals.installment_count).toBeGreaterThan(0);

    // Early settlement: quote, record payment, approve, account closes.
    const quote = await settlementService.quote(
      actorFor('finance'),
      account.id,
    );
    balance = await ledgerService.calculateBalance(company.id, account.id);
    expect(Number(quote.settlementAmount)).toBeLessThanOrEqual(
      Number(balance.total),
    );
    const { repayment: payoff } = await settlementService.settle(
      actorFor('finance'),
      quote.id,
      {
        payment_reference: `PAYOFF-${suffix}`,
        payment_date: today(),
      },
    );
    await repaymentService.approve(actorFor('checker'), payoff.id);
    const closed = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .findOneByOrFail({ id: account.id });
    expect(closed.status).toBe(EmployeeFinanceAccountStatusEnum.SETTLED);
    expect(
      (await ledgerService.calculateBalance(company.id, account.id)).total,
    ).toBe('0.00');
    await expectReconciled(account.id);
  });

  it('delegates, escalates, and writes off', async () => {
    await grantPermission(
      people.manager.membershipId,
      'employee_finance:applications:manager-review',
    );
    await delegationService.create(
      actorFor('manager', ['employee_finance:applications:manager-review']),
      {
        delegate_company_user_id: people.delegate.membershipId,
        stages: ['MANAGER'],
        starts_on: today(),
        ends_on: today(),
        reason: 'On leave',
      },
    );
    const application = await applicationService.createMine(
      actorFor('employee'),
      {
        product_id: productId,
        requested_amount: '200000',
        requested_term_months: 4,
        purpose: 'Rent',
      },
    );
    const submitted = await applicationService.submitMine(
      actorFor('employee'),
      application.id,
    );

    // Waiting three days escalates twice and reminds once.
    await dataSource
      .getRepository(EmployeeFinanceApplication)
      .update(
        { id: application.id },
        { stageEnteredAt: new Date(Date.now() - 100 * 3_600_000) },
      );
    const sweep = await escalationService.sweep(new Date(), company.id);
    expect(sweep.escalated).toBe(1);
    expect(
      (
        await dataSource
          .getRepository(EmployeeFinanceApplication)
          .findOneByOrFail({ id: application.id })
      ).escalationLevel,
    ).toBe(2);

    const recommended = await approvalService.delegatedDecision(
      actorFor('delegate'),
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.MANAGER,
        decision: EmployeeFinanceDecisionEnum.APPROVED,
        snapshot_hash: submitted.eligibilitySnapshotHash,
      },
    );
    expect(recommended.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
    );
    const history = await approvalService.listApprovals(
      actorFor('hr'),
      application.id,
    );
    expect(history.approvals[0].onBehalfOfCompanyUserId).toBe(
      people.manager.membershipId,
    );
    await approvalService.approve(actorFor('hr'), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.HR,
      snapshot_hash: submitted.eligibilitySnapshotHash,
    });
    const account = await applicationService.acceptMine(
      actorFor('employee'),
      application.id,
    );
    const disbursement = await disbursementService.create(actorFor('finance'), {
      account_id: account.id,
      amount: '200000.00',
      payment_reference: `BANK2-${suffix}`,
      payment_date: today(),
    });
    await disbursementService.approve(actorFor('checker'), disbursement.id);
    await disbursementService.confirm(actorFor('finance'), disbursement.id);

    const writeOff = await adjustmentService.create(
      actorFor('finance'),
      account.id,
      {
        adjustment_type: EmployeeFinanceAdjustmentTypeEnum.WRITE_OFF,
        reason: 'Uncollectable after exit',
      },
    );
    await adjustmentService.decide(actorFor('checker'), writeOff.id, {
      decision: EmployeeFinanceRequestStatusEnum.APPROVED,
    });
    const writtenOff = await dataSource
      .getRepository(EmployeeFinanceAccount)
      .findOneByOrFail({ id: account.id });
    expect(writtenOff.status).toBe(
      EmployeeFinanceAccountStatusEnum.WRITTEN_OFF,
    );
    expect(
      (await ledgerService.calculateBalance(company.id, account.id)).total,
    ).toBe('0.00');
    await expectReconciled(account.id);
    expect(calendarId).toBeGreaterThan(0);
  });
});
