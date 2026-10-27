import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
  EmployeeFinancePayrollInstructionStatusEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceRepaymentStatusEnum,
} from '../employee-finance.enums';
import {
  EmployeeFinanceAccountService,
  EmployeeFinanceApplicationService,
  EmployeeFinanceApprovalService,
  EmployeeFinanceDisbursementService,
  EmployeeFinanceEligibilityService,
  EmployeeFinanceInterestService,
  EmployeeFinanceLedgerService,
  EmployeeFinancePayrollInstructionService,
  EmployeeFinanceProductService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceScheduleItem,
} from './employee-finance-core.services';
import { EmployeeFinanceMoney } from './employee-finance-money.util';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';

describe('EmployeeFinanceInterestService', () => {
  const service = new EmployeeFinanceInterestService();

  it('builds a zero-interest salary advance schedule with exact principal allocation', () => {
    const schedule = service.calculateSchedule({
      principal: '1000.00',
      annualInterestRate: '0',
      termMonths: 3,
      method: EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
      firstRepaymentDate: '2026-09-28',
      repaymentDay: 28,
    });

    expect(schedule).toHaveLength(3);
    expect(sum(schedule, 'principal_due')).toBe('1000.00');
    expect(sum(schedule, 'interest_due')).toBe('0.00');
    expect(schedule[2].outstanding_after).toBe('0.00');
  });

  it('spreads flat-rate interest across installments and preserves totals', () => {
    const schedule = service.calculateSchedule({
      principal: '1200.00',
      annualInterestRate: '12',
      termMonths: 4,
      method: EmployeeFinanceInterestMethodEnum.FLAT_RATE,
      firstRepaymentDate: '2026-09-28',
      repaymentDay: 28,
    });

    expect(sum(schedule, 'principal_due')).toBe('1200.00');
    expect(sum(schedule, 'interest_due')).toBe('48.00');
    expect(sum(schedule, 'total_due')).toBe('1248.00');
  });

  it('calculates reducing-balance interest from the outstanding principal', () => {
    const schedule = service.calculateSchedule({
      principal: '1200.00',
      annualInterestRate: '12',
      termMonths: 4,
      method: EmployeeFinanceInterestMethodEnum.REDUCING_BALANCE,
      firstRepaymentDate: '2026-09-28',
      repaymentDay: 28,
    });

    expect(sum(schedule, 'principal_due')).toBe('1200.00');
    expect(sum(schedule, 'interest_due')).toBe('30.00');
    expect(schedule[0].interest_due).toBe('12.00');
    expect(schedule[3].outstanding_after).toBe('0.00');
  });

  it('preserves exact totals for fractional annual rates without floating-point drift', () => {
    const schedule = service.calculateSchedule({
      principal: '1000.00',
      annualInterestRate: '12.345678',
      termMonths: 3,
      method: EmployeeFinanceInterestMethodEnum.FLAT_RATE,
      firstRepaymentDate: '2026-09-28',
      repaymentDay: 28,
    });

    expect(sum(schedule, 'principal_due')).toBe('1000.00');
    expect(sum(schedule, 'interest_due')).toBe('30.86');
    expect(sum(schedule, 'total_due')).toBe('1030.86');
  });
});

