import { StatutoryTaxBand } from '../entities/payroll-configuration.entities';
import {
  PayrollApprovalStageEnum,
  PayrollRunStatusEnum,
} from '../payroll.enums';
import {
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
