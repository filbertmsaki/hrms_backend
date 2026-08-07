import { EmployeeFinanceInterestMethodEnum } from '../employee-finance.enums';
import {
  EmployeeFinanceInterestService,
  EmployeeFinanceScheduleItem,
} from './employee-finance-core.services';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

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