describe('employee finance servicing lifecycle', () => {
  const employeeActor = actor(10, 100, 501);
  const managerActor = actor(10, 200);
  const hrActor = actor(10, 300);
  const financeActor = actor(10, 400);
  const disbursementMaker = actor(10, 500);
  const disbursementChecker = actor(10, 600);

  it('gates support records, approves, accepts, disburses, repays, and reserves payroll deductions', async () => {
    const productRepository = new MemoryRepository([
      {
        id: 7,
        companyId: 10,
        productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
        code: 'SL-01',
        name: 'Staff loan',
        description: null,
        interestMethod: EmployeeFinanceInterestMethodEnum.FLAT_RATE,
        annualInterestRate: '12',
        minimumAmount: '100.00',
        maximumAmount: '5000.00',
        maximumSalaryMultiple: '3',
        minimumTermMonths: 1,
        maximumTermMonths: 12,
        minimumServiceMonths: 0,
        maximumInstallmentPercentage: '40',
        maximumActiveAccounts: 2,
        requiredDocumentTypes: ['PAYSLIP'],
        eligibilityConfiguration: {},
        approvalConfiguration: { required_guarantors: 1 },
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        status: 'ACTIVE',
      },
    ]);
    const employeeRepository = new MemoryRepository([
      {
        id: 501,
        company_id: 10,
        employee_no: 'EMP-501',
        first_name: 'Ada',
        middle_name: null,
        last_name: 'Mosi',
        grade_id: 4,
        primary_position_id: 8,
        primary_department_id: 2,
        primary_branch_id: 3,
        employment_type: 'PERMANENT',
        hire_date: '2024-01-01',
        employment_status: EmploymentStatusEnum.ACTIVE,
      },
      {
        id: 777,
        company_id: 10,
        employee_no: 'EMP-777',
        first_name: 'Ben',
        middle_name: null,
        last_name: 'Kato',
        grade_id: 4,
        hire_date: '2023-01-01',
        employment_status: EmploymentStatusEnum.ACTIVE,
      },
    ]);
    const compensationRepository = new MemoryRepository([
      {
        id: 1,
        companyId: 10,
        employeeId: 501,
        status: 'ACTIVE',
        effectiveFrom: '2026-01-01',
        baseSalary: '2000.00',
      },
    ]);
    const payrollResultRepository = new MemoryRepository([
      {
        id: 1,
        companyId: 10,
        employeeId: 501,
        status: 'LOCKED',
        netPay: '1800.00',
      },
    ]);
    const applicationRepository = new MemoryRepository();
    const accountRepository = new MemoryRepository();
    const installmentRepository = new MemoryRepository();
    const ledgerRepository = new MemoryRepository();
    const documentRepository = new MemoryRepository();
    const guarantorRepository = new MemoryRepository();
    const sanctionLetterRepository = new MemoryRepository();
    const approvalRepository = new MemoryRepository();
    const disbursementRepository = new MemoryRepository();
    const repaymentRepository = new MemoryRepository();
    const allocationRepository = new MemoryRepository();
    const periodRepository = new MemoryRepository([
      {
        id: 88,
        companyId: 10,
        startDate: '2020-01-01',
        endDate: '2100-12-31',
      },
    ]);
    const instructionRepository = new MemoryRepository();
    const emptyRepository = new MemoryRepository();
    const configService = config({
      EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION: true,
      EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL: true,
      EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL: true,
      EMPLOYEE_FINANCE_REQUIRE_DISTINCT_APPROVERS: true,
      EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY: 28,
    });
    const hrAccessService = {
      ensureActorCompanyId: jest.fn(
        (user: AuthenticatedUser) => user.companyId,
      ),
      assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
    };
    const auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const notifier = {
      notifyEmployee: jest.fn().mockResolvedValue([]),
      notifyMemberships: jest.fn().mockResolvedValue([]),
      notifyStageApprovers: jest.fn().mockResolvedValue([]),
    };
    const notificationQueueService = {
      enqueueSmsConfiguredNotification: jest.fn().mockResolvedValue(undefined),
    };
    const smsNotificationManagementService = {};
    const filesService = {
      savePrivateBase64File: jest.fn(),
      readManagedFile: jest.fn(),
    };

    const productService = new EmployeeFinanceProductService(
      configService,
      hrAccessService as any,
      auditService as any,
      productRepository as any,
      applicationRepository as any,
    );
    const eligibilityService = new EmployeeFinanceEligibilityService(
      configService,
      hrAccessService as any,
      productService,
      employeeRepository as any,
      compensationRepository as any,
      payrollResultRepository as any,
      accountRepository as any,
      emptyRepository as any,
    );
    const ledgerService = new EmployeeFinanceLedgerService(
      accountRepository as any,
      ledgerRepository as any,
    );
    const accountService = new EmployeeFinanceAccountService(
      configService,
      hrAccessService as any,
      new EmployeeFinanceInterestService(),
      auditService as any,
      accountRepository as any,
      applicationRepository as any,
      installmentRepository as any,
      ledgerRepository as any,
      disbursementRepository as any,
      repaymentRepository as any,
      emptyRepository as any,
      emptyRepository as any,
      emptyRepository as any,
      eligibilityService,
    );
    const applicationService = new EmployeeFinanceApplicationService(
      configService,
      hrAccessService as any,
      productService,
      eligibilityService,
      accountService,
      auditService as any,
      employeeRepository as any,
      applicationRepository as any,
      documentRepository as any,
      guarantorRepository as any,
      sanctionLetterRepository as any,
      filesService as any,
      notifier as any,
    );
    const approvalService = new EmployeeFinanceApprovalService(
      configService,
      hrAccessService as any,
      auditService as any,
      smsNotificationManagementService as any,
      notificationQueueService as any,
      employeeRepository as any,
      applicationRepository as any,
      approvalRepository as any,
      documentRepository as any,
      guarantorRepository as any,
      sanctionLetterRepository as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      eligibilityService,
    );
    const disbursementService = new EmployeeFinanceDisbursementService(
      ledgerService,
      auditService as any,
      smsNotificationManagementService as any,
      notificationQueueService as any,
      accountRepository as any,
      applicationRepository as any,
      disbursementRepository as any,
    );
    const repaymentService = new EmployeeFinanceRepaymentService(
      ledgerService,
      accountRepository as any,
      installmentRepository as any,
      repaymentRepository as any,
      allocationRepository as any,
    );
    const instructionService = new EmployeeFinancePayrollInstructionService(
      ledgerService,
      periodRepository as any,
      accountRepository as any,
      installmentRepository as any,
      instructionRepository as any,
    );

    const eligibility = await eligibilityService.evaluateMine(employeeActor, {
      product_id: 7,
      requested_amount: '1200.00',
      requested_term_months: 6,
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.requiredDocumentTypes).toEqual(['PAYSLIP']);
    expect(eligibility.requiredGuarantorCount).toBe(1);

    const application = await applicationService.createMine(employeeActor, {
      product_id: 7,
      requested_amount: '1200.00',
      requested_term_months: 6,
      purpose: 'School fees',
    });
    application.status = EmployeeFinanceApplicationStatusEnum.DRAFT;
    await expect(
      applicationService.submitMine(employeeActor, application.id),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        missing_documents: ['PAYSLIP'],
        missing_guarantors: 1,
      }),
    });

    const document = await applicationService.addDocument(
      employeeActor,
      application.id,
      {
        document_type: 'PAYSLIP',
        file_url: 'https://example.test/payslip.pdf',
      },
    );
    const guarantor = await applicationService.addGuarantor(
      employeeActor,
      application.id,
      { guarantor_employee_id: 777 },
    );
    await applicationService.verifyDocument(
      financeActor,
      application.id,
      document.id,
      {
        status: 'VERIFIED',
      },
    );
    await applicationService.decideGuarantor(
      { ...employeeActor, employeeId: 777, companyMembershipId: 701 },
      guarantor.id,
      { decision: 'APPROVED' },
    );

    const submitted = await applicationService.submitMine(
      employeeActor,
      application.id,
    );
    expect(submitted.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
    );

    const managerApproved = await approvalService.approve(
      managerActor,
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.MANAGER,
        snapshot_hash: application.eligibilitySnapshotHash,
      },
    );
    expect(managerApproved.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
    );

    const hrApproved = await approvalService.approve(hrActor, application.id, {
      stage: EmployeeFinanceApprovalStageEnum.HR,
      snapshot_hash: application.eligibilitySnapshotHash,
    });
    expect(hrApproved.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
    );

    await expect(
      approvalService.approve(financeActor, application.id, {
        stage: EmployeeFinanceApprovalStageEnum.FINANCE,
        snapshot_hash: application.eligibilitySnapshotHash,
        approved_amount: '1200.00',
        approved_term_months: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message:
          'Final approved loan terms do not meet the configured eligibility policy.',
      }),
    });
    application.approvedTermMonths = null;
    application.approvedAmount = null;

    const financeApproved = await approvalService.approve(
      financeActor,
      application.id,
      {
        stage: EmployeeFinanceApprovalStageEnum.FINANCE,
        snapshot_hash: application.eligibilitySnapshotHash,
        approved_amount: '1200.00',
        approved_term_months: 6,
      },
    );
    expect(financeApproved.status).toBe(
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
    );
    expect(sanctionLetterRepository.rows).toHaveLength(1);

    payrollResultRepository.rows[0].netPay = '100.00';
    await expect(
      applicationService.acceptMine(employeeActor, application.id),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message:
          'Approved loan terms no longer meet the configured eligibility policy.',
      }),
    });
    expect(accountRepository.rows).toHaveLength(0);
    payrollResultRepository.rows[0].netPay = '1800.00';

    const account = await applicationService.acceptMine(
      employeeActor,
      application.id,
    );
    account.status = EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT;
    for (const installment of installmentRepository.rows) {
      installment.status = EmployeeFinanceInstallmentStatusEnum.SCHEDULED;
      installment.paidAmount = '0.00';
    }
    expect(installmentRepository.rows).toHaveLength(6);

    const disbursement = await disbursementService.create(disbursementMaker, {
      account_id: account.id,
      amount: '1200.00',
      payment_reference: 'BANK-001',
      payment_date: '2026-09-30',
    });
    await expect(
      disbursementService.approve(disbursementMaker, disbursement.id),
    ).rejects.toThrow('Disbursement maker cannot approve it.');
    await disbursementService.approve(disbursementChecker, disbursement.id);
    const confirmedDisbursement = await disbursementService.confirm(
      financeActor,
      disbursement.id,
    );
    expect(confirmedDisbursement.status).toBe('CONFIRMED');
    expect(accountRepository.rows[0].status).toBe(
      EmployeeFinanceAccountStatusEnum.ACTIVE,
    );
    expect(ledgerRepository.rows[0].entryType).toBe(
      EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_DISBURSEMENT,
    );

    const repayment = await repaymentService.create(disbursementMaker, {
      account_id: account.id,
      amount: '100.00',
      payment_reference: 'CASH-001',
      payment_date: '2026-10-15',
    });
    await expect(
      repaymentService.approve(disbursementMaker, repayment.id),
    ).rejects.toThrow('Repayment maker cannot approve it.');
    const postedRepayment = await repaymentService.approve(
      disbursementChecker,
      repayment.id,
    );
    expect(postedRepayment.status).toBe(
      EmployeeFinanceRepaymentStatusEnum.POSTED,
    );
    expect(allocationRepository.rows).toHaveLength(1);
    expect(installmentRepository.rows[0].status).toBe(
      EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
    );

    const instructions = await instructionService.reserveForPayrollRun(
      10,
      88,
      9001,
      501,
    );
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions[0].status).toBe(
      EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
    );
    await instructionService.setReservedAmount(instructions[0], '50.00');
    await instructionService.lockForPayrollRun(10, 9001);
    expect(instructionRepository.rows[0].status).toBe(
      EmployeeFinancePayrollInstructionStatusEnum.POSTED,
    );
    expect(
      ledgerRepository.rows.some(
        (entry) =>
          entry.entryType ===
          EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
      ),
    ).toBe(true);
  });
});

