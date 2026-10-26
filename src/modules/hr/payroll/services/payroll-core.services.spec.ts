import { StatutoryTaxBand } from '../entities/payroll-configuration.entities';
import { OffboardingSettlementItemTypeEnum } from '../../offboarding/enums/offboarding-settlement-item-type.enum';
import { OffboardingRequestStatusEnum } from '../../offboarding/enums/offboarding-request-status.enum';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceProductTypeEnum,
} from '../../employee-finance/employee-finance.enums';
import {
  PayrollComponentTypeEnum,
  PayrollApprovalStageEnum,
  PayrollInputStatusEnum,
  PayrollRunStatusEnum,
} from '../payroll.enums';
import {
  EmployeeSalaryService,
  EmployeePayrollCalculationService,
  PayrollAccountingService,
  PayrollFinalSettlementService,
  PayrollInputService,
  PayrollProrationService,
  PayrollReportsService,
  PayrollRunService,
  ProgressiveTaxService,
} from './payroll-core.services';
import { EmployeeCompensationVersionStatusEnum } from '../../employee-movements/entities/employee-compensation-version.entity';

describe('EmployeeSalaryService', () => {
  it('deduplicates eligible approvers by membership id without comparing JSON fields', async () => {
    const members = [
      {
        id: 12,
        user: {
          first_name: 'Amina',
          last_name: 'John',
          email: 'amina@example.com',
        },
        employee: {
          profile_image_source: { provider: 'local', key: 'amina.jpg' },
        },
      },
    ];
    const query = {
      leftJoinAndSelect: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      distinctOn: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      getMany: jest.fn().mockResolvedValue(members),
    };
    Object.values(query).forEach((method) => {
      if (method !== query.getMany) method.mockReturnValue(query);
    });
    const service = Object.create(EmployeeSalaryService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 1 };
    service.companyUserRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    service.defaultAvatarsService = {
      resolveEmployeeProfileAvatar: jest.fn().mockResolvedValue({
        profile_photo_url: '/uploads/avatars/amina.jpg',
        profile_photo_source: 'gender_default',
        selected_default_avatar: { image_path: '/uploads/avatars/amina.jpg' },
      }),
    };

    const result = await service.listEligibleApprovers({ companyId: 1 } as any);

    expect(query.distinctOn).toHaveBeenCalledWith(['companyUser.id']);
    expect(result).toEqual([
      expect.objectContaining({
        company_user_id: 12,
        name: 'Amina John',
        profile_photo_url: '/uploads/avatars/amina.jpg',
      }),
    ]);
  });

  it('lists active users while excluding onboarding employee accounts', async () => {
    const query = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    Object.values(query).forEach((method) => {
      if (method !== query.getMany) method.mockReturnValue(query);
    });
    const service = Object.create(EmployeeSalaryService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 1 };
    service.companyUserRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };

    await service.listApproverCandidates({ companyId: 1 } as any);

    expect(query.andWhere).toHaveBeenCalledWith('user.status = :userStatus', {
      userStatus: 'active',
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      '(employee.id IS NULL OR LOWER(employee.employment_status) = :employmentStatus)',
      { employmentStatus: 'active' },
    );
  });

  it('removes a directly assigned salary approver permission', async () => {
    const query = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    Object.values(query).forEach((method) => {
      if (method !== query.getExists) method.mockReturnValue(query);
    });
    const service = Object.create(EmployeeSalaryService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 1 };
    service.permissionRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 7 }),
    };
    service.companyUserRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 12 }),
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    service.companyUserPermissionRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    await expect(
      service.removeEligibleApprover({ companyId: 1 } as any, 12),
    ).resolves.toEqual({ message: 'Salary approver removed successfully.' });
    expect(service.companyUserPermissionRepository.delete).toHaveBeenCalledWith(
      { company_user_id: 12, permission_id: 7 },
    );
  });

  it('does not pretend to remove salary approval inherited from a role', async () => {
    const query = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getExists: jest.fn().mockResolvedValue(true),
    };
    Object.values(query).forEach((method) => {
      if (method !== query.getExists) method.mockReturnValue(query);
    });
    const service = Object.create(EmployeeSalaryService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 1 };
    service.permissionRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 7 }),
    };
    service.companyUserRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 12 }),
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    service.companyUserPermissionRepository = { delete: jest.fn() };

    await expect(
      service.removeEligibleApprover({ companyId: 1 } as any, 12),
    ).rejects.toThrow('inherits salary approval from a role');
    expect(
      service.companyUserPermissionRepository.delete,
    ).not.toHaveBeenCalled();
  });

  it('returns a pending initial salary when no payable compensation exists', async () => {
    const pendingCompensation = {
      id: 17,
      employeeId: 4,
      status: EmployeeCompensationVersionStatusEnum.PENDING_APPROVAL,
      effectiveFrom: '2026-10-26',
      effectiveTo: null,
      salaryStructureCode: null,
      baseSalary: '1000000.00',
      currency: 'TZS',
      componentOverrides: null,
    };
    const service = Object.create(EmployeeSalaryService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 1 };
    service.employeeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 4,
        employee_no: 'AICL/00005',
        first_name: 'Bosco',
        last_name: 'Richard',
        employment_status: 'ONBOARDING',
        hire_date: '2026-10-13',
      }),
    };
    service.compensationRepository = {
      find: jest.fn().mockResolvedValue([pendingCompensation]),
    };
    service.companyUserRepository = { find: jest.fn().mockResolvedValue([]) };
    service.structureResolver = { resolve: jest.fn() };

    const result = await service.getEmployeeSalary(
      { companyId: 1 } as any,
      4,
      '2026-10-26',
    );

    expect(result.compensation).toEqual(
      expect.objectContaining({
        ...pendingCompensation,
        approval: {
          submitted_by: null,
          assigned_to: null,
          approved_by: null,
        },
      }),
    );
    expect(result.warnings).not.toContain('NO_COMPENSATION');
    expect(result.history).toEqual([
      expect.objectContaining({ id: pendingCompensation.id }),
    ]);
  });
});

