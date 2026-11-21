import {
  allocateUnpaidDaysToSegments,
  buildSalarySegments,
} from './payroll-salary-segments.util';
import { PayrollMoney } from './payroll-money.util';

const v = (
  id: number,
  baseSalary: string,
  effectiveFrom: string,
  effectiveTo: string | null = null,
) => ({ id, baseSalary, effectiveFrom, effectiveTo });

function pay(segments: ReturnType<typeof buildSalarySegments>) {
  return PayrollMoney.add(
    ...segments.map((s) =>
      PayrollMoney.multiplyRatio(
        s.compensation.baseSalary,
        s.numerator,
        s.denominator,
      ),
    ),
  );
}

describe('buildSalarySegments', () => {
  const nov = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };

  it('splits an increment effective on the 16th without gaps or overlap', () => {
    const segments = buildSalarySegments({
      ...nov,
      versions: [
        v(1, '3000000.00', '2025-01-01', '2026-11-15'),
        v(2, '3600000.00', '2026-11-16'),
      ],
    });
    expect(segments.map((s) => [s.start, s.end, s.days])).toEqual([
      ['2026-11-01', '2026-11-15', 15],
      ['2026-11-16', '2026-11-30', 15],
    ]);
    // 3,000,000 × 15/30 + 3,600,000 × 15/30
    expect(pay(segments)).toBe('3300000.00');
  });

  it('clips an unclosed predecessor at the next version start', () => {
    const segments = buildSalarySegments({
      ...nov,
      versions: [v(1, '1000.00', '2025-01-01'), v(2, '2000.00', '2026-11-11')],
    });
    expect(segments.map((s) => s.days)).toEqual([10, 20]);
  });

  it('pays a mid-month joiner only from the hire date', () => {
    const segments = buildSalarySegments({
      ...nov,
      hireDate: '2026-11-15',
      versions: [v(1, '3000000.00', '2026-11-15')],
    });
    expect(segments[0]).toMatchObject({ start: '2026-11-15', days: 16 });
    expect(pay(segments)).toBe('1600000.00');
  });

  it('stops a leaver at the exit date even across a salary change', () => {
    const segments = buildSalarySegments({
      ...nov,
      exitDate: '2026-11-20',
      versions: [
        v(1, '3000.00', '2025-01-01', '2026-11-09'),
        v(2, '6000.00', '2026-11-10'),
      ],
    });
    expect(segments.map((s) => s.days)).toEqual([9, 11]);
  });

  it('returns nothing when employment does not touch the period', () => {
    expect(
      buildSalarySegments({
        ...nov,
        exitDate: '2026-10-31',
        versions: [v(1, '1.00', '2025-01-01')],
      }),
    ).toEqual([]);
  });

  it('FIXED_30 pays a fully covered 31-day month exactly 30/30', () => {
    const segments = buildSalarySegments({
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
      method: 'FIXED_30',
      versions: [
        v(1, '3000.00', '2025-01-01', '2026-12-15'),
        v(2, '3000.00', '2026-12-16'),
      ],
    });
    expect(segments.reduce((sum, s) => sum + s.numerator, 0)).toBe(30);
    expect(pay(segments)).toBe('3000.00');
  });

  it('FIXED_30 pays a full February 30/30', () => {
    const segments = buildSalarySegments({
      periodStart: '2027-02-01',
      periodEnd: '2027-02-28',
      method: 'FIXED_30',
      versions: [v(1, '3000.00', '2025-01-01')],
    });
    expect(pay(segments)).toBe('3000.00');
  });
});

describe('allocateUnpaidDaysToSegments', () => {
  it('charges each unpaid day at the salary in force on that day', () => {
    const segments = buildSalarySegments({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      versions: [
        v(1, '3000.00', '2025-01-01', '2026-11-15'),
        v(2, '6000.00', '2026-11-16'),
      ],
    });
    const allocation = allocateUnpaidDaysToSegments(segments, [
      { start: '2026-11-14', end: '2026-11-17', unpaidEquivalentDays: 4 },
    ]);
    expect(allocation).toEqual([2, 2]);
  });

  it('ignores unpaid leave outside the employment window', () => {
    const segments = buildSalarySegments({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      hireDate: '2026-11-15',
      versions: [v(1, '3000.00', '2026-11-15')],
    });
    const allocation = allocateUnpaidDaysToSegments(segments, [
      { start: '2026-11-10', end: '2026-11-19', unpaidEquivalentDays: 10 },
    ]);
    // Only 15th–19th fall inside employment.
    expect(allocation).toEqual([5]);
  });
});
