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
  PayrollRunStatusEnum,
} from '../payroll.enums';
import {
  EmployeePayrollCalculationService,
  PayrollAccountingService,
  PayrollFinalSettlementService,
  PayrollProrationService,
  PayrollReportsService,
  PayrollRunService,
  ProgressiveTaxService,
} from './payroll-core.services';

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
    service.repository = {
      findOne: jest.fn().mockResolvedValue(null),
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
    };
    service.settlementItemRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          item_type: 'leave_payout',
          amount: '500.00',
        },
        {
          id: 2,
          item_type: OffboardingSettlementItemTypeEnum.LOAN_RECOVERY,
          amount: '120.00',
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
        grossSettlement: '500.00',
        deductionTotal: '-200.00',
        netSettlement: '300.00',
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
