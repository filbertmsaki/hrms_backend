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
  PayrollGroup,
  PayrollGroupAssignment,
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
  PayrollBankBatch,
  PayrollPaymentImport,
  PayrollPaymentImportLine,
  PayrollPaymentReconciliation,
  PayrollJournalBatch,
  Payslip,
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
  PayslipService,
  PayrollBankService,
  PayrollAccountingService,
  ProgressiveTaxService,
  StatutoryCalculationService,
  SalaryStructureResolver,
} from '../src/modules/hr/payroll/services/payroll-core.services';
import {
  EmployeePayrollResultStatusEnum,
  PayrollApprovalStageEnum,
  PayrollInputStatusEnum,
  PayrollRunStatusEnum,
} from '../src/modules/hr/payroll/payroll.enums';
import { EmployeeCompensationVersion } from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import { EmployeeCompensationVersionStatusEnum } from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import { AttendanceDailySummary } from '../src/modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../src/modules/hr/leave/entities/leave-request.entity';
import { HrAccessService } from '../src/modules/hr/shared/hr-access.service';
import { HrDocumentsService } from '../src/modules/hr/documents/hr-documents.service';
import { DocumentEntityTypeEnum } from '../src/modules/hr/documents/enums/document-entity-type.enum';
import { Document } from '../src/modules/hr/documents/entities/document.entity';
import { FilesService } from '../src/modules/files/files.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import type { EmployeeFinancePayrollInstructionService } from '../src/modules/hr/employee-finance/services/employee-finance-core.services';
import { PayrollMoney } from '../src/modules/hr/payroll/services/payroll-money.util';

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
    ['JWT_ACCESS_SECRET', 'payroll-run-e2e-generation-secret'],
  ]);

  get<T>(key: string, defaultValue?: T): T {
    if (this.values.has(key)) {
      return this.values.get(key) as T;
    }
    return defaultValue as T;
  }
}