describe('EmployeeFinancePayrollInstructionService payroll recovery edges', () => {
  it('carries forward unpaid installments due before the current payroll period ends', async () => {
    const periodRepository = new MemoryRepository([
      {
        id: 88,
        companyId: 10,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
    ]);
    const accountRepository = new MemoryRepository([
      {
        id: 20,
        companyId: 10,
        employeeId: 501,
        productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
        accountNo: 'EF-20',
        status: EmployeeFinanceAccountStatusEnum.ACTIVE,
      },
    ]);
    const installment = {
      id: 30,
      companyId: 10,
      employeeId: 501,
      accountId: 20,
      dueDate: '2026-09-28',
      installmentNumber: 1,
      totalDue: '120.00',
      paidAmount: '20.00',
      status: EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
    };
    const installmentRepository = new MemoryRepository([installment]);
    const instructionRepository = new MemoryRepository();
    const service = new EmployeeFinancePayrollInstructionService(
      {} as any,
      periodRepository as any,
      accountRepository as any,
      installmentRepository as any,
      instructionRepository as any,
    );

    const instructions = await service.reserveForPayrollRun(10, 88, 9001, 501);

    expect(instructions).toEqual([
      expect.objectContaining({
        payrollPeriodId: 88,
        payrollRunId: 9001,
        employeeId: 501,
        installmentId: 30,
        amount: '100.00',
        reservedAmount: '100.00',
        status: EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
      }),
    ]);
  });

  it('does not increment an installment twice when a stale payroll instruction is posted again', async () => {
    const periodRepository = new MemoryRepository();
    const accountRepository = new MemoryRepository();
    const installmentRepository = new MemoryRepository([
      {
        id: 30,
        companyId: 10,
        accountId: 20,
        totalDue: '100.00',
        paidAmount: '0.00',
        feeDue: '0.00',
        interestDue: '0.00',
        principalDue: '100.00',
        status: EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
      },
    ]);
    const instructionRepository = new MemoryRepository([
      {
        id: 40,
        companyId: 10,
        employeeId: 501,
        accountId: 20,
        installmentId: 30,
        payrollPeriodId: 88,
        payrollRunId: 9001,
        componentCode: 'STAFF_LOAN',
        amount: '100.00',
        reservedAmount: '100.00',
        postedAmount: '0.00',
        status: EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
      },
    ]);
    const ledgerService = {
      post: jest.fn(async () => ({ id: 1 })),
    };
    const service = new EmployeeFinancePayrollInstructionService(
      ledgerService as any,
      periodRepository as any,
      accountRepository as any,
      installmentRepository as any,
      instructionRepository as any,
    );

    await service.lockForPayrollRun(10, 9001);
    await (service as any).postPayrollInstruction({
      id: 40,
      companyId: 10,
      employeeId: 501,
      accountId: 20,
      installmentId: 30,
      payrollPeriodId: 88,
      payrollRunId: 9001,
      componentCode: 'STAFF_LOAN',
      amount: '100.00',
      reservedAmount: '100.00',
      postedAmount: '0.00',
      status: EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
    });

    expect(ledgerService.post).toHaveBeenCalledTimes(1);
    expect(installmentRepository.rows[0].paidAmount).toBe('100.00');
    expect(instructionRepository.rows[0].status).toBe(
      EmployeeFinancePayrollInstructionStatusEnum.POSTED,
    );
  });
});

function sum(
  schedule: EmployeeFinanceScheduleItem[],
  field: keyof Pick<
    EmployeeFinanceScheduleItem,
    'principal_due' | 'interest_due' | 'total_due'
  >,
) {
  return schedule.reduce(
    (total, item) => EmployeeFinanceMoney.add(total, item[field]),
    '0.00',
  );
}

function actor(
  companyId: number,
  companyMembershipId: number,
  employeeId?: number,
): AuthenticatedUser {
  return {
    id: companyMembershipId,
    companyId,
    companyMembershipId,
    employeeId,
    email: `${companyMembershipId}@example.test`,
    roles: [],
    permissions: [],
  } as AuthenticatedUser;
}

function config(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : fallback,
    ),
  } as any;
}

