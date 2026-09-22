import { StatutoryTaxBand } from '../entities/payroll-configuration.entities';
import {
  PayrollApprovalStageEnum,
  PayrollRunStatusEnum,
} from '../payroll.enums';
import {
  EmployeePayrollCalculationService,
  PayrollProrationService,
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
