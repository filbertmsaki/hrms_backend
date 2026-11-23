import { StatutoryTaxBand } from '../entities/payroll-configuration.entities';
import { OffboardingSettlementItemTypeEnum } from '../../offboarding/enums/offboarding-settlement-item-type.enum';
import { OffboardingRequestStatusEnum } from '../../offboarding/enums/offboarding-request-status.enum';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
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
      '(employee.id IS NULL OR employee.employment_status = :employmentStatus)',
      { employmentStatus: EmploymentStatusEnum.ACTIVE },
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

describe('PayrollRunService rejection', () => {
  const actor = { id: 9, companyMembershipId: 9 } as any;

  function buildService(run: Record<string, unknown>) {
    const saved: Record<string, unknown[]> = { approvals: [], audits: [] };
    const repo = (bucket: string) => ({
      create: (value: unknown) => value,
      save: jest.fn(async (value: any) => {
        if (bucket === 'runs') return value;
        saved[bucket].push(value);
        return value;
      }),
      createQueryBuilder: () => ({
        setLock() {
          return this;
        },
        where() {
          return this;
        },
        getOne: async () => run,
      }),
    });
    const repos: Record<string, any> = {
      PayrollRun: repo('runs'),
      PayrollRunApproval: repo('approvals'),
      PayrollAuditLog: repo('audits'),
    };
    const notificationsService = {
      createAndPush: jest.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(
      PayrollRunService.prototype,
    ) as PayrollRunService;
    Object.assign(service as any, {
      logger: { warn: jest.fn() },
      notificationsService,
      hrAccessService: { ensureActorCompanyId: () => 1 },
      runRepository: {
        manager: {
          transaction: (fn: any) =>
            fn({ getRepository: (entity: any) => repos[entity.name] }),
        },
      },
    });
    return { service, saved, notificationsService };
  }

  it.each([
    [PayrollRunStatusEnum.PENDING_HR_APPROVAL, PayrollApprovalStageEnum.HR],
    [
      PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
      PayrollApprovalStageEnum.FINANCE,
    ],
    [
      PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL,
      PayrollApprovalStageEnum.MANAGEMENT,
    ],
  ])(
    'returns a run pending %s to draft with a recorded reason',
    async (status, stage) => {
      const run = {
        id: 5,
        runNo: 'PR-5',
        status,
        calculationHash: 'h1',
        createdByCompanyUserId: 3,
        approvedAt: null,
      };
      const { service, saved, notificationsService } = buildService(run);
      const result = await service.reject(actor, 5, {
        stage,
        calculation_hash: 'h1',
        reason: ' Wrong overtime ',
      });
      expect(result.status).toBe(PayrollRunStatusEnum.DRAFT);
      expect(result.calculationHash).toBeNull();
      expect(saved.approvals[0]).toMatchObject({
        stage,
        decision: 'REJECTED',
        calculationHash: 'h1',
        approvedByCompanyUserId: 9,
        comments: 'Wrong overtime',
      });
      expect(saved.audits[0]).toMatchObject({
        action: 'payroll.run.rejected',
      });
      expect(notificationsService.createAndPush).toHaveBeenCalledWith(
        expect.objectContaining({ receiver_company_user_id: 3 }),
      );
    },
  );

  it('requires a reason, the current hash, a non-maker, and the waiting stage', async () => {
    const base = {
      id: 5,
      status: PayrollRunStatusEnum.PENDING_HR_APPROVAL,
      calculationHash: 'h1',
      createdByCompanyUserId: 3,
    };
    const dto = {
      stage: PayrollApprovalStageEnum.HR,
      calculation_hash: 'h1',
      reason: 'x',
    };
    await expect(
      buildService({ ...base }).service.reject(actor, 5, {
        ...dto,
        reason: '  ',
      }),
    ).rejects.toThrow('A rejection reason is required.');
    await expect(
      buildService({ ...base }).service.reject(actor, 5, {
        ...dto,
        calculation_hash: 'old',
      }),
    ).rejects.toThrow('Rejection hash must match current payroll hash.');
    await expect(
      buildService({ ...base, createdByCompanyUserId: 9 }).service.reject(
        actor,
        5,
        dto,
      ),
    ).rejects.toThrow('Payroll creator cannot reject the same run.');
    await expect(
      buildService({
        ...base,
        status: PayrollRunStatusEnum.APPROVED,
      }).service.reject(actor, 5, dto),
    ).rejects.toThrow('Payroll run is not waiting for this approval stage.');
  });

  it('ignores approvals made before the latest recalculation', () => {
    const service = Object.create(
      PayrollRunService.prototype,
    ) as PayrollRunService;
    const run = { startedAt: new Date('2026-11-20T10:00:00Z') } as any;
    expect(
      (service as any).isFromCurrentCalculation(run, {
        createdAt: new Date('2026-11-20T09:00:00Z'),
      }),
    ).toBe(false);
    expect(
      (service as any).isFromCurrentCalculation(run, {
        createdAt: new Date('2026-11-20T10:05:00Z'),
      }),
    ).toBe(true);
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

describe('PayrollReportsService variance review', () => {
  it('stores the explanation, reviewer metadata, remaining count, and audit record', async () => {
    const row = {
      employee_id: 12,
      gross_variance: '100.00',
      deduction_variance: '0.00',
      employer_contribution_variance: '0.00',
      net_variance: '100.00',
      explanation_status: 'PENDING_REVIEW',
      explanation: null,
    };
    const variance = {
      id: 71,
      companyId: 4,
      payrollRunId: 7,
      comparisonRunId: 6,
      snapshot: { rows: [row] },
      varianceTotal: '100.00',
      unexplainedCount: 1,
    };
    const savedVarianceRepository = {
      findOne: jest.fn().mockResolvedValue(variance),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const auditService = { log: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = Object.create(PayrollReportsService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 4 };
    service.varianceRepository = savedVarianceRepository;
    service.auditService = auditService;

    const actor = { id: 8, companyMembershipId: 22 };
    const result = await service.reviewVariance(actor, 7, 71, {
      employee_id: 12,
      explanation: 'Approved salary increase effective this month.',
    });

    expect(row).toEqual(
      expect.objectContaining({
        explanation_status: 'REVIEWED',
        explanation: 'Approved salary increase effective this month.',
        reviewed_by_company_user_id: 22,
      }),
    );
    expect(result.unexplainedCount).toBe(0);
    expect(savedVarianceRepository.findOne).toHaveBeenCalledWith({
      where: { id: 71, companyId: 4, payrollRunId: 7 },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payroll.variance.reviewed',
        entityType: 'payroll_variance_result',
        entityId: 71,
      }),
    );
  });
});

describe('PayrollReportsService report pagination', () => {
  it('returns a page while keeping filtered totals over the complete matching set', async () => {
    const service = Object.create(PayrollReportsService.prototype);
    service.hrAccessService = { ensureActorCompanyId: () => 4 };
    service.resolveReportRunIds = jest.fn().mockResolvedValue([9]);
    service.resultRepository = {
      find: jest.fn().mockResolvedValue([
        {
          companyId: 4,
          payrollRunId: 9,
          employeeId: 101,
          employeeSnapshot: { employee_no: 'D-101', full_name: 'Demo One' },
          grossPay: '100.00',
          taxablePay: '100.00',
          employeeDeductions: '10.00',
          employerContributions: '5.00',
          netPay: '90.00',
          employerCost: '105.00',
          status: 'LOCKED',
        },
        {
          companyId: 4,
          payrollRunId: 9,
          employeeId: 102,
          employeeSnapshot: { employee_no: 'D-102', full_name: 'Demo Two' },
          grossPay: '200.00',
          taxablePay: '200.00',
          employeeDeductions: '20.00',
          employerContributions: '10.00',
          netPay: '180.00',
          employerCost: '210.00',
          status: 'LOCKED',
        },
        {
          companyId: 4,
          payrollRunId: 9,
          employeeId: 103,
          employeeSnapshot: { employee_no: 'X-103', full_name: 'Other Three' },
          grossPay: '300.00',
          taxablePay: '300.00',
          employeeDeductions: '30.00',
          employerContributions: '15.00',
          netPay: '270.00',
          employerCost: '315.00',
          status: 'LOCKED',
        },
      ]),
    };
    service.lineRepository = { find: jest.fn().mockResolvedValue([]) };

    const report = await service.report(
      { id: 1, companyId: 4 },
      'payroll-register',
      { page: 2, limit: 1, search: 'demo' },
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].employee_id).toBe(102);
    expect(report.row_count).toBe(2);
    expect(report.summary).toEqual(
      expect.objectContaining({ rows: 2, total_gross_pay: '300.00' }),
    );
    expect(report.pagination).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 1,
        total_rows: 2,
        total_pages: 2,
        has_previous: true,
        has_next: false,
        filtered: true,
      }),
    );
  });
});

describe('EmployeePayrollCalculationService organization snapshot', () => {
  it('stores department, branch, and cost-center names with their IDs', () => {
    const service = Object.create(
      EmployeePayrollCalculationService.prototype,
    ) as unknown as {
      employeeSnapshot: (employee: unknown) => Record<string, unknown>;
    };
    const snapshot = service.employeeSnapshot({
      id: 101,
      employee_no: 'DEMO-101',
      first_name: 'Demo',
      middle_name: null,
      last_name: 'Employee',
      primary_branch_id: 3,
      primary_branch: { name: 'Demo Branch' },
      primary_department_id: 4,
      primary_department: { name: 'Demo Department' },
      primary_position_id: null,
      grade_id: null,
      cost_center_id: 5,
      cost_center: { name: 'Demo Cost Center' },
      employment_type: 'full_time',
      hire_date: '2026-01-01',
      exit_date: null,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        branch_id: 3,
        branch_name: 'Demo Branch',
        department_id: 4,
        department_name: 'Demo Department',
        cost_center_id: 5,
        cost_center_name: 'Demo Cost Center',
      }),
    );
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

describe('PayrollRunService cancellation and reversal', () => {
  const actor = { id: 9, companyMembershipId: 9 } as any;

  function cancelService(run: Record<string, unknown>) {
    const finance = { releaseForPayrollRun: jest.fn().mockResolvedValue(2) };
    const audit = { log: jest.fn() };
    const runRepository = {
      findOne: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = Object.create(
      PayrollRunService.prototype,
    ) as PayrollRunService;
    Object.assign(service as any, {
      hrAccessService: { ensureActorCompanyId: () => 1 },
      employeeFinancePayrollInstructionService: finance,
      auditService: audit,
      runRepository,
    });
    return { service, finance, audit, runRepository };
  }

  it('cancels an approved run, releases loan reservations and audits the reason', async () => {
    const { service, finance, audit } = cancelService({
      id: 4,
      status: PayrollRunStatusEnum.APPROVED,
    });
    await service.cancel(actor, 4, { reason: 'Wrong period' });
    expect(finance.releaseForPayrollRun).toHaveBeenCalledWith(1, 4);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payroll.run.cancelled',
        summary: { reason: 'Wrong period' },
      }),
    );
  });

  it.each([
    PayrollRunStatusEnum.LOCKED,
    PayrollRunStatusEnum.PAID,
    PayrollRunStatusEnum.CLOSED,
  ])('refuses to cancel a %s run', async (status) => {
    const { service, finance } = cancelService({ id: 4, status });
    await expect(service.cancel(actor, 4, { reason: 'x' })).rejects.toThrow(
      'Use reversal or a correction run.',
    );
    expect(finance.releaseForPayrollRun).not.toHaveBeenCalled();
  });

  function reverseService(options: {
    status: PayrollRunStatusEnum;
    paidResults?: number;
    confirmedLines?: number;
    openJournal?: unknown;
    bankBatches?: Array<Record<string, unknown>>;
  }) {
    const run = { id: 7, payrollPeriodId: 3, status: options.status };
    const finance = { reversePayrollRun: jest.fn().mockResolvedValue({}) };
    const saved: unknown[] = [];
    const repos: Record<string, any> = {
      PayrollRun: {
        createQueryBuilder: () => ({
          setLock() {
            return this;
          },
          where() {
            return this;
          },
          getOne: async () => run,
        }),
        save: async (value: unknown) => value,
      },
      EmployeePayrollResult: {
        count: async () => options.paidResults ?? 0,
        update: jest.fn(),
      },
      PayrollPaymentImportLine: {
        count: async () => options.confirmedLines ?? 0,
      },
      PayrollJournalBatch: {
        findOne: async () => options.openJournal ?? null,
      },
      PayrollBankBatch: {
        find: async () => options.bankBatches ?? [],
        save: async (value: unknown) => saved.push(value),
      },
      PayrollPeriod: { update: jest.fn() },
      PayrollAuditLog: {
        create: (value: unknown) => value,
        save: async (value: unknown) => value,
      },
    };
    const service = Object.create(
      PayrollRunService.prototype,
    ) as PayrollRunService;
    Object.assign(service as any, {
      hrAccessService: { ensureActorCompanyId: () => 1 },
      employeeFinancePayrollInstructionService: finance,
      runRepository: {
        manager: {
          transaction: (fn: any) =>
            fn({ getRepository: (entity: any) => repos[entity.name] }),
        },
      },
    });
    return { service, finance, repos, saved };
  }

  it('reverses an unpaid locked run and reopens the period', async () => {
    const { service, finance, repos, saved } = reverseService({
      status: PayrollRunStatusEnum.PAYMENT_FILE_GENERATED,
      bankBatches: [{ batchNo: 'B1', status: 'GENERATED' }],
    });
    const result = await service.reverseRun(actor, 7, {
      reason: 'Duplicate run',
      bank_file_withdrawn: true,
    });
    expect(result.status).toBe(PayrollRunStatusEnum.REVERSED);
    expect(finance.reversePayrollRun).toHaveBeenCalledWith(1, 7);
    expect(saved).toEqual([{ batchNo: 'B1', status: 'CANCELLED' }]);
    expect(repos.EmployeePayrollResult.update).toHaveBeenCalledWith(
      { companyId: 1, payrollRunId: 7 },
      { status: 'REVERSED' },
    );
    expect(repos.PayrollPeriod.update).toHaveBeenCalled();
  });

  it('refuses reversal when salaries are confirmed paid', async () => {
    const { service, finance } = reverseService({
      status: PayrollRunStatusEnum.PAID,
      paidResults: 3,
    });
    await expect(service.reverseRun(actor, 7, { reason: 'x' })).rejects.toThrow(
      'use a correction run',
    );
    expect(finance.reversePayrollRun).not.toHaveBeenCalled();
  });

  it('requires the journal to be reversed and the bank file withdrawn first', async () => {
    await expect(
      reverseService({
        status: PayrollRunStatusEnum.LOCKED,
        openJournal: { batchNo: 'J1' },
      }).service.reverseRun(actor, 7, { reason: 'x' }),
    ).rejects.toThrow('Reverse payroll journal J1 first');
    await expect(
      reverseService({
        status: PayrollRunStatusEnum.LOCKED,
        bankBatches: [{ batchNo: 'B1' }],
      }).service.reverseRun(actor, 7, { reason: 'x' }),
    ).rejects.toThrow('A bank payment file exists');
  });
});

describe('EmployeePayrollCalculationService eligibility', () => {
  const period = {
    id: 3,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  } as any;

  function service(
    employees: Array<Record<string, unknown>>,
    profiles: Array<Record<string, unknown>>,
    compensatedIds: number[],
  ) {
    const instance = Object.create(
      EmployeePayrollCalculationService.prototype,
    ) as EmployeePayrollCalculationService;
    const qb: any = {};
    for (const method of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'orderBy',
    ]) {
      qb[method] = () => qb;
    }
    qb.getMany = async () => employees;
    Object.assign(instance as any, {
      groupRepository: { findOne: async () => null },
      employeeRepository: { createQueryBuilder: () => qb },
      profileRepository: { find: async () => profiles },
      findCompensation: async (_c: number, employeeId: number) =>
        compensatedIds.includes(employeeId) ? { id: employeeId } : null,
    });
    return instance;
  }

  it('separates configuration errors from deliberate exclusions', async () => {
    const report = await service(
      [
        { id: 1, first_name: 'A' },
        { id: 2, first_name: 'B' },
        { id: 3, first_name: 'C' },
        { id: 4, first_name: 'D' },
        { id: 5, first_name: 'E' },
      ],
      [
        { employeeId: 1, payrollEnabled: true, payrollHold: false },
        { employeeId: 3, payrollEnabled: false, payrollHold: false },
        {
          employeeId: 4,
          payrollEnabled: true,
          payrollHold: true,
          payrollHoldReason: 'Investigation',
        },
        { employeeId: 5, payrollEnabled: true, payrollHold: false },
      ],
      [1],
    ).buildEligibility(1, period, { payrollGroupId: null } as any);
    const byId = Object.fromEntries(
      report.rows.map((row) => [row.employee_id, row]),
    );
    expect(byId[1]).toMatchObject({ status: 'ELIGIBLE' });
    expect(byId[2]).toMatchObject({
      status: 'ERROR',
      reason_code: 'PAYROLL_PROFILE_MISSING',
    });
    expect(byId[3]).toMatchObject({
      status: 'EXCLUDED',
      reason_code: 'PAYROLL_DISABLED',
    });
    expect(byId[4]).toMatchObject({
      status: 'EXCLUDED',
      reason: 'Payroll on hold: Investigation',
    });
    expect(byId[5]).toMatchObject({
      status: 'ERROR',
      reason_code: 'COMPENSATION_MISSING',
    });
    expect(report).toMatchObject({
      eligible_count: 1,
      excluded_count: 2,
      error_count: 2,
    });
  });

  it('blocks only employees who left before the period, not final-month leavers', () => {
    const instance = Object.create(EmployeePayrollCalculationService.prototype);
    const args = (exitDate: string) => ({
      employee: { exit_date: exitDate, cost_center_id: 1 },
      profile: {
        taxpayerIdentificationNumber: 'T',
        socialSecurityNumber: 'S',
      },
      bank: { verification_status: 'VERIFIED' },
      attendanceSummary: { summaryCount: 1, unfinalizedCount: 0 },
      netPay: '100.00',
      periodStart: '2026-11-01',
    });
    const codes = (exitDate: string) =>
      instance
        .buildCriticalErrors(args(exitDate))
        .map((error: any) => error.code);
    expect(codes('2026-11-15')).not.toContain('TERMINATED_EMPLOYEE_INCLUDED');
    expect(codes('2026-10-31')).toContain('TERMINATED_EMPLOYEE_INCLUDED');
  });
});

describe('PayrollRunService manual payment confirmation', () => {
  const actor = { id: 9, companyMembershipId: 9 } as any;
  const evidence = {
    payment_reference: 'CRDB-123',
    payment_date: '2026-11-25',
    confirmation_note: 'Bank call-back by Finance',
  };

  function build(run: Record<string, unknown>) {
    const reconciliations: unknown[] = [];
    const finance = { postForPaidPayrollResult: jest.fn() };
    const service = Object.create(
      PayrollRunService.prototype,
    ) as PayrollRunService;
    Object.assign(service as any, {
      hrAccessService: { ensureActorCompanyId: () => 1 },
      employeeFinancePayrollInstructionService: finance,
      auditService: { log: jest.fn() },
      periodRepository: { update: jest.fn() },
      resultRepository: {
        find: async () => [
          { id: 1, employeeId: 11, netPay: '100.00' },
          { id: 2, employeeId: 12, netPay: '250.50' },
        ],
        update: jest.fn(),
      },
      runRepository: {
        findOne: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        manager: {
          getRepository: () => ({
            create: (value: unknown) => value,
            save: async (value: unknown) => reconciliations.push(value),
          }),
        },
      },
    });
    return { service, finance, reconciliations };
  }

  it('records evidence and posts loans per paid employee', async () => {
    const { service, finance, reconciliations } = build({
      id: 4,
      payrollPeriodId: 3,
      status: PayrollRunStatusEnum.LOCKED,
      createdByCompanyUserId: 2,
    });
    await service.markPaid(actor, 4, evidence);
    expect(reconciliations[0]).toMatchObject({
      paymentReference: 'CRDB-123',
      status: 'MANUAL_CONFIRMED',
      paidAmount: '350.50',
    });
    expect(finance.postForPaidPayrollResult).toHaveBeenCalledTimes(2);
  });

  it('requires evidence and blocks the preparer', async () => {
    const run = {
      id: 4,
      status: PayrollRunStatusEnum.LOCKED,
      createdByCompanyUserId: 9,
    };
    await expect(
      build(run).service.markPaid(actor, 4, {
        ...evidence,
        payment_reference: ' ',
      }),
    ).rejects.toThrow(
      'Payment reference, payment date and a confirmation note',
    );
    await expect(
      build(run).service.markPaid(actor, 4, evidence),
    ).rejects.toThrow('The payroll preparer cannot confirm payment');
  });
});

describe('PayrollInputService cutoff', () => {
  const actor = { id: 9, companyMembershipId: 9 } as any;
  function build(period: Record<string, unknown>) {
    const saved: any[] = [];
    const audit = { log: jest.fn() };
    const service = Object.create(
      PayrollInputService.prototype,
    ) as PayrollInputService;
    Object.assign(service as any, {
      hrAccessService: { ensureActorCompanyId: () => 1 },
      auditService: audit,
      periodRepository: { findOne: async () => period },
      repository: {
        create: (value: unknown) => value,
        save: async (value: any) => {
          saved.push(value);
          return { id: 1, ...value };
        },
      },
    });
    return { service, saved, audit };
  }
  const dto = {
    payroll_period_id: 3,
    employee_id: 11,
    component_code: 'bonus',
    amount: '1000.00',
  } as any;

  it('accepts inputs before the cutoff', async () => {
    const { service, saved } = build({
      id: 3,
      status: 'OPEN',
      cutoffDate: '2999-12-31',
    });
    await service.create(actor, dto);
    expect(saved[0].payload).toBeNull();
  });

  it('requires a reason after the cutoff and marks the late adjustment', async () => {
    const period = { id: 3, status: 'OPEN', cutoffDate: '2000-01-01' };
    await expect(build(period).service.create(actor, dto)).rejects.toThrow(
      /cutoff has passed/,
    );
    const { service, saved, audit } = build(period);
    await service.create(actor, {
      ...dto,
      late_adjustment_reason: 'Approved bonus received late',
    });
    expect(saved[0].payload.late_adjustment).toMatchObject({
      reason: 'Approved bonus received late',
      cutoff_date: '2000-01-01',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payroll.input.late_adjustment_created',
      }),
    );
  });
});

describe('PayrollBankService payment progress and retry', () => {
  const actor = { id: 9, companyMembershipId: 9 } as any;
  const { PayrollBankService } = jest.requireActual('./payroll-core.services');

  function build(options: {
    runStatus?: PayrollRunStatusEnum;
    lines: Array<Record<string, unknown>>;
    importAfterBatch?: boolean;
  }) {
    const savedBatches: any[] = [];
    const service = Object.create(PayrollBankService.prototype);
    Object.assign(service, {
      hrAccessService: { ensureActorCompanyId: () => 1 },
      auditService: { log: jest.fn() },
      runRepository: {
        findOne: async () => ({
          id: 7,
          runNo: 'PR-1-000007',
          status:
            options.runStatus ?? PayrollRunStatusEnum.PAYMENT_FILE_GENERATED,
        }),
      },
      resultRepository: {
        find: async () => [
          {
            employeeId: 1,
            netPay: '100.00',
            status: 'LOCKED',
            employeeSnapshot: {},
          },
          {
            employeeId: 2,
            netPay: '200.00',
            status: 'LOCKED',
            employeeSnapshot: {},
          },
          {
            employeeId: 3,
            netPay: '300.00',
            status: 'PAID',
            employeeSnapshot: {},
          },
        ],
      },
      paymentImportLineRepository: { find: async () => options.lines },
      batchRepository: {
        find: async () => [
          {
            batchType: 'INTERNAL',
            createdAt: new Date('2026-11-25T08:00:00Z'),
          },
        ],
        create: (value: unknown) => value,
        save: async (value: any) => {
          savedBatches.push(value);
          return { id: 99, ...value };
        },
      },
      paymentImportRepository: {
        findOne: async () => ({
          id: 5,
          createdAt: new Date(
            options.importAfterBatch === false
              ? '2026-11-24T08:00:00Z'
              : '2026-11-26T08:00:00Z',
          ),
        }),
      },
    });
    return { service, savedBatches };
  }

  const lines = [
    { employeeId: 1, matchStatus: 'FAILED', amount: '0.00' },
    { employeeId: 2, matchStatus: 'PARTIAL', amount: '150.00' },
    { employeeId: 3, matchStatus: 'MATCHED', amount: '300.00' },
  ];

  it('reports failed, partial and paid employees with outstanding amounts', async () => {
    const progress = await build({ lines }).service.paymentProgress(actor, 7);
    expect(progress).toMatchObject({
      payment_state: 'PARTIALLY_PAID',
      paid_count: 1,
      partially_paid_count: 1,
      failed_count: 1,
      outstanding_total: '150.00',
    });
  });

  it('retries only outstanding amounts under new references', async () => {
    const { service, savedBatches } = build({ lines });
    await service.generateRetry(actor, 7, { reason: 'Account corrected' });
    expect(savedBatches[0]).toMatchObject({
      batchType: 'RETRY-1',
      recordCount: 2,
      totalAmount: '150.00',
    });
    expect(savedBatches[0].fileContent).toContain('PAY-PR-1-000007-1-R1');
    expect(savedBatches[0].fileContent).not.toContain('PAY-PR-1-000007-3-R1');
  });

  it('blocks a retry until the previous file is reconciled', async () => {
    await expect(
      build({ lines, importAfterBatch: false }).service.generateRetry(
        actor,
        7,
        {
          reason: 'x',
        },
      ),
    ).rejects.toThrow('Import the bank statement');
  });
});

describe('PayrollReportsService statutory scheme schedules', () => {
  it('selects SDL and health-insurance lines by the applied rule scheme type', async () => {
    const service = Object.create(PayrollReportsService.prototype);
    service.lineRepository = {
      manager: {
        getRepository: (entity: any) => ({
          find: async () =>
            entity.name === 'StatutoryRuleVersion'
              ? [
                  {
                    id: 1,
                    schemeId: 10,
                    versionNumber: 2,
                    effectiveFrom: '2026-07-01',
                  },
                  {
                    id: 2,
                    schemeId: 20,
                    versionNumber: 1,
                    effectiveFrom: '2026-01-01',
                  },
                ]
              : [
                  {
                    id: 10,
                    code: 'SDL',
                    name: 'Skills Development Levy',
                    schemeType: 'EMPLOYER_LEVY',
                  },
                  {
                    id: 20,
                    code: 'NHIF',
                    name: 'Health',
                    schemeType: 'HEALTH_INSURANCE',
                  },
                ],
        }),
      },
    };
    const lines = [
      {
        employeeId: 1,
        sourceType: 'STATUTORY',
        sourceReference: '1',
        componentCode: 'SDL_ER',
        amount: '0.00',
        employerAmount: '35000.00',
        calculationSnapshot: { basis: '1000000.00', rate: '3.500000' },
      },
      {
        employeeId: 1,
        sourceType: 'STATUTORY',
        sourceReference: '2',
        componentCode: 'NHIF_EE',
        amount: '30000.00',
        employerAmount: '0.00',
        calculationSnapshot: {},
      },
      {
        employeeId: 1,
        sourceType: 'INPUT',
        sourceReference: '1',
        componentCode: 'BONUS',
        amount: '5.00',
        employerAmount: '0.00',
      },
    ];
    const results = [
      {
        employeeId: 1,
        employeeSnapshot: { employee_no: 'E1', full_name: 'A B' },
      },
    ];
    const sdl = await service.buildStatutorySchemeRows(
      1,
      'EMPLOYER_LEVY',
      results,
      lines,
    );
    expect(sdl).toEqual([
      expect.objectContaining({
        scheme_code: 'SDL',
        rule_version_number: 2,
        basis: '1000000.00',
        rate: '3.500000',
        employer_amount: '35000.00',
      }),
    ]);
    const health = await service.buildStatutorySchemeRows(
      1,
      'HEALTH_INSURANCE',
      results,
      lines,
    );
    expect(health.map((row: any) => row.scheme_code)).toEqual(['NHIF']);
  });
});

describe('PayrollBankService statement import status gate', () => {
  const actor = { id: 9, companyMembershipId: 9 } as any;
  const { PayrollBankService } = jest.requireActual('./payroll-core.services');
  it.each([
    PayrollRunStatusEnum.DRAFT,
    PayrollRunStatusEnum.PENDING_HR_APPROVAL,
    PayrollRunStatusEnum.APPROVED,
    PayrollRunStatusEnum.CLOSED,
  ])('refuses to import a statement for a %s run', async (status) => {
    const service = Object.create(PayrollBankService.prototype);
    Object.assign(service, {
      hrAccessService: { ensureActorCompanyId: () => 1 },
      runRepository: { findOne: async () => ({ id: 1, status }) },
    });
    await expect(
      service.importStatement(actor, {
        payroll_run_id: 1,
        rows: [{ employee_id: 1, amount: '1.00', status: 'SUCCESS' }],
      }),
    ).rejects.toThrow('only be imported for locked payroll');
  });
});