class MemoryRepository<T extends Record<string, any> = Record<string, any>> {
  rows: T[];

  private sequence: number;

  constructor(initialRows: T[] = []) {
    this.rows = initialRows;
    this.sequence =
      initialRows.reduce((highest, row) => Math.max(highest, row.id ?? 0), 0) +
      1;
  }

  create(value: Partial<T> | Partial<T>[]) {
    return Array.isArray(value)
      ? value.map((entry) => ({ ...entry }) as T)
      : ({ ...value } as T);
  }

  async save(value: T | T[]) {
    if (Array.isArray(value)) {
      return Promise.all(value.map((entry) => this.save(entry))) as Promise<
        T[]
      >;
    }
    this.applyDefaults(value);
    if (!value.id) value.id = this.sequence++;
    const existingIndex = this.rows.findIndex((row) => row.id === value.id);
    if (existingIndex >= 0) {
      this.rows[existingIndex] = { ...this.rows[existingIndex], ...value };
      return this.rows[existingIndex];
    }
    this.rows.push(value);
    return value;
  }

  async findOne(args: { where?: Record<string, unknown>; order?: any }) {
    return (
      this.sorted(
        this.rows.filter((row) => this.matches(row, args.where)),
        args.order,
      )[0] ?? null
    );
  }

  async find(args: { where?: Record<string, unknown>; order?: any } = {}) {
    return this.sorted(
      this.rows.filter((row) => this.matches(row, args.where)),
      args.order,
    );
  }