describe('PayrollInputService independent approval', () => {
  const maker = { companyId: 1, companyMembershipId: 10 } as any;
  const checker = { companyId: 1, companyMembershipId: 11 } as any;

  it('rejects self-approval and audits a separate approver', async () => {
    const input = {
      id: 7,
      companyId: 1,
      status: PayrollInputStatusEnum.DRAFT,
      createdByCompanyUserId: 10,
      approvedByCompanyUserId: null,
    };
    const service = Object.create(PayrollInputService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 1 };
    service.repository = {
      findOne: jest.fn().mockResolvedValue(input),
      save: jest.fn(async (value) => ({ ...value })),
    };
    service.auditService = { log: jest.fn() };

    await expect(service.approve(maker, input.id)).rejects.toThrow(
      'Payroll input requires an independent approver.',
    );
    expect(service.repository.save).not.toHaveBeenCalled();

    const approved = await service.approve(checker, input.id);
    expect(approved.status).toBe(PayrollInputStatusEnum.APPROVED);
    expect(approved.approvedByCompanyUserId).toBe(11);
    expect(service.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payroll.input.approved',
        beforeValues: {
          status: PayrollInputStatusEnum.DRAFT,
          approved_by_company_user_id: null,
        },
        afterValues: {
          status: PayrollInputStatusEnum.APPROVED,
          approved_by_company_user_id: 11,
        },
      }),
    );
  });
});

describe('ProgressiveTaxService', () => {
  const service = new ProgressiveTaxService();
  const bands = [
    band('0', '270000', '0', '0', 1),
    band('270000', '520000', '0', '8', 2),
    band('520000', '760000', '20000', '20', 3),
    band('760000', '1000000', '68000', '25', 4),
    band('1000000', null, '128000', '30', 5),
  ];

  it.each([
    ['270000', '0.00'],
    ['270001', '0.08'],
    ['520000', '20000.00'],
    ['520001', '20000.20'],
    ['760000', '68000.00'],
    ['760001', '68000.25'],
    ['1000000', '128000.00'],
    ['1000001', '128000.30'],
  ])('calculates PAYE boundary %s', (income, expected) => {
    expect(service.calculate(income, bands)).toBe(expected);
  });
});

