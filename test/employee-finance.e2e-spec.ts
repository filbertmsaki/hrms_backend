process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import './setup-e2e';
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { SeederFactoryManager } from 'typeorm-extension';
import { AppDataSource } from '../src/database/data-source';
import PayrollBaselineSeeder from '../src/database/seeds/038-payroll-baseline.seed';
import EmployeeFinanceProductsSeeder from '../src/database/seeds/039-employee-finance-products.seed';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from '../src/database/seeds/company-structure.constants';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmployeeBankAccount } from '../src/modules/hr/employees/entities/employee-bank-account.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import {
  PayrollCalendar,
  PayrollPeriod,
} from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollAuditLog,
  PayrollInput,
  PayrollRun,
  PayrollRunApproval,
} from '../src/modules/hr/payroll/entities/payroll-run.entities';
import { EmployeePayrollProfile } from '../src/modules/hr/payroll/entities/employee-payroll-profile.entity';
import {
  EmployeePayrollProfileService,
  EmployeePayrollCalculationService,
  PayrollAuditService,
  PayrollConfigurationService,
  PayrollInputService,
  PayrollProrationService,
  PayrollRunService,
  ProgressiveTaxService,
  StatutoryCalculationService,
} from '../src/modules/hr/payroll/services/payroll-core.services';
import { PayrollApprovalStageEnum, PayrollRunStatusEnum } from '../src/modules/hr/payroll/payroll.enums';
import { EmployeeCompensationVersion } from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import { EmployeeCompensationVersionStatusEnum } from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import { AttendanceDailySummary } from '../src/modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../src/modules/hr/leave/entities/leave-request.entity';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceApplicationDocument,
} from '../src/modules/hr/employee-finance/entities/employee-finance-application.entities';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceDisbursement,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
} from '../src/modules/hr/employee-finance/entities/employee-finance-account.entities';
import {
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
} from '../src/modules/hr/employee-finance/entities/employee-finance-product.entities';
import {
  EmployeeFinanceAuditService,
  EmployeeFinanceProductService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceDisbursementService,
  EmployeeFinancePayrollInstructionService,
} from '../src/modules/hr/employee-finance/services/employee-finance-core.services';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceDisbursementStatusEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
  EmployeeFinancePayrollInstructionStatusEnum,
} from '../src/modules/hr/employee-finance/employee-finance.enums';

class TestConfigService {
  private readonly values = new Map<string, unknown>([
    ['PAYROLL_DEFAULT_CUTOFF_DAY', 20],
    ['PAYROLL_DEFAULT_PAYMENT_DAY', 28],
    ['PAYROLL_DEFAULT_TIMEZONE', 'Africa/Dar_es_Salaam'],
    ['PAYROLL_DEFAULT_CURRENCY', 'TZS'],
    ['PAYROLL_DEFAULT_PRORATION_METHOD', 'CALENDAR_DAYS'],
    ['PAYROLL_ALLOW_NEGATIVE_NET_PAY', false],
    ['PAYROLL_REQUIRE_HR_APPROVAL', true],
    ['PAYROLL_REQUIRE_FINANCE_APPROVAL', false],
    ['PAYROLL_REQUIRE_MANAGEMENT_APPROVAL', false],
    ['PAYROLL_REQUIRE_MAKER_CHECKER', false],
    ['EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS', 1],
    ['EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION', true],
    ['EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL', true],
    ['EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL', true],
    ['EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY', 28],
    ['EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY', 35],
  ]);

  get<T>(key: string, defaultValue?: T): T {
    if (this.values.has(key)) {
      return this.values.get(key) as T;
    }
    return defaultValue as T;
  }
}