describe('Payroll run flow (e2e, real Postgres)', () => {
  let dataSource: DataSource;
  let company: Company;
  let createdCompany = false;

  let adminUserId: number;
  let adminCompanyUserId: number;
  let employeeUserId: number;
  let employeeCompanyUserId: number;
  let hrReviewerUserId: number;
  let hrReviewerCompanyUserId: number;
  let financeReviewerUserId: number;
  let financeReviewerCompanyUserId: number;
  let managementReviewerUserId: number;
  let managementReviewerCompanyUserId: number;
  let employeeId: number;
  let costCenterId: number;
  let bankAccountId: number;
  let compensationId: number;
  let profileId: number;
  let periodId: number;
  let payrollGroupId: number;
  let payrollGroupAssignmentId: number;
  let inputId: number;
  let runId: number;
  let payslipId: number;
  let attendanceSummaryId: number;

  let payrollCalendarRepository: Repository<PayrollCalendar>;
  let payrollPeriodRepository: Repository<PayrollPeriod>;
  let payrollRunRepository: Repository<PayrollRun>;
  let payrollInputRepository: Repository<PayrollInput>;
  let payrollResultRepository: Repository<EmployeePayrollResult>;
  let payrollLineItemRepository: Repository<EmployeePayrollLineItem>;
  let payslipRepository: Repository<Payslip>;

  let profileService: EmployeePayrollProfileService;
  let configurationService: PayrollConfigurationService;
  let inputService: PayrollInputService;
  let runService: PayrollRunService;
  let payslipService: PayslipService;
  let payrollBankService: PayrollBankService;
  let payrollAccountingService: PayrollAccountingService;
  let hrDocumentsService: HrDocumentsService;

  const hrAccessService = {
    ensureActorCompanyId: jest.fn(
      (actor: AuthenticatedUser) => actor.companyId,
    ),
    assertCanAccessEmployee: jest.fn(),
    assertCompanyScopedActor: jest.fn(),
  } as unknown as HrAccessService;

  const employeeFinancePayrollInstructionService = {
    reserveForPayrollRun: jest.fn().mockResolvedValue([]),
    lockForPayrollRun: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmployeeFinancePayrollInstructionService;

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
    email: 'payroll.admin@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: adminCompanyUserId,
    permissions: [],
    roles: [],
  });

  const employeeActor = (): AuthenticatedUser => ({
    id: employeeUserId,
    email: 'payroll.employee@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: company.id,
    companyMembershipId: employeeCompanyUserId,
    employeeId,
    permissions: [],
    roles: [],
  });

  const inputApprover = (): AuthenticatedUser => ({
    ...employeeActor(),
    roles: ['FINANCE_MANAGER'],
    permissions: ['payroll:inputs:approve'],
  });

  const reviewerActor = (
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

  const financeReviewer = () =>
    reviewerActor(
      financeReviewerUserId,
      financeReviewerCompanyUserId,
      'finance.reviewer@example.com',
      'FINANCE_MANAGER',
    );

  const hrReviewer = () =>
    reviewerActor(
      hrReviewerUserId,
      hrReviewerCompanyUserId,
      'hr.reviewer@example.com',
      'HR_MANAGER',
    );

  const managementReviewer = () =>
    reviewerActor(
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
          metadata: { source: 'payroll-e2e' },
        }),
      ));

    createdCompany = !existingCompany;

    await new PayrollBaselineSeeder().run(
      dataSource,
      {} as SeederFactoryManager,
    );

    payrollCalendarRepository = dataSource.getRepository(PayrollCalendar);
    payrollPeriodRepository = dataSource.getRepository(PayrollPeriod);
    payrollRunRepository = dataSource.getRepository(PayrollRun);
    payrollInputRepository = dataSource.getRepository(PayrollInput);
    payrollResultRepository = dataSource.getRepository(EmployeePayrollResult);
    payrollLineItemRepository = dataSource.getRepository(
      EmployeePayrollLineItem,
    );
    payslipRepository = dataSource.getRepository(Payslip);
    hrDocumentsService = new HrDocumentsService(
      dataSource.getRepository(Document),
      new FilesService(configService),
    );

    const auditService = new PayrollAuditService(
      dataSource.getRepository(PayrollAuditLog),
      hrAccessService,
    );
    payrollBankService = new PayrollBankService(
      configService,
      hrAccessService,
      auditService,
      payrollRunRepository,
      payrollResultRepository,
      dataSource.getRepository(PayrollBankBatch),
      dataSource.getRepository(PayrollPaymentImport),
      dataSource.getRepository(PayrollPaymentImportLine),
      dataSource.getRepository(PayrollPaymentReconciliation),
      dataSource.getRepository(EmployeeBankAccount),
    );
    payrollAccountingService = new PayrollAccountingService(
      configService,
      hrAccessService,
      auditService,
      payrollRunRepository,
      payrollResultRepository,
      payrollLineItemRepository,
      dataSource.getRepository(
        require('../src/modules/hr/payroll/entities/payroll-configuration.entities')
          .PayrollAccountingMapping,
      ),
      dataSource.getRepository(PayrollJournalBatch),
    );
    profileService = new EmployeePayrollProfileService(
      hrAccessService,
      auditService,
      dataSource.getRepository(EmployeePayrollProfile),
      dataSource.getRepository(Employee),
      dataSource.getRepository(EmployeeBankAccount),
    );
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
      dataSource.getRepository(PayrollPeriod),
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
    inputService = new PayrollInputService(
      hrAccessService,
      auditService,
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
    const calculationService = new EmployeePayrollCalculationService(
      configService,
      prorationService,
      statutoryCalculationService,
      employeeFinancePayrollInstructionService,
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
      employeeFinancePayrollInstructionService,
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
    payslipService = new PayslipService(
      configService,
      hrAccessService,
      auditService,
      hrDocumentsService,
      smsNotificationManagementService,
      notificationQueueService,
      payrollRunRepository,
      payrollResultRepository,
      payrollLineItemRepository,
      payslipRepository,
      dataSource.getRepository(EmployeePayrollProfile),
      dataSource.getRepository(EmployeeBankAccount),
      dataSource.getRepository(EmployeeCompensationVersion),
      payrollPeriodRepository,
    );
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const adminUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `PA-${suffix}`.slice(0, 20),
        first_name: 'Payroll',
        last_name: 'Admin',
        phone: `+2557${suffix}`.slice(0, 20),
        email: `payroll.admin.${suffix}@example.com`,
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

    const employeeUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `PE-${suffix}`.slice(0, 20),
        first_name: 'Payroll',
        last_name: 'Employee',
        phone: `+2558${suffix}`.slice(0, 20),
        email: `payroll.employee.${suffix}@example.com`,
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

    const hrReviewerUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `PH-${suffix}`.slice(0, 20),
        first_name: 'HR',
        last_name: 'Reviewer',
        phone: `+2554${suffix}`.slice(0, 20),
        email: `hr.reviewer.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    hrReviewerUserId = hrReviewerUser.id;
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

    const financeReviewerUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `PF-${suffix}`.slice(0, 20),
        first_name: 'Finance',
        last_name: 'Reviewer',
        phone: `+2556${suffix}`.slice(0, 20),
        email: `finance.reviewer.${suffix}@example.com`,
        password: 'not-a-real-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        auth_token_version: 1,
      }),
    );
    financeReviewerUserId = financeReviewerUser.id;
    financeReviewerCompanyUserId = (
      await dataSource.getRepository(CompanyUser).save(
        dataSource.getRepository(CompanyUser).create({
          company_id: company.id,
          user_id: financeReviewerUserId,
          status: 'active',
          is_default: true,
        }),
      )
    ).id;

    const managementReviewerUser = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        user_no: `PM-${suffix}`.slice(0, 20),
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
    managementReviewerUserId = managementReviewerUser.id;
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
        code: `PAY-${suffix}`.slice(0, 50),
        name: 'Payroll E2E Cost Center',
        status: 'active',
      }),
    );
    costCenterId = costCenter.id;

    const employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: company.id,
        company_user_id: employeeCompanyUserId,
        employee_no: `EMP-${suffix}`.slice(0, 50),
        first_name: 'Payroll',
        last_name: 'Employee',
        gender: 'female',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2026-01-01',
        cost_center_id: costCenterId,
      }),
    );
    employeeId = employee.id;

    const bankAccount = await dataSource
      .getRepository(EmployeeBankAccount)
      .save(
        dataSource.getRepository(EmployeeBankAccount).create({
          employee_id: employeeId,
          bank_name: 'National Bank',
          account_name: 'Payroll Employee',
          account_number: `0000${suffix}`.slice(-12),
          bank_code: 'NMB',
          bank_branch_code: '001',
          account_currency: 'TZS',
          verification_status: 'VERIFIED',
          verified_at: new Date('2026-08-01T00:00:00.000Z'),
          is_primary: true,
        }),
      );
    bankAccountId = bankAccount.id;

    const profile = (await profileService.upsert(adminActor(), {
      employee_id: employeeId,
      payroll_number: `PAY-${suffix}`.slice(0, 60),
      taxpayer_identification_number: suffix.replace(/\D/g, '').slice(-9),
      social_security_scheme_code: 'NSSF',
      social_security_number: `NSSF-${suffix}`.slice(0, 60),
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
          revisionReference: 'PAYROLL-E2E',
          justification: 'Initial compensation for payroll e2e',
          approvedByCompanyUserId: adminCompanyUserId,
          createdByCompanyUserId: adminCompanyUserId,
          payrollSyncStatus: 'READY',
        }),
      );
    compensationId = compensation.id;
  });

  afterEach(async () => {
    const auditActorIds = [
      adminCompanyUserId,
      employeeCompanyUserId,
      hrReviewerCompanyUserId,
      financeReviewerCompanyUserId,
      managementReviewerCompanyUserId,
    ].filter((value): value is number => Boolean(value));

    if (payslipId) {
      await hrDocumentsService.purgeForEntity(
        company.id,
        DocumentEntityTypeEnum.PAYSLIP,
        payslipId,
      );
      await payslipRepository.delete({ id: payslipId });
      payslipId = 0;
    }
    if (runId) {
      await dataSource
        .getRepository(PayrollJournalBatch)
        .delete({ payrollRunId: runId });
      await dataSource
        .getRepository(PayrollPaymentImportLine)
        .delete({ payrollRunId: runId });
      await dataSource
        .getRepository(PayrollPaymentImport)
        .delete({ payrollRunId: runId });
      await dataSource
        .getRepository(PayrollPaymentReconciliation)
        .delete({ payrollRunId: runId });
      await dataSource
        .getRepository(PayrollBankBatch)
        .delete({ payrollRunId: runId });
      await dataSource
        .getRepository(PayrollRunApproval)
        .delete({ payrollRunId: runId });
      await payrollLineItemRepository.delete({ payrollRunId: runId });
      await payrollResultRepository.delete({ payrollRunId: runId });
      await payrollRunRepository.delete({ id: runId });
      runId = 0;
    }
    if (payrollGroupAssignmentId) {
      await dataSource
        .getRepository(PayrollGroupAssignment)
        .delete({ id: payrollGroupAssignmentId });
      payrollGroupAssignmentId = 0;
    }
    if (payrollGroupId) {
      await dataSource
        .getRepository(PayrollGroup)
        .delete({ id: payrollGroupId });
      payrollGroupId = 0;
    }
    if (inputId) {
      await payrollInputRepository.delete({ id: inputId });
      inputId = 0;
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
    if (financeReviewerCompanyUserId) {
      await dataSource
        .getRepository(CompanyUser)
        .delete({ id: financeReviewerCompanyUserId });
      financeReviewerCompanyUserId = 0;
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
    if (financeReviewerUserId) {
      await dataSource
        .getRepository(User)
        .delete({ id: financeReviewerUserId });
      financeReviewerUserId = 0;
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
    if (employeeUserId) {
      await dataSource.getRepository(User).delete({ id: employeeUserId });
      employeeUserId = 0;
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
        .andWhere('actor_company_user_id IN (:...ids)', {
          ids: auditActorIds,
        })
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

  it('processes, approves, locks, and generates payslips for a seeded baseline payroll run', async () => {
    const calendar = await payrollCalendarRepository.findOneOrFail({
      where: { companyId: company.id, code: 'MAIN' },
    });

    const periodYear = 2090 + Math.floor(Math.random() * 5);
    const periodMonth = 1 + Math.floor(Math.random() * 12);
    const period = await configurationService.generatePeriod(adminActor(), {
      payroll_calendar_id: calendar.id,
      year: periodYear,
      month: periodMonth,
    });
    periodId = period.id;
    const group = await configurationService.createGroup(adminActor(), {
      code: `PAYROLL-E2E-${period.id}`,
      name: `Payroll e2e ${period.id}`,
      frequency: 'MONTHLY',
      payroll_calendar_id: calendar.id,
      currency: 'TZS',
    });
    payrollGroupId = group.id;
    const assignment = await configurationService.createGroupAssignment(
      adminActor(),
      {
        payroll_group_id: group.id,
        employee_id: employeeId,
        effective_from: period.startDate,
      },
    );
    payrollGroupAssignmentId = assignment.id;

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

    const input = await inputService.create(adminActor(), {
      payroll_period_id: period.id,
      employee_id: employeeId,
      component_code: 'HOUSING',
      source_module: 'MANUAL',
      source_reference: 'PAYROLL-E2E-HOUSING',
      amount: '250000.00',
      currency: 'TZS',
      status: PayrollInputStatusEnum.DRAFT,
      payload: { note: 'Housing allowance for payroll e2e' },
    });
    inputId = input.id;
    await inputService.approve(inputApprover(), input.id);

    const run = await runService.create(adminActor(), {
      payroll_period_id: period.id,
      payroll_group_id: group.id,
    });
    runId = run.id;

    const processedRun = await runService.process(adminActor(), run.id, {
      authenticator_code: '123456',
    });
    expect(processedRun.status).toBe(PayrollRunStatusEnum.PENDING_HR_APPROVAL);
    expect(processedRun.employeeCount).toBe(1);
    expect(processedRun.grossTotal).toBe('1250000.00');
    expect(processedRun.taxableTotal).toBe('1250000.00');
    expect(processedRun.deductionTotal).toBe('303000.00');
    expect(processedRun.employerContributionTotal).toBe('165000.00');
    expect(processedRun.netPayTotal).toBe('947000.00');
    expect(processedRun.totalEmployerCost).toBe('1415000.00');
    expect(processedRun.calculationHash).toEqual(expect.any(String));

    const result = await payrollResultRepository.findOneOrFail({
      where: { payrollRunId: run.id, employeeId, companyId: company.id },
    });
    expect(result.status).toBe(EmployeePayrollResultStatusEnum.CALCULATED);
    expect(result.grossPay).toBe('1250000.00');
    expect(result.employeeDeductions).toBe('303000.00');
    expect(result.netPay).toBe('947000.00');
    expect(result.warnings).toEqual([]);

    const lines = await payrollLineItemRepository.find({
      where: { payrollRunId: run.id, employeeId, companyId: company.id },
      order: { calculationOrder: 'ASC', id: 'ASC' },
    });
    const amountByCode = new Map(
      lines.map((line) => [line.componentCode, line.amount]),
    );
    const employerAmountByCode = new Map(
      lines.map((line) => [line.componentCode, line.employerAmount]),
    );

    expect(amountByCode.get('BASIC')).toBe('1000000.00');
    expect(amountByCode.get('HOUSING')).toBe('250000.00');
    expect(amountByCode.get('NSSF_EE')).toBe('100000.00');
    expect(amountByCode.get('NHIF_EE')).toBe('30000.00');
    expect(amountByCode.get('PAYE')).toBe('173000.00');
    expect(employerAmountByCode.get('NSSF_ER')).toBe('100000.00');
    expect(employerAmountByCode.get('NHIF_ER')).toBe('30000.00');
    expect(employerAmountByCode.get('SDL_ER')).toBe('35000.00');

    const hrApprovedRun = await runService.approve(hrReviewer(), run.id, {
      stage: PayrollApprovalStageEnum.HR,
      calculation_hash: processedRun.calculationHash!,
      comments: 'Payroll e2e HR approval',
    });
    expect(hrApprovedRun.status).toBe(
      PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
    );

    const financeApprovedRun = await runService.approve(
      financeReviewer(),
      run.id,
      {
        stage: PayrollApprovalStageEnum.FINANCE,
        calculation_hash: processedRun.calculationHash!,
        comments: 'Payroll e2e Finance approval',
      },
    );
    expect(financeApprovedRun.status).toBe(
      PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL,
    );

    const approvedRun = await runService.approve(managementReviewer(), run.id, {
      stage: PayrollApprovalStageEnum.MANAGEMENT,
      calculation_hash: processedRun.calculationHash!,
      comments: 'Payroll e2e Management approval',
    });
    expect(approvedRun.status).toBe(PayrollRunStatusEnum.APPROVED);

    const lockedRun = await runService.lock(adminActor(), run.id);
    expect(lockedRun.status).toBe(PayrollRunStatusEnum.LOCKED);

    const lockedResult = await payrollResultRepository.findOneOrFail({
      where: { id: result.id },
    });
    expect(lockedResult.status).toBe(EmployeePayrollResultStatusEnum.LOCKED);

    const lockedPeriod = await payrollPeriodRepository.findOneOrFail({
      where: { id: period.id },
    });
    expect(lockedPeriod.status).toBe('LOCKED');

    const internalBatch = await payrollBankService.generate(
      adminActor(),
      run.id,
    );
    expect(internalBatch.snapshot).toEqual(
      expect.objectContaining({ mode: 'INTERNAL', encrypted: false }),
    );
    expect(internalBatch.bankFormatCode).toBe('INTERNAL_CSV_V1');
    const internalDownload = await payrollBankService.download(
      adminActor(),
      internalBatch.id,
    );
    expect(internalDownload.mime_type).toBe('text/csv');
    expect(internalDownload.content).toContain('payment_reference');
    expect(internalDownload.content).not.toContain('account_number');

    const firstPaymentImport = await payrollBankService.importStatement(
      adminActor(),
      {
        payroll_run_id: run.id,
        provider_key: 'INTERNAL_MANUAL',
        payment_reference: `INTERNAL-E2E-PARTIAL-${run.id}`,
        rows: [
          {
            employee_id: employeeId,
            amount: '500000.00',
            status: 'PARTIAL',
            reference: `MANUAL-PART-1-${run.id}-${employeeId}`,
          },
        ],
      },
    );
    expect(firstPaymentImport.import.status).toBe('VARIANCE');
    expect(firstPaymentImport.lines[0].matchStatus).toBe('PARTIAL');
    expect(
      (
        await payrollResultRepository.findOneOrFail({
          where: { id: result.id },
        })
      ).status,
    ).toBe(EmployeePayrollResultStatusEnum.LOCKED);
    const paymentImport = await payrollBankService.importStatement(
      adminActor(),
      {
        payroll_run_id: run.id,
        provider_key: 'INTERNAL_MANUAL',
        payment_reference: `INTERNAL-E2E-FINAL-${run.id}`,
        rows: [
          {
            employee_id: employeeId,
            amount: '447000.00',
            status: 'PAID',
            reference: `MANUAL-PART-2-${run.id}-${employeeId}`,
          },
        ],
      },
    );
    expect(paymentImport.lines[0].matchStatus).toBe('PARTIAL');
    const paymentHistory = await payrollBankService.listPaymentHistory(
      adminActor(),
      run.id,
    );
    expect(paymentHistory.batches).toHaveLength(1);
    expect(paymentHistory.import_lines).toHaveLength(2);
    expect(
      paymentHistory.import_lines.every(
        (line) => line.employeeId === employeeId,
      ),
    ).toBe(true);
    expect(
      (
        await payrollResultRepository.findOneOrFail({
          where: { id: result.id },
        })
      ).status,
    ).toBe(EmployeePayrollResultStatusEnum.PAID);
    expect(
      (await payrollRunRepository.findOneOrFail({ where: { id: run.id } }))
        .status,
    ).toBe(PayrollRunStatusEnum.PAID);

    const journal = await payrollAccountingService.generate(
      adminActor(),
      run.id,
    );
    expect(journal.status).toBe('GENERATED');
    expect(journal.debitTotal).toBe(journal.creditTotal);
    const postedJournal = await payrollAccountingService.post(
      adminActor(),
      journal.id,
      {},
    );
    expect(postedJournal.status).toBe('POSTED');
    expect(postedJournal.externalReference).toContain('INTERNAL');
    const internalLedger = await payrollAccountingService.internalLedger(
      adminActor(),
      run.id,
    );
    expect(internalLedger.balanced).toBe(true);
    expect(internalLedger.posted_journal_count).toBe(1);
    expect(internalLedger.debit_total).toBe(internalLedger.credit_total);

    const payslips = await payslipService.generateForRun(adminActor(), run.id);
    expect(payslips).toHaveLength(1);
    payslipId = payslips[0].id;
    expect(payslips[0].payslipNo).toBe(`PS-${lockedRun.runNo}-${employeeId}`);

    const mine = await payslipService.listMine(employeeActor());
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(payslipId);
    expect(mine[0].gross_pay).toBe('1250000.00');
    expect(mine[0].net_pay).toBe('947000.00');
    expect(mine[0].earnings).toHaveLength(2);
    expect(mine[0].deductions).toHaveLength(3);
    expect(payslips[0].documentId).toEqual(expect.any(Number));

    const download = await payslipService.downloadMine(
      employeeActor(),
      payslipId,
    );
    expect(download.file_name).toBe(`${payslips[0].payslipNo}.pdf`);
    expect(download.mime_type).toBe('application/pdf');
    expect(Buffer.isBuffer(download.content)).toBe(true);
    expect(download.content.subarray(0, 4).toString()).toBe('%PDF');

    expect(
      employeeFinancePayrollInstructionService.reserveForPayrollRun,
    ).toHaveBeenCalledWith(company.id, period.id, run.id, employeeId);
    expect(
      employeeFinancePayrollInstructionService.lockForPayrollRun,
    ).toHaveBeenCalledWith(company.id, run.id);

    const recomputedNet = PayrollMoney.add(
      amountByCode.get('BASIC'),
      amountByCode.get('HOUSING'),
    );
    expect(
      PayrollMoney.add(
        recomputedNet,
        PayrollMoney.fromCents(
          -(
            PayrollMoney.toCents(amountByCode.get('NSSF_EE')) +
            PayrollMoney.toCents(amountByCode.get('NHIF_EE')) +
            PayrollMoney.toCents(amountByCode.get('PAYE'))
          ),
        ),
      ),
    ).toBe('947000.00');
  });
});