  async count(args: { where?: Record<string, unknown> } = {}) {
    return this.rows.filter((row) => this.matches(row, args.where)).length;
  }

  async update(where: Record<string, unknown>, partial: Partial<T>) {
    this.rows = this.rows.map((row) =>
      this.matches(row, where) ? ({ ...row, ...partial } as T) : row,
    );
    return { affected: 1 };
  }

  createQueryBuilder() {
    return {
      where: () => this.createQueryBuilder(),
      andWhere: () => this.createQueryBuilder(),
      orderBy: () => this.createQueryBuilder(),
      innerJoin: () => this.createQueryBuilder(),
      setLock: () => this.createQueryBuilder(),
      getOne: async () => this.rows[0] ?? null,
      getMany: async () => this.rows,
    };
  }

  private sorted(rows: T[], order?: Record<string, 'ASC' | 'DESC'>) {
    if (!order) return [...rows];
    const entries = Object.entries(order);
    return [...rows].sort((left, right) => {
      for (const [key, direction] of entries) {
        if (left[key] === right[key]) continue;
        return (left[key] ?? 0) > (right[key] ?? 0)
          ? direction === 'DESC'
            ? -1
            : 1
          : direction === 'DESC'
            ? 1
            : -1;
      }
      return 0;
    });
  }

  private matches(row: T, where?: Record<string, unknown>) {
    if (!where) return true;
    return Object.entries(where).every(([key, expected]) => {
      const actual = row[key];
      const value = expected as { _value?: unknown[]; _type?: string };
      if (value && value._type === 'in' && Array.isArray(value._value)) {
        return value._value.includes(actual);
      }
      return actual === expected;
    });
  }

  private applyDefaults(value: T) {
    if ('componentCode' in value && !value.status) {
      value.status = EmployeeFinancePayrollInstructionStatusEnum.OPEN;
      value.reservedAmount ??= '0.00';
      value.postedAmount ??= '0.00';
      value.payrollRunId ??= null;
    }
  }
}