describe('Employee finance apply -> approve -> disburse -> payroll flow (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let company: Company;
  let createdCompany = false;

  let adminUserId: number;
  let adminCompanyUserId: number;
  let financeUserId: number;
  let financeCompanyUserId: number;
  let employeeUserId: number;
  let employeeCompanyUserId: number;
  let employeeId: number;
  let bankAccountId: number;
  let compensationId: number;
  let profileId: number;
  let calendarId: number;
  let periodId: number;
  let runId: number;
  let applicationId: number;
  let accountId: number;
  let disbursementId: number;

  let payrollPeriodRepository: Repository<PayrollPeriod>;
  let payrollRunRepository: Repository<PayrollRun>;
  let payrollInputRepository: Repository<PayrollInput>;
  let payrollResultRepository: Repository<EmployeePayrollResult>;
  let payrollLineItemRepository: Repository<EmployeePayrollLineItem>;

  let financeProductRepository: Repository<EmployeeFinanceProduct>;
  let financeApplicationRepository: Repository<EmployeeFinanceApplication>;
  let financeApprovalRepository: Repository<EmployeeFinanceApplicationApproval>;
  let financeAccountRepository: Repository<EmployeeFinanceAccount>;
  let financeInstallmentRepository: Repository<EmployeeFinanceInstallment>;
  let financeDisbursementRepository: Repository<EmployeeFinanceDisbursement>;
  let financeLedgerRepository: Repository<EmployeeFinanceLedgerEntry>;
  let financeInstructionRepository: Repository<EmployeeFinancePayrollInstruction>;

  let configurationService: PayrollConfigurationService;
  let inputService: PayrollInputService;
  let runService: PayrollRunService;

  let applicationService: EmployeeFinanceApplicationService;
  let approvalService: EmployeeFinanceApprovalService;
  let accountService: EmployeeFinanceAccountService;
  let disbursementService: EmployeeFinanceDisbursementService;
  let payrollInstructionService: EmployeeFinancePayrollInstructionService;

  const hrAccessService = {
    ensureActorCompanyId: jest.fn((actor: AuthenticatedUser) => actor.companyId),
    assertCanAccessEmployee: jest.fn(),
    assertCompanyScopedActor: jest.fn(),
  } as unknown as HrAccessService;

  const configService = new TestConfigService() as unknown as ConfigService;

  const adminActor = (): AuthenticatedUser => ({
    id: adminUserId,
    email: 'finance.admin@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: adminCompanyUserId,
    permissions: [],
    roles: [],
  });

  const financeActor = (): AuthenticatedUser => ({
    id: financeUserId,
    email: 'finance.officer@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: financeCompanyUserId,
    permissions: [],
    roles: [],
  });

  const employeeActor = (): AuthenticatedUser => ({
    id: employeeUserId,
    email: 'finance.employee@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: employeeCompanyUserId,
    employeeId,
    permissions: [],
    roles: [],
  });

  beforeAll(async () => {
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();

    const existingCompany = await dataSource.getRepository(Company).findOne({
      where: { slug: ALLIANCE_COMPANY_SLUG },
    });
    company =
      existingCompany ??
      (await dataSource.getRepository(Company).save(
        dataSource.getRepository(Company).create({
          name: ALLIANCE_COMPANY_NAME,
          slug: ALLIANCE_COMPANY_SLUG,
          status: 'active',
          metadata: { source: 'employee-finance-e2e' },
        }),
      ));
    createdCompany = !existingCompany;

    await new PayrollBaselineSeeder().run(dataSource, {} as SeederFactoryManager);
    await new EmployeeFinanceProductsSeeder().run(dataSource, {} as SeederFactoryManager);

    payrollPeriodRepository = dataSource.getRepository(PayrollPeriod);
    payrollRunRepository = dataSource.getRepository(PayrollRun);
    payrollInputRepository = dataSource.getRepository(PayrollInput);
    payrollResultRepository = dataSource.getRepository(EmployeePayrollResult);
    payrollLineItemRepository = dataSource.getRepository(EmployeePayrollLineItem);

    financeProductRepository = dataSource.getRepository(EmployeeFinanceProduct);
    financeApplicationRepository = dataSource.getRepository(EmployeeFinanceApplication);
    financeApprovalRepository = dataSource.getRepository(EmployeeFinanceApplicationApproval);
    financeAccountRepository = dataSource.getRepository(EmployeeFinanceAccount);
    financeInstallmentRepository = dataSource.getRepository(EmployeeFinanceInstallment);
    financeDisbursementRepository = dataSource.getRepository(EmployeeFinanceDisbursement);
    financeLedgerRepository = dataSource.getRepository(EmployeeFinanceLedgerEntry);
    financeInstructionRepository = dataSource.getRepository(EmployeeFinancePayrollInstruction);

    const auditService = new PayrollAuditService(
      dataSource.getRepository(PayrollAuditLog),
      hrAccessService,
    );
    const profileService = new EmployeePayrollProfileService(
      hrAccessService,
      auditService,
      dataSource.getRepository(EmployeePayrollProfile),
      dataSource.getRepository(Employee),
      dataSource.getRepository(EmployeeBankAccount),
    );
    (globalThis as { __profileService?: EmployeePayrollProfileService }).__profileService = profileService;

    configurationService = new PayrollConfigurationService(
      configService,
      hrAccessService,
      auditService,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities').PayrollComponent,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities').SalaryStructure,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .SalaryStructureComponent,
      ),
      dataSource.getRepository(PayrollCalendar),
      payrollPeriodRepository,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities').StatutoryScheme,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .StatutoryRuleVersion,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .StatutoryTaxBand,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollAccountingMapping,
      ),
    );
    inputService = new PayrollInputService(hrAccessService, payrollInputRepository, payrollPeriodRepository);

    const prorationService = new PayrollProrationService();
    const progressiveTaxService = new ProgressiveTaxService();
    const statutoryCalculationService = new StatutoryCalculationService(
      progressiveTaxService,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities').StatutoryScheme,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .StatutoryRuleVersion,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .StatutoryTaxBand,
      ),
    );

    const financeAuditService = new EmployeeFinanceAuditService(
      hrAccessService,
      dataSource.getRepository(EmployeeFinanceAuditLog),
    );
    const financeProductService = new EmployeeFinanceProductService(
      configService,
      hrAccessService,
      financeAuditService,
      financeProductRepository,
      financeApplicationRepository,
    );
    const financeEligibilityService = new EmployeeFinanceEligibilityService(
      configService,
      hrAccessService,
      financeProductService,
      dataSource.getRepository(Employee),
      dataSource.getRepository(EmployeeCompensationVersion),
      payrollResultRepository,
      financeAccountRepository,
      dataSource.getRepository(EmployeeFinanceProductApplicability),
    );
    const financeInterestService = new EmployeeFinanceInterestService();
    const financeLedgerService = new EmployeeFinanceLedgerService(
      financeAccountRepository,
      financeLedgerRepository,
    );
    accountService = new EmployeeFinanceAccountService(
      configService,
      hrAccessService,
      financeInterestService,
      financeAuditService,
      financeAccountRepository,
      financeApplicationRepository,
      financeInstallmentRepository,
      financeLedgerRepository,
    );
    applicationService = new EmployeeFinanceApplicationService(
      configService,
      hrAccessService,
      financeProductService,
      financeEligibilityService,
      accountService,
      financeAuditService,
      dataSource.getRepository(Employee),
      financeApplicationRepository,
      dataSource.getRepository(EmployeeFinanceApplicationDocument),
    );
    approvalService = new EmployeeFinanceApprovalService(
      configService,
      hrAccessService,
      financeAuditService,
      dataSource.getRepository(Employee),
      financeApplicationRepository,
      financeApprovalRepository,
    );
    disbursementService = new EmployeeFinanceDisbursementService(
      financeLedgerService,
      financeAuditService,
      financeAccountRepository,
      financeApplicationRepository,
      financeDisbursementRepository,
    );
    payrollInstructionService = new EmployeeFinancePayrollInstructionService(
      financeLedgerService,
      payrollPeriodRepository,
      financeAccountRepository,
      financeInstallmentRepository,
      financeInstructionRepository,
    );

    const calculationService = new EmployeePayrollCalculationService(
      configService,
      prorationService,
      statutoryCalculationService,
      payrollInstructionService,
      dataSource.getRepository(EmployeePayrollProfile),
      dataSource.getRepository(Employee),
      dataSource.getRepository(EmployeeBankAccount),
      dataSource.getRepository(EmployeeCompensationVersion),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities').PayrollComponent,
      ),
      payrollInputRepository,
      dataSource.getRepository(AttendanceDailySummary),
      dataSource.getRepository(LeaveRequest),
    );
    runService = new PayrollRunService(
      configService,
      hrAccessService,
      calculationService,
      payrollInstructionService,
      auditService,
      payrollPeriodRepository,
      payrollRunRepository,
      payrollResultRepository,
      payrollLineItemRepository,
      dataSource.getRepository(PayrollRunApproval),
    );
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const adminUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FA-${suffix}`.slice(0, 20),
        first_name: 'Finance',
        last_name: 'Admin',
        phone: `+2559${suffix}`.slice(0, 20),
        email: `finance.admin.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    adminUserId = adminUser.id;
    const adminMembership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: company.id,
        user_id: adminUserId,
        status: 'active',
        is_default: true,
      }),
    );
    adminCompanyUserId = adminMembership.id;

    const financeUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FF-${suffix}`.slice(0, 20),
        first_name: 'Finance',
        last_name: 'Officer',
        phone: `+2551${suffix}`.slice(0, 20),
        email: `finance.officer.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    financeUserId = financeUser.id;
    const financeMembership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: company.id,
        user_id: financeUserId,
        status: 'active',
        is_default: true,
      }),
    );
    financeCompanyUserId = financeMembership.id;

    const employeeUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FE-${suffix}`.slice(0, 20),
        first_name: 'Finance',
        last_name: 'Employee',
        phone: `+2552${suffix}`.slice(0, 20),
        email: `finance.employee.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    employeeUserId = employeeUser.id;
    const employeeMembership = await dataSource.getRepository(CompanyUser).save(
      dataSource.getRepository(CompanyUser).create({
        company_id: company.id,
        user_id: employeeUserId,
        status: 'active',
        is_default: true,
      }),
    );
    employeeCompanyUserId = employeeMembership.id;

    const employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: company.id,
        company_user_id: employeeCompanyUserId,
        employee_no: `EMP-EF-${suffix}`.slice(0, 50),
        first_name: 'Finance',
        last_name: 'Employee',
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2026-01-01',
      }),
    );
    employeeId = employee.id;

    const bankAccount = await dataSource.getRepository(EmployeeBankAccount).save(
      dataSource.getRepository(EmployeeBankAccount).create({
        employee_id: employeeId,
        bank_name: 'National Bank',
        account_name: 'Finance Employee',
        account_number: `0001${suffix}`.slice(-12),
        bank_code: 'NMB',
        bank_branch_code: '001',
        account_currency: 'TZS',
        verification_status: 'VERIFIED',
        verified_at: new Date('2026-08-01T00:00:00.000Z'),
        is_primary: true,
      }),
    );
    bankAccountId = bankAccount.id;

    const profileService = (globalThis as { __profileService?: EmployeePayrollProfileService })
      .__profileService!;
    const profile = (await profileService.upsert(adminActor(), {
      employee_id: employeeId,
      payroll_number: `PAY-EF-${suffix}`.slice(0, 60),
      primary_bank_account_id: bankAccountId,
      currency: 'TZS',
      pay_frequency: 'MONTHLY',
      payroll_enabled: true,
      effective_from: '2026-01-01',
    })) as EmployeePayrollProfile;
    profileId = profile.id;

    const compensation = await dataSource.getRepository(EmployeeCompensationVersion).save(
      dataSource.getRepository(EmployeeCompensationVersion).create({
        companyId: company.id,
        employeeId,
        movementId: null,
        baseSalary: '1000000.00',
        currency: 'TZS',
        salaryStructureCode: 'STD-MONTHLY',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        revisionReference: 'EMPLOYEE-FINANCE-E2E',
        justification: 'Initial compensation for employee finance e2e',
        approvedByCompanyUserId: adminCompanyUserId,
        createdByCompanyUserId: adminCompanyUserId,
        payrollSyncStatus: 'READY',
      }),
    );
    compensationId = compensation.id;

    const calendar = await dataSource.getRepository(PayrollCalendar).save(
      dataSource.getRepository(PayrollCalendar).create({
        companyId: company.id,
        code: `EF-${suffix}`.slice(0, 80),
        name: 'Employee Finance E2E Calendar',
        frequency: 'MONTHLY',
        cutoffDay: 20,
        paymentDay: 28,
        timezone: 'Africa/Dar_es_Salaam',
      }),
    );
    calendarId = calendar.id;
  });

  afterEach(async () => {
    const auditActorIds = [adminCompanyUserId, financeCompanyUserId, employeeCompanyUserId].filter(
      (value): value is number => Boolean(value),
    );

    if (runId) {
      await dataSource.getRepository(PayrollRunApproval).delete({ payrollRunId: runId });
      await payrollLineItemRepository.delete({ payrollRunId: runId });
      await payrollResultRepository.delete({ payrollRunId: runId });
      await payrollRunRepository.delete({ id: runId });
      runId = 0;
    }
    if (accountId) {
      await financeInstructionRepository.delete({ accountId });
      await financeLedgerRepository.delete({ accountId });
      await financeInstallmentRepository.delete({ accountId });
    }
    if (disbursementId) {
      await financeDisbursementRepository.delete({ id: disbursementId });
      disbursementId = 0;
    }
    if (accountId) {
      await financeAccountRepository.delete({ id: accountId });
      accountId = 0;
    }
    if (applicationId) {
      await financeApprovalRepository.delete({ applicationId });
      await financeApplicationRepository.delete({ id: applicationId });
      applicationId = 0;
    }
    if (periodId) {
      await payrollPeriodRepository.delete({ id: periodId });
      periodId = 0;
    }
    if (calendarId) {
      await dataSource.getRepository(PayrollCalendar).delete({ id: calendarId });
      calendarId = 0;
    }
    if (profileId) {
      await dataSource.getRepository(EmployeePayrollProfile).delete({ id: profileId });
      profileId = 0;
    }
    if (compensationId) {
      await dataSource.getRepository(EmployeeCompensationVersion).delete({ id: compensationId });
      compensationId = 0;
    }
    if (bankAccountId) {
      await dataSource.getRepository(EmployeeBankAccount).delete({ id: bankAccountId });
      bankAccountId = 0;
    }
    if (employeeId) {
      await dataSource.getRepository(Employee).delete({ id: employeeId });
      employeeId = 0;
    }
    if (employeeCompanyUserId) {
      await dataSource.getRepository(CompanyUser).delete({ id: employeeCompanyUserId });
      employeeCompanyUserId = 0;
    }
    if (employeeUserId) {
      await dataSource.getRepository(User).delete({ id: employeeUserId });
      employeeUserId = 0;
    }
    if (financeCompanyUserId) {
      await dataSource.getRepository(CompanyUser).delete({ id: financeCompanyUserId });
      financeCompanyUserId = 0;
    }
    if (financeUserId) {
      await dataSource.getRepository(User).delete({ id: financeUserId });
      financeUserId = 0;
    }
    if (adminCompanyUserId) {
      await dataSource.getRepository(CompanyUser).delete({ id: adminCompanyUserId });
      adminCompanyUserId = 0;
    }
    if (adminUserId) {
      await dataSource.getRepository(User).delete({ id: adminUserId });
      adminUserId = 0;
    }

    if (auditActorIds.length > 0) {
      await dataSource
        .getRepository(PayrollAuditLog)
        .createQueryBuilder()
        .delete()
        .where('company_id = :companyId', { companyId: company.id })
        .andWhere('actor_company_user_id IN (:...ids)', { ids: auditActorIds })
        .execute();
      await dataSource
        .getRepository(EmployeeFinanceAuditLog)
        .createQueryBuilder()
        .delete()
        .where('company_id = :companyId', { companyId: company.id })
        .andWhere('actor_company_user_id IN (:...ids)', { ids: auditActorIds })
        .execute();
    }
  });

  afterAll(async () => {
    if (createdCompany) {
      await dataSource.getRepository(Company).delete({ id: company.id });
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('applies, approves, disburses a salary advance and reserves/locks it against a payroll run', async () => {
    const product = await financeProductRepository.findOneOrFail({
      where: { companyId: company.id, code: 'SALARY_ADVANCE_STD' },
    });

    let application = await applicationService.createForEmployee(adminActor(), employeeId, {
      product_id: product.id,
      requested_amount: '100000.00',
      requested_term_months: 1,
      purpose: 'Emergency medical expense',
    });
    applicationId = application.id;
    expect(application.status).toBe(EmployeeFinanceApplicationStatusEnum.DRAFT);

    application = await applicationService.submitMine(employeeActor(), application.id);
    expect(application.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
    );

    const snapshotHash = application.eligibilitySnapshotHash;

    application = await approvalService.approve(adminActor(), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.MANAGER,
      snapshot_hash: snapshotHash,
      comments: 'Manager recommends approval',
    });
    expect(application.status).toBe(EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL);

    application = await approvalService.approve(adminActor(), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.HR,
      snapshot_hash: snapshotHash,
      comments: 'HR approves',
    });
    expect(application.status).toBe(EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL);

    application = await approvalService.approve(adminActor(), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.FINANCE,
      snapshot_hash: snapshotHash,
      comments: 'Finance approves',
    });
    expect(application.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
    );

    const account = await applicationService.acceptMine(employeeActor(), application.id);
    accountId = account.id;
    expect(account.status).toBe(EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT);
    expect(account.principalAmount).toBe('100000.00');

    const installment = await financeInstallmentRepository.findOneOrFail({
      where: { accountId: account.id },
    });
    expect(installment.totalDue).toBe('100000.00');
    expect(installment.status).toBe(EmployeeFinanceInstallmentStatusEnum.SCHEDULED);

    const dueDate = new Date(`${installment.dueDate}T00:00:00.000Z`);
    const period = await configurationService.generatePeriod(adminActor(), {
      payroll_calendar_id: calendarId,
      year: dueDate.getUTCFullYear(),
      month: dueDate.getUTCMonth() + 1,
    });
    periodId = period.id;

    const disbursement = await disbursementService.create(adminActor(), {
      account_id: account.id,
      amount: '100000.00',
      payment_reference: `EF-DISB-${account.id}`,
      payment_date: new Date().toISOString().slice(0, 10),
    });
    disbursementId = disbursement.id;
    expect(disbursement.status).toBe(EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL);

    const approvedDisbursement = await disbursementService.approve(
      financeActor(),
      disbursement.id,
    );
    expect(approvedDisbursement.status).toBe(EmployeeFinanceDisbursementStatusEnum.APPROVED);

    const confirmedDisbursement = await disbursementService.confirm(
      adminActor(),
      disbursement.id,
    );
    expect(confirmedDisbursement.status).toBe(EmployeeFinanceDisbursementStatusEnum.CONFIRMED);

    const activeAccount = await financeAccountRepository.findOneOrFail({
      where: { id: account.id },
    });
    expect(activeAccount.status).toBe(EmployeeFinanceAccountStatusEnum.ACTIVE);
    expect(activeAccount.outstandingTotal).toBe('100000.00');

    const run = await runService.create(adminActor(), { payroll_period_id: period.id });
    runId = run.id;

    const processedRun = await runService.process(adminActor(), run.id);
    expect(processedRun.status).toBe(PayrollRunStatusEnum.PENDING_HR_APPROVAL);

    const advanceLine = await payrollLineItemRepository.findOneOrFail({
      where: { payrollRunId: run.id, employeeId, companyId: company.id, componentCode: 'SALARY_ADVANCE' },
    });
    expect(advanceLine.amount).toBe('100000.00');
    expect(advanceLine.componentType).toBe('DEDUCTION');

    const reservedInstruction = await financeInstructionRepository.findOneOrFail({
      where: { installmentId: installment.id, payrollPeriodId: period.id },
    });
    expect(reservedInstruction.status).toBe(EmployeeFinancePayrollInstructionStatusEnum.RESERVED);
    expect(reservedInstruction.payrollRunId).toBe(run.id);
    expect(reservedInstruction.reservedAmount).toBe('100000.00');

    const approvedRun = await runService.approve(adminActor(), run.id, {
      stage: PayrollApprovalStageEnum.HR,
      calculation_hash: processedRun.calculationHash!,
      comments: 'Employee finance e2e approval',
    });
    expect(approvedRun.status).toBe(PayrollRunStatusEnum.APPROVED);

    const lockedRun = await runService.lock(adminActor(), run.id);
    expect(lockedRun.status).toBe(PayrollRunStatusEnum.LOCKED);

    const postedInstruction = await financeInstructionRepository.findOneOrFail({
      where: { id: reservedInstruction.id },
    });
    expect(postedInstruction.status).toBe(EmployeeFinancePayrollInstructionStatusEnum.POSTED);
    expect(postedInstruction.postedAmount).toBe('100000.00');

    const paidInstallment = await financeInstallmentRepository.findOneOrFail({
      where: { id: installment.id },
    });
    expect(paidInstallment.status).toBe(EmployeeFinanceInstallmentStatusEnum.PAID);
    expect(paidInstallment.paidAmount).toBe('100000.00');

    const repaymentLedgerEntry = await financeLedgerRepository.findOneOrFail({
      where: {
        accountId: account.id,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
        idempotencyKey: `payroll:${run.id}:${reservedInstruction.id}`,
      },
    });
    expect(repaymentLedgerEntry.direction).toBe('CREDIT');
    expect(repaymentLedgerEntry.principalAmount).toBe('100000.00');

    const settledAccount = await financeAccountRepository.findOneOrFail({
      where: { id: account.id },
    });
    expect(settledAccount.outstandingTotal).toBe('0.00');
  });
});