describe('PayrollProrationService', () => {
  const service = new PayrollProrationService();
  const period = {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
  };

  it('returns full factor when employee is active for the full month', () => {
    expect(
      service.calculateFactor({
        ...period,
        hireDate: '2026-08-01',
      }),
    ).toBe(1);
  });

  it('prorates a mid-month hire', () => {
    expect(
      service.calculateFactor({
        ...period,
        hireDate: '2026-08-16',
      }),
    ).toBeCloseTo(16 / 31, 8);
  });

  it('uses the later compensation effective date', () => {
    expect(
      service.calculateFactor({
        ...period,
        hireDate: '2026-08-01',
        compensationEffectiveFrom: '2026-08-21',
      }),
    ).toBeCloseTo(11 / 31, 8);
  });

  it('supports fixed-30 proration', () => {
    expect(
      service.calculateFactor({
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        hireDate: '2026-02-16',
        method: 'FIXED_30',
      }),
    ).toBeCloseTo(13 / 30, 8);
  });
});

describe('PayrollRunService approval flow', () => {
  it('requires the expected approval stage', () => {
    const service = Object.create(
      PayrollRunService.prototype,
    ) as PayrollRunService;
    expect(() =>
      (service as any).assertApprovalStage(
        { status: PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL },
        PayrollApprovalStageEnum.HR,
      ),
    ).toThrow('Payroll run is not waiting for this approval stage.');
  });
});

describe('EmployeePayrollCalculationService finance deduction capacity', () => {
  it('reserves salary advances first and records loan shortfalls', async () => {
    const instructionService = {
      setReservedAmount: jest.fn(async (instruction, reservedAmount) => ({
        ...instruction,
        reservedAmount,
        snapshot: {
          ...(instruction.snapshot ?? {}),
          reserved_amount: reservedAmount,
        },
      })),
    };
    const service = Object.create(EmployeePayrollCalculationService.prototype);
    service.configService = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'PAYROLL_MINIMUM_NET_PAY_AMOUNT') return '300.00';
        return fallback;
      }),
    };
    service.employeeFinancePayrollInstructionService = instructionService;

    const result = await service.applyFinanceDeductionCapacity({
      gross: '1000.00',
      deductionsBeforeFinance: '200.00',
      financeInstructions: [
        {
          id: 20,
          componentCode: 'STAFF_LOAN',
          amount: '600.00',
          snapshot: {},
        },
        {
          id: 10,
          componentCode: 'SALARY_ADVANCE',
          amount: '250.00',
          snapshot: {},
        },
      ],
    });

    expect(result.minimumNetPay).toBe('300.00');
    expect(result.applied).toEqual([
      expect.objectContaining({ appliedAmount: '250.00' }),
      expect.objectContaining({ appliedAmount: '250.00' }),
    ]);
    expect(result.shortfalls).toEqual([
      expect.objectContaining({
        componentCode: 'STAFF_LOAN',
        requestedAmount: '600.00',
        appliedAmount: '250.00',
        deferredAmount: '350.00',
      }),
    ]);
    expect(instructionService.setReservedAmount).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ componentCode: 'SALARY_ADVANCE' }),
      '250.00',
    );
  });

  it('records a full shortfall when minimum net pay consumes capacity', async () => {
    const service = Object.create(EmployeePayrollCalculationService.prototype);
    service.configService = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'PAYROLL_MINIMUM_NET_PAY_PERCENTAGE') return '100';
        return fallback;
      }),
    };
    service.employeeFinancePayrollInstructionService = {
      setReservedAmount: jest.fn(async (instruction, reservedAmount) => ({
        ...instruction,
        reservedAmount,
      })),
    };

    const result = await service.applyFinanceDeductionCapacity({
      gross: '1000.00',
      deductionsBeforeFinance: '0.00',
      financeInstructions: [
        {
          id: 1,
          componentCode: 'STAFF_LOAN',
          amount: '100.00',
          snapshot: {},
        },
      ],
    });

    expect(result.applied).toEqual([]);
    expect(result.shortfalls).toEqual([
      expect.objectContaining({
        requestedAmount: '100.00',
        appliedAmount: '0.00',
        deferredAmount: '100.00',
      }),
    ]);
  });
});

