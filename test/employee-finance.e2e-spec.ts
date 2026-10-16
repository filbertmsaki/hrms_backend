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
import { TwoFaService } from '../src/modules/auth/2fa/2fa.service';
import PayrollBaselineSeeder from '../src/database/seeds/038-payroll-baseline.seed';
import EmployeeFinanceProductsSeeder from '../src/database/seeds/039-employee-finance-products.seed';
import { approveProvisionalPayrollRules } from './helpers/approve-provisional-payroll-rules';
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
import { CostCenter } from '../src/modules/hr/cost-centers/entities/cost-center.entity';
import {
  PayrollCalendar,
  PayrollPeriod,
} from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollAuditLog,
  PayrollDeductionShortfall,
  PayrollInput,
  PayrollRun,
  PayrollRunApproval,
} from '../src/modules/hr/payroll/entities/payroll-run.entities';
import { EmployeePayrollProfile } from '../src/modules/hr/payroll/entities/employee-payroll-profile.entity';
import { PayrollOvertimeRequest } from '../src/modules/hr/payroll/entities/payroll-overtime-request.entity';
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
  SalaryStructureResolver,
} from '../src/modules/hr/payroll/services/payroll-core.services';
import {
  PayrollApprovalStageEnum,
  PayrollRunStatusEnum,
} from '../src/modules/hr/payroll/payroll.enums';
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
  EmployeeFinanceApplicationGuarantor,
  EmployeeFinanceSanctionLetter,
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
    ['JWT_ACCESS_SECRET', 'employee-finance-e2e-payroll-generation-secret'],
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
  let hrReviewerUserId: number;
  let hrReviewerCompanyUserId: number;
  let managementReviewerUserId: number;
  let managementReviewerCompanyUserId: number;
  let employeeUserId: number;
  let employeeCompanyUserId: number;
  let employeeId: number;
  let guarantorUserId: number;
  let guarantorCompanyUserId: number;
  let guarantorEmployeeId: number;
  let costCenterId: number;
  let bankAccountId: number;
  let compensationId: number;
  let profileId: number;
  let calendarId: number;
  let periodId: number;
  let attendanceSummaryId: number;
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
  let runService: PayrollRunService;

  let applicationService: EmployeeFinanceApplicationService;
  let approvalService: EmployeeFinanceApprovalService;
  let accountService: EmployeeFinanceAccountService;
  let disbursementService: EmployeeFinanceDisbursementService;
  let payrollInstructionService: EmployeeFinancePayrollInstructionService;

  const hrAccessService = {
    ensureActorCompanyId: jest.fn(
      (actor: AuthenticatedUser) => actor.companyId,
    ),
    assertCanAccessEmployee: jest.fn(),
    assertCompanyScopedActor: jest.fn(),
  } as unknown as HrAccessService;

  const smsNotificationManagementService = {} as never;
  const notificationQueueService = {
    enqueueSmsConfiguredNotification: jest.fn().mockResolvedValue(undefined),
  } as never;
  const twoFaService = {
    verifyPayrollAuthenticatorCode: jest.fn().mockResolvedValue(true),
  } as unknown as TwoFaService;

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

  const guarantorActor = (): AuthenticatedUser => ({
    id: guarantorUserId,
    email: 'finance.guarantor@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: guarantorCompanyUserId,
    employeeId: guarantorEmployeeId,
    permissions: [],
    roles: [],
  });

  const payrollReviewerActor = (
    userId: number,
    membershipId: number,
    email: string,
    role: string,
  ): AuthenticatedUser => ({
    id: userId,
    email,
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: membershipId,
    permissions: ['payroll:runs:approve'],
    roles: [role],
  });

  const hrReviewerActor = () =>
    payrollReviewerActor(
      hrReviewerUserId,
      hrReviewerCompanyUserId,
      'hr.reviewer@example.com',
      'HR_MANAGER',
    );

  const managementReviewerActor = () =>
    payrollReviewerActor(
      managementReviewerUserId,
      managementReviewerCompanyUserId,
      'management.reviewer@example.com',
      'MANAGEMENT',
    );

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

    await new PayrollBaselineSeeder().run(
      dataSource,
      {} as SeederFactoryManager,
    );
    await new EmployeeFinanceProductsSeeder().run(
      dataSource,
      {} as SeederFactoryManager,
    );

    payrollPeriodRepository = dataSource.getRepository(PayrollPeriod);
    payrollRunRepository = dataSource.getRepository(PayrollRun);
    payrollInputRepository = dataSource.getRepository(PayrollInput);
    payrollResultRepository = dataSource.getRepository(EmployeePayrollResult);
    payrollLineItemRepository = dataSource.getRepository(
      EmployeePayrollLineItem,
    );

    financeProductRepository = dataSource.getRepository(EmployeeFinanceProduct);
    financeApplicationRepository = dataSource.getRepository(
      EmployeeFinanceApplication,
    );
    financeApprovalRepository = dataSource.getRepository(
      EmployeeFinanceApplicationApproval,
    );
    financeAccountRepository = dataSource.getRepository(EmployeeFinanceAccount);
    financeInstallmentRepository = dataSource.getRepository(
      EmployeeFinanceInstallment,
    );
    financeDisbursementRepository = dataSource.getRepository(
      EmployeeFinanceDisbursement,
    );
    financeLedgerRepository = dataSource.getRepository(
      EmployeeFinanceLedgerEntry,
    );
    financeInstructionRepository = dataSource.getRepository(
      EmployeeFinancePayrollInstruction,
    );

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
    (
      globalThis as { __profileService?: EmployeePayrollProfileService }
    ).__profileService = profileService;

    configurationService = new PayrollConfigurationService(
      configService,
      hrAccessService,
      auditService,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollComponent,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .SalaryStructure,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .SalaryStructureComponent,
      ),
      dataSource.getRepository(PayrollCalendar),
      payrollPeriodRepository,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .StatutoryScheme,
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
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollGroup,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollGroupAssignment,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollOvertimePolicy,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollBonusScheme,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollLeaveRule,
      ),
      dataSource.getRepository(EmployeeCompensationVersion),
    );
    new PayrollInputService(
      hrAccessService,
      payrollInputRepository,
      payrollPeriodRepository,
    );

    const prorationService = new PayrollProrationService();
    const progressiveTaxService = new ProgressiveTaxService();
    const statutoryCalculationService = new StatutoryCalculationService(
      progressiveTaxService,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .StatutoryScheme,
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
      dataSource.getRepository(EmployeeFinanceApplicationGuarantor),
      dataSource.getRepository(EmployeeFinanceSanctionLetter),
      {} as any,
      {
        notifyEmployee: jest.fn().mockResolvedValue(undefined),
        notifyStageApprovers: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
    approvalService = new EmployeeFinanceApprovalService(
      configService,
      hrAccessService,
      financeAuditService,
      smsNotificationManagementService,
      notificationQueueService,
      dataSource.getRepository(Employee),
      financeApplicationRepository,
      financeApprovalRepository,
      dataSource.getRepository(EmployeeFinanceApplicationDocument),
      dataSource.getRepository(EmployeeFinanceApplicationGuarantor),
      dataSource.getRepository(EmployeeFinanceSanctionLetter),
    );
    disbursementService = new EmployeeFinanceDisbursementService(
      financeLedgerService,
      financeAuditService,
      smsNotificationManagementService,
      notificationQueueService,
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
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollComponent,
      ),
      payrollInputRepository,
      dataSource.getRepository(AttendanceDailySummary),
      dataSource.getRepository(PayrollOvertimeRequest),
      dataSource.getRepository(LeaveRequest),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollOvertimePolicy,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollBonusScheme,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollGroup,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollGroupAssignment,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/attendance/holidays/entities/holiday.entity')
          .AttendanceHoliday,
      ),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollLeaveRule,
      ),
      new SalaryStructureResolver(
        dataSource.getRepository(
          require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
            .SalaryStructure,
        ),
        dataSource.getRepository(
          require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
            .SalaryStructureComponent,
        ),
        dataSource.getRepository(
          require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
            .PayrollComponent,
        ),
      ),
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
      dataSource.getRepository(PayrollDeductionShortfall),
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollGroup,
      ),
      twoFaService,
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
    await approveProvisionalPayrollRules(
      dataSource,
      company.id,
      adminCompanyUserId,
    );

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
        phone: `+2554${suffix}`.slice(0, 20),
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

    const hrReviewer = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FH-${suffix}`.slice(0, 20),
        first_name: 'HR',
        last_name: 'Reviewer',
        phone: `+2552${suffix}`.slice(0, 20),
        email: `hr.reviewer.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    hrReviewerUserId = hrReviewer.id;
    hrReviewerCompanyUserId = (
      await dataSource.getRepository(CompanyUser).save(
        dataSource.getRepository(CompanyUser).create({
          company_id: company.id,
          user_id: hrReviewerUserId,
          status: 'active',
          is_default: true,
        }),
      )
    ).id;

    const managementReviewer = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FM-${suffix}`.slice(0, 20),
        first_name: 'Management',
        last_name: 'Reviewer',
        phone: `+2555${suffix}`.slice(0, 20),
        email: `management.reviewer.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    managementReviewerUserId = managementReviewer.id;
    managementReviewerCompanyUserId = (
      await dataSource.getRepository(CompanyUser).save(
        dataSource.getRepository(CompanyUser).create({
          company_id: company.id,
          user_id: managementReviewerUserId,
          status: 'active',
          is_default: true,
        }),
      )
    ).id;

    const costCenter = await dataSource.getRepository(CostCenter).save(
      dataSource.getRepository(CostCenter).create({
        company_id: company.id,
        code: `EF-${suffix}`.slice(0, 50),
        name: 'Employee Finance E2E Cost Center',
        status: 'active',
      }),
    );
    costCenterId = costCenter.id;

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
        cost_center_id: costCenterId,
      }),
    );
    employeeId = employee.id;

    const guarantorUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `FG-${suffix}`.slice(0, 20),
        first_name: 'Finance',
        last_name: 'Guarantor',
        phone: `+2553${suffix}`.slice(0, 20),
        email: `finance.guarantor.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    guarantorUserId = guarantorUser.id;
    const guarantorMembership = await dataSource
      .getRepository(CompanyUser)
      .save(
        dataSource.getRepository(CompanyUser).create({
          company_id: company.id,
          user_id: guarantorUserId,
          status: 'active',
          is_default: true,
        }),
      );
    guarantorCompanyUserId = guarantorMembership.id;

    const guarantorEmployee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: company.id,
        company_user_id: guarantorCompanyUserId,
        employee_no: `EMP-FG-${suffix}`.slice(0, 50),
        first_name: 'Finance',
        last_name: 'Guarantor',
        gender: 'male',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2025-01-01',
      }),
    );
    guarantorEmployeeId = guarantorEmployee.id;

    const bankAccount = await dataSource
      .getRepository(EmployeeBankAccount)
      .save(
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

    const profileService = (
      globalThis as { __profileService?: EmployeePayrollProfileService }
    ).__profileService!;
    const profile = (await profileService.upsert(adminActor(), {
      employee_id: employeeId,
      payroll_number: `PAY-EF-${suffix}`.slice(0, 60),
      taxpayer_identification_number: suffix.replace(/\D/g, '').slice(-9),
      social_security_scheme_code: 'NSSF',
      social_security_number: `NSSF-EF-${suffix}`.slice(0, 60),
      primary_bank_account_id: bankAccountId,
      currency: 'TZS',
      pay_frequency: 'MONTHLY',
      payroll_enabled: true,
      effective_from: '2026-01-01',
    })) as EmployeePayrollProfile;
    profileId = profile.id;

    const compensation = await dataSource
      .getRepository(EmployeeCompensationVersion)
      .save(
        dataSource.getRepository(EmployeeCompensationVersion).create({
          companyId: company.id,
          employeeId,
          movementId: null,
          baseSalary: '1000000.00',
          currency: 'TZS',
          // Structure lines are covered by salary-structure-lines.util.spec;
          // this suite asserts totals built from payroll inputs only.
          salaryStructureCode: null,
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
    const auditActorIds = [
      adminCompanyUserId,
      financeCompanyUserId,
      hrReviewerCompanyUserId,
      managementReviewerCompanyUserId,
      employeeCompanyUserId,
      guarantorCompanyUserId,
    ].filter((value): value is number => Boolean(value));

    if (runId) {
      await dataSource
        .getRepository(PayrollRunApproval)
        .delete({ payrollRunId: runId });
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
      await dataSource
        .getRepository(EmployeeFinanceApplicationDocument)
        .delete({ applicationId });
      await dataSource
        .getRepository(EmployeeFinanceApplicationGuarantor)
        .delete({ applicationId });
      await dataSource
        .getRepository(EmployeeFinanceSanctionLetter)
        .delete({ applicationId });
      await financeApprovalRepository.delete({ applicationId });
      await financeApplicationRepository.delete({ id: applicationId });
      applicationId = 0;
    }
    if (periodId) {
      await payrollPeriodRepository.delete({ id: periodId });
      periodId = 0;
    }
    if (attendanceSummaryId) {
      await dataSource
        .getRepository(AttendanceDailySummary)
        .delete({ id: attendanceSummaryId });
      attendanceSummaryId = 0;
    }
    if (calendarId) {
      await dataSource
        .getRepository(PayrollCalendar)
        .delete({ id: calendarId });
      calendarId = 0;
    }
    if (profileId) {
      await dataSource
        .getRepository(EmployeePayrollProfile)
        .delete({ id: profileId });
      profileId = 0;
    }
    if (compensationId) {
      await dataSource
        .getRepository(EmployeeCompensationVersion)
        .delete({ id: compensationId });
      compensationId = 0;
    }
    if (bankAccountId) {
      await dataSource
        .getRepository(EmployeeBankAccount)
        .delete({ id: bankAccountId });
      bankAccountId = 0;
    }
    if (employeeId) {
      await dataSource.getRepository(Employee).delete({ id: employeeId });
      employeeId = 0;
    }
    if (costCenterId) {
      await dataSource.getRepository(CostCenter).delete({ id: costCenterId });
      costCenterId = 0;
    }
    if (employeeCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: employeeCompanyUserId });
      employeeCompanyUserId = 0;
    }
    if (employeeUserId) {
      await dataSource.getRepository(User).delete({ id: employeeUserId });
      employeeUserId = 0;
    }
    if (guarantorEmployeeId) {
      await dataSource
        .getRepository(Employee)
        .delete({ id: guarantorEmployeeId });
      guarantorEmployeeId = 0;
    }
    if (guarantorCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: guarantorCompanyUserId });
      guarantorCompanyUserId = 0;
    }
    if (guarantorUserId) {
      await dataSource.getRepository(User).delete({ id: guarantorUserId });
      guarantorUserId = 0;
    }
    if (financeCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: financeCompanyUserId });
      financeCompanyUserId = 0;
    }
    if (hrReviewerCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: hrReviewerCompanyUserId });
      hrReviewerCompanyUserId = 0;
    }
    if (managementReviewerCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: managementReviewerCompanyUserId });
      managementReviewerCompanyUserId = 0;
    }
    if (financeUserId) {
      await dataSource.getRepository(User).delete({ id: financeUserId });
      financeUserId = 0;
    }
    if (hrReviewerUserId) {
      await dataSource.getRepository(User).delete({ id: hrReviewerUserId });
      hrReviewerUserId = 0;
    }
    if (managementReviewerUserId) {
      await dataSource
        .getRepository(User)
        .delete({ id: managementReviewerUserId });
      managementReviewerUserId = 0;
    }
    if (adminCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: adminCompanyUserId });
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

    let application = await applicationService.createForEmployee(
      adminActor(),
      employeeId,
      {
        product_id: product.id,
        requested_amount: '100000.00',
        requested_term_months: 1,
        purpose: 'Emergency medical expense',
      },
    );
    applicationId = application.id;
    expect(application.status).toBe(EmployeeFinanceApplicationStatusEnum.DRAFT);

    const requestLetter = await applicationService.addDocument(
      employeeActor(),
      application.id,
      {
        document_type: 'REQUEST_LETTER',
        file_url: `test://request-letter/${application.id}`,
        metadata: { source: 'employee-finance-e2e' },
      },
    );
    const verifiedLetter = await applicationService.verifyDocument(
      adminActor(),
      application.id,
      requestLetter.id,
      { status: 'VERIFIED' },
    );
    expect(verifiedLetter.status).toBe('VERIFIED');

    const guarantor = await applicationService.addGuarantor(
      employeeActor(),
      application.id,
      { guarantor_employee_id: guarantorEmployeeId },
    );
    const approvedGuarantor = await applicationService.decideGuarantor(
      guarantorActor(),
      guarantor.id,
      {
        decision: 'APPROVED',
        comments: 'Able to guarantee this advance',
      },
    );
    expect(approvedGuarantor.status).toBe('APPROVED');

    application = await applicationService.submitMine(
      employeeActor(),
      application.id,
    );
    expect(application.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
    );

    const snapshotHash = application.eligibilitySnapshotHash;

    application = await approvalService.approve(adminActor(), application.id, {
      stage: EmployeeFinanceApprovalStageEnum.MANAGER,
      snapshot_hash: snapshotHash,
      comments: 'Manager recommends approval',
    });
    expect(application.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
    );

    application = await approvalService.approve(
      guarantorActor(),
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.HR,
        snapshot_hash: snapshotHash,
        comments: 'HR approves',
      },
    );
    expect(application.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
    );

    application = await approvalService.approve(
      financeActor(),
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.FINANCE,
        snapshot_hash: snapshotHash,
        comments: 'Finance approves',
      },
    );
    expect(application.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
    );

    const account = await applicationService.acceptMine(
      employeeActor(),
      application.id,
    );
    accountId = account.id;
    expect(account.status).toBe(
      EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
    );
    expect(account.principalAmount).toBe('100000.00');

    const installment = await financeInstallmentRepository.findOneOrFail({
      where: { accountId: account.id },
    });
    expect(installment.totalDue).toBe('100000.00');
    expect(installment.status).toBe(
      EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
    );

    const dueDate = new Date(`${installment.dueDate}T00:00:00.000Z`);
    const period = await configurationService.generatePeriod(adminActor(), {
      payroll_calendar_id: calendarId,
      year: dueDate.getUTCFullYear(),
      month: dueDate.getUTCMonth() + 1,
    });
    periodId = period.id;

    const attendanceSummary = await dataSource
      .getRepository(AttendanceDailySummary)
      .save(
        dataSource.getRepository(AttendanceDailySummary).create({
          companyId: company.id,
          branchId: null,
          employeeId,
          attendanceDate: period.startDate,
          scheduleSource: 'E2E',
          shiftId: null,
          timetableId: null,
          timezone: 'Africa/Dar_es_Salaam',
          scheduleStartAt: new Date(`${period.startDate}T06:00:00.000Z`),
          scheduleEndAt: new Date(`${period.startDate}T14:00:00.000Z`),
          checkInAt: new Date(`${period.startDate}T06:00:00.000Z`),
          checkOutAt: new Date(`${period.startDate}T14:00:00.000Z`),
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          workMinutes: 480,
          breakMinutes: 0,
          overtimeMinutes: 0,
          attendanceStatus: 'PRESENT',
          remarks: null,
          flags: null,
          sourceFirstRawLogId: null,
          sourceLastRawLogId: null,
          calculationVersion: 1,
          isAdjusted: false,
          adjustedByCompanyUserId: null,
          adjustedAt: null,
          finalizedAt: new Date(`${period.startDate}T15:00:00.000Z`),
        }),
      );
    attendanceSummaryId = attendanceSummary.id;

    const disbursement = await disbursementService.create(adminActor(), {
      account_id: account.id,
      amount: '100000.00',
      payment_reference: `EF-DISB-${account.id}`,
      payment_date: new Date().toISOString().slice(0, 10),
    });
    disbursementId = disbursement.id;
    expect(disbursement.status).toBe(
      EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL,
    );

    const approvedDisbursement = await disbursementService.approve(
      financeActor(),
      disbursement.id,
    );
    expect(approvedDisbursement.status).toBe(
      EmployeeFinanceDisbursementStatusEnum.APPROVED,
    );

    const confirmedDisbursement = await disbursementService.confirm(
      adminActor(),
      disbursement.id,
    );
    expect(confirmedDisbursement.status).toBe(
      EmployeeFinanceDisbursementStatusEnum.CONFIRMED,
    );

    const activeAccount = await financeAccountRepository.findOneOrFail({
      where: { id: account.id },
    });
    expect(activeAccount.status).toBe(EmployeeFinanceAccountStatusEnum.ACTIVE);
    expect(activeAccount.outstandingTotal).toBe('100000.00');

    const run = await runService.create(adminActor(), {
      payroll_period_id: period.id,
    });
    runId = run.id;

    const processedRun = await runService.process(adminActor(), run.id, {
      authenticator_code: '123456',
    });
    expect(processedRun.status).toBe(PayrollRunStatusEnum.PENDING_HR_APPROVAL);

    const advanceLine = await payrollLineItemRepository.findOneOrFail({
      where: {
        payrollRunId: run.id,
        employeeId,
        companyId: company.id,
        componentCode: 'SALARY_ADVANCE',
      },
    });
    expect(advanceLine.amount).toBe('100000.00');
    expect(advanceLine.componentType).toBe('DEDUCTION');

    const reservedInstruction =
      await financeInstructionRepository.findOneOrFail({
        where: { installmentId: installment.id, payrollPeriodId: period.id },
      });
    expect(reservedInstruction.status).toBe(
      EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
    );
    expect(reservedInstruction.payrollRunId).toBe(run.id);
    expect(reservedInstruction.reservedAmount).toBe('100000.00');

    const hrApprovedRun = await runService.approve(hrReviewerActor(), run.id, {
      stage: PayrollApprovalStageEnum.HR,
      calculation_hash: processedRun.calculationHash!,
      comments: 'Employee finance e2e HR approval',
    });
    expect(hrApprovedRun.status).toBe(
      PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
    );

    const financeApprovedRun = await runService.approve(
      financeActor(),
      run.id,
      {
        stage: PayrollApprovalStageEnum.FINANCE,
        calculation_hash: processedRun.calculationHash!,
        comments: 'Employee finance e2e Finance approval',
      },
    );
    expect(financeApprovedRun.status).toBe(
      PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL,
    );

    const approvedRun = await runService.approve(
      managementReviewerActor(),
      run.id,
      {
        stage: PayrollApprovalStageEnum.MANAGEMENT,
        calculation_hash: processedRun.calculationHash!,
        comments: 'Employee finance e2e Management approval',
      },
    );
    expect(approvedRun.status).toBe(PayrollRunStatusEnum.APPROVED);

    const lockedRun = await runService.lock(adminActor(), run.id);
    expect(lockedRun.status).toBe(PayrollRunStatusEnum.LOCKED);

    const postedInstruction = await financeInstructionRepository.findOneOrFail({
      where: { id: reservedInstruction.id },
    });
    expect(postedInstruction.status).toBe(
      EmployeeFinancePayrollInstructionStatusEnum.POSTED,
    );
    expect(postedInstruction.postedAmount).toBe('100000.00');

    const paidInstallment = await financeInstallmentRepository.findOneOrFail({
      where: { id: installment.id },
    });
    expect(paidInstallment.status).toBe(
      EmployeeFinanceInstallmentStatusEnum.PAID,
    );
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