describe('PayrollReportsService run reconciliation detail', () => {
  it('summarizes deduction preview, shortfalls, approvals, outputs, and issues', async () => {
    const service = Object.create(PayrollReportsService.prototype);
    const run = {
      id: 7,
      status: PayrollRunStatusEnum.PAYMENT_FILE_GENERATED,
      grossTotal: '1000.00',
      deductionTotal: '250.00',
      netPayTotal: '750.00',
    };
    const result = {
      id: 70,
      employeeId: 12,
      netPay: '750.00',
    };
    service.runRepository = {
      findOne: jest.fn().mockResolvedValue(run),
    };
    service.resultRepository = {
      find: jest.fn().mockResolvedValue([result]),
    };
    service.lineRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 701,
          employeeId: 12,
          sourceType: 'EMPLOYEE_FINANCE',
          sourceReference: '501',
          amount: '100.00',
          componentType: PayrollComponentTypeEnum.DEDUCTION,
        },
      ]),
    };
    service.approvalRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 1, stage: PayrollApprovalStageEnum.HR, decision: 'APPROVED' },
        ]),
    };
    service.bankBatchRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 33,
        totalAmount: '750.00',
        recordCount: 1,
      }),
    };
    service.journalRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 44,
        debitTotal: '900.00',
        creditTotal: '900.00',
      }),
    };
    service.paymentReconciliationRepository = {
      find: jest.fn().mockResolvedValue([{ id: 55, status: 'MATCHED' }]),
    };
    service.shortfallRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 81,
          employeePayrollResultId: 70,
          componentCode: 'STAFF_LOAN',
          requestedAmount: '150.00',
          appliedAmount: '100.00',
          deferredAmount: '50.00',
          status: 'OPEN',
        },
      ]),
    };
    service.financeInstructionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 501,
          employeeId: 12,
          accountId: 20,
          installmentId: 30,
          componentCode: 'STAFF_LOAN',
          amount: '150.00',
          reservedAmount: '100.00',
          postedAmount: '100.00',
          status: 'POSTED',
        },
      ]),
    };
    service.financeLedgerRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 601,
          idempotencyKey: 'payroll:7:501',
          totalAmount: '100.00',
        },
      ]),
    };

    const detail = await service.buildRunReconciliationDetail(1, [7]);

    expect(detail.summary).toEqual(
      expect.objectContaining({
        payroll_run_id: 7,
        deduction_preview_count: 1,
        shortfall_count: 1,
        shortfall_total: '50.00',
        bank_batch_total: '750.00',
        issue_count: 0,
      }),
    );
    expect(detail.rows).toEqual([
      expect.objectContaining({
        instruction_id: 501,
        requested_amount: '150.00',
        reserved_amount: '100.00',
        ledger_entry_id: 601,
      }),
    ]);
    expect(detail.shortfalls).toEqual([
      expect.objectContaining({
        employee_id: 12,
        deferred_amount: '50.00',
      }),
    ]);
  });
});

describe('PayrollAccountingService output sequencing', () => {
  it('allows journal generation after a bank file has moved the run forward', async () => {
    const service = Object.create(PayrollAccountingService.prototype);
    service.hrAccessService = { ensureActorCompanyId: jest.fn(() => 1) };
    service.auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service.payrollProfileRepository = {
      findOne: jest.fn().mockResolvedValue({ currency: 'TZS' }),
    };
    service.compensationRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 5,
        baseSalary: '3000.00',
        currency: 'TZS',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-01-01',
      }),
    };
    service.prorationService = {
      calculateRatio: jest
        .fn()
        .mockReturnValue({ numerator: 31, denominator: 31 }),
    };
    service.configService = { get: jest.fn().mockReturnValue('CALENDAR_DAYS') };
    service.journalRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 91, ...value })),
    };
    service.runRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        companyId: 1,
        runNo: 'RUN-7',
        status: PayrollRunStatusEnum.PAYMENT_FILE_GENERATED,
      }),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ hire_date: '2020-01-01' }),
        }),
      },
    };
    service.lineRepository = { find: jest.fn().mockResolvedValue([]) };
    service.resultRepository = { find: jest.fn().mockResolvedValue([]) };
    service.mappingRepository = { find: jest.fn().mockResolvedValue([]) };

    const journal = await service.generate({ companyId: 1 } as never, 7);

    expect(journal).toEqual(
      expect.objectContaining({
        id: 91,
        payrollRunId: 7,
        debitTotal: '0.00',
        creditTotal: '0.00',
      }),
    );
  });
});

describe('PayrollFinalSettlementService finance recovery', () => {
  it('deducts recovery settlement items and unrecovered active finance balances', async () => {
    const service = Object.create(PayrollFinalSettlementService.prototype);
    service.hrAccessService = { ensureActorCompanyId: jest.fn(() => 1) };
    service.auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service.payrollProfileRepository = {
      findOne: jest.fn().mockResolvedValue({ currency: 'TZS' }),
    };
    service.compensationRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 5,
        baseSalary: '3000.00',
        currency: 'TZS',
        payFrequency: 'MONTHLY',
        effectiveFrom: '2026-01-01',
      }),
    };
    service.prorationService = {
      calculateRatio: jest
        .fn()
        .mockReturnValue({ numerator: 31, denominator: 31 }),
    };
    service.configService = { get: jest.fn().mockReturnValue('CALENDAR_DAYS') };
    service.repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      manager: { query: jest.fn().mockResolvedValue([]) },
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 99, ...value })),
    };
    service.offboardingRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 77,
        company_id: 1,
        employee_id: 12,
        status: OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
        last_working_date: '2026-10-31',
      }),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ hire_date: '2020-01-01' }),
        }),
      },
    };
    service.settlementItemRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          item_type: OffboardingSettlementItemTypeEnum.FINAL_SALARY,
          source_type: 'PAYROLL_EXTERNAL',
          currency: 'TZS',
          calculation_snapshot: {},
          amount: '3000.00',
          status: 'completed',
        },
        {
          id: 2,
          item_type: OffboardingSettlementItemTypeEnum.LOAN_RECOVERY,
          amount: '120.00',
          status: 'completed',
          source_reference: 'EF-1',
          calculation_snapshot: { account_id: 10, account_no: 'EF-1' },
        },
      ]),
    };
    service.financeAccountRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 10,
          accountNo: 'EF-1',
          productType: EmployeeFinanceProductTypeEnum.STAFF_LOAN,
          status: EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY,
          outstandingTotal: '120.00',
        },
        {
          id: 11,
          accountNo: 'EF-2',
          productType: EmployeeFinanceProductTypeEnum.SALARY_ADVANCE,
          status: EmployeeFinanceAccountStatusEnum.ACTIVE,
          outstandingTotal: '80.00',
        },
      ]),
    };

    const settlement = await service.calculate({ companyId: 1 } as never, 77);

    expect(settlement).toEqual(
      expect.objectContaining({
        grossSettlement: '3000.00',
        deductionTotal: '-200.00',
        netSettlement: '2800.00',
      }),
    );
    expect(settlement.snapshot).toEqual(
      expect.objectContaining({
        employee_finance_recovery_item_total: '-120.00',
        unrecovered_employee_finance_total: '-80.00',
        unrecovered_employee_finance_accounts: [
          expect.objectContaining({
            account_id: 11,
            outstanding_total: '80.00',
          }),
        ],
      }),
    );
  });

  it('requires separate approval and supports simulated payment, reconciliation, and close', async () => {
    const previousDemoMode = process.env.PAYROLL_DEMO_MODE;
    process.env.PAYROLL_DEMO_MODE = 'true';
    const settlement = {
      id: 99,
      companyId: 1,
      status: 'CALCULATED',
      netSettlement: '300.00',
      snapshot: {
        created_by_company_user_id: 7,
        workflow_history: [],
        demo_data: true,
      },
    };
    const service = Object.create(PayrollFinalSettlementService.prototype);
    service.hrAccessService = { ensureActorCompanyId: jest.fn(() => 1) };
    service.auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service.repository = {
      findOne: jest.fn().mockImplementation(async () => settlement),
      save: jest.fn().mockImplementation(async (value) => value),
    };

    try {
      await service.submit(
        { companyId: 1, companyMembershipId: 7 } as never,
        99,
      );
      await expect(
        service.decide({ companyId: 1, companyMembershipId: 7 } as never, 99, {
          decision: 'APPROVE',
        }),
      ).rejects.toThrow('cannot approve their own settlement');
      await service.decide(
        { companyId: 1, companyMembershipId: 8 } as never,
        99,
        { decision: 'APPROVE' },
      );
      await service.simulatePayment(
        { companyId: 1, companyMembershipId: 8 } as never,
        99,
        { outcome: 'PENDING', attempt: 1 },
      );
      await service.simulatePayment(
        { companyId: 1, companyMembershipId: 8 } as never,
        99,
        { outcome: 'SUCCESS', attempt: 2 },
      );
      await service.reconcile(
        { companyId: 1, companyMembershipId: 9 } as never,
        99,
      );
      await service.close(
        { companyId: 1, companyMembershipId: 9 } as never,
        99,
      );
      expect(settlement.status).toBe('CLOSED');
      expect(settlement.snapshot.workflow_history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'PAYMENT', outcome: 'PENDING' }),
          expect.objectContaining({ action: 'PAYMENT', outcome: 'SUCCESS' }),
          expect.objectContaining({ action: 'RECONCILED' }),
          expect.objectContaining({ action: 'CLOSED' }),
        ]),
      );
      expect(service.auditService.log).toHaveBeenCalledTimes(6);
    } finally {
      if (previousDemoMode === undefined) delete process.env.PAYROLL_DEMO_MODE;
      else process.env.PAYROLL_DEMO_MODE = previousDemoMode;
    }
  });

  it('blocks final settlement when regular payroll already paid the final work period', async () => {
    const service = Object.create(PayrollFinalSettlementService.prototype);
    service.hrAccessService = { ensureActorCompanyId: jest.fn(() => 1) };
    service.repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      manager: {
        query: jest
          .fn()
          .mockResolvedValue([{ id: 88, period_code: '2026-10' }]),
      },
    };
    service.offboardingRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 77,
        company_id: 1,
        employee_id: 12,
        status: OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
        last_working_date: '2026-10-31',
      }),
    };
    service.settlementItemRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    await expect(
      service.calculate({ companyId: 1 } as never, 77),
    ).rejects.toThrow('regular payroll run is already paid or closed');
  });

  it('blocks a settlement source already present in a paid regular payroll line', async () => {
    const service = Object.create(PayrollFinalSettlementService.prototype);
    service.hrAccessService = { ensureActorCompanyId: jest.fn(() => 1) };
    service.repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      manager: {
        query: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              settlement_item_id: 44,
              payroll_run_id: 88,
              source_reference: 'leave-balance:12',
              settlement_amount: '100.00',
              payroll_amount: '100.00',
            },
          ]),
      },
    };
    service.offboardingRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 77,
        company_id: 1,
        employee_id: 12,
        status: OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
        last_working_date: '2026-10-31',
      }),
    };
    service.settlementItemRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 44,
          item_type: 'leave_payout',
          amount: '100.00',
          status: 'completed',
          source_reference: 'leave-balance:12',
          source_type: 'LEAVE',
        },
      ]),
    };

    await expect(
      service.calculate({ companyId: 1 } as never, 77),
    ).rejects.toThrow(
      'Settlement sources already appear in paid regular payroll',
    );
  });
});

function band(
  lowerLimit: string,
  upperLimit: string | null,
  baseTax: string,
  ratePercent: string,
  sortOrder: number,
) {
  return {
    lowerLimit,
    upperLimit,
    baseTax,
    ratePercent,
    sortOrder,
  } as StatutoryTaxBand;
}
