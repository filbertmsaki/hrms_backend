import { EmployeePayrollCalculationService } from './payroll-core.services';

type Split = { paidEquivalentDays: number; unpaidEquivalentDays: number };
const service = Object.create(EmployeePayrollCalculationService.prototype) as {
  leavePayrollSplit(days: number, type: object, rule?: object): Split;
};
const rule = (over: Record<string, string | null>) => ({
  paidPercentage: '100',
  paidDaysCap: null,
  halfPayAfterDays: null,
  unpaidAfterDays: null,
  ...over,
});

describe('payroll leave rule split', () => {
  it('treats unset thresholds as unset, not zero (regression)', () => {
    expect(service.leavePayrollSplit(5, {}, rule({}))).toEqual({
      paidEquivalentDays: 5,
      unpaidEquivalentDays: 0,
    });
    expect(
      service.leavePayrollSplit(5, {}, rule({ unpaidAfterDays: '' })),
    ).toEqual({ paidEquivalentDays: 5, unpaidEquivalentDays: 0 });
  });

  it('still applies configured thresholds', () => {
    expect(
      service.leavePayrollSplit(10, {}, rule({ unpaidAfterDays: '6' })),
    ).toEqual({ paidEquivalentDays: 6, unpaidEquivalentDays: 4 });
    expect(
      service.leavePayrollSplit(
        10,
        {},
        rule({ paidDaysCap: '4', halfPayAfterDays: '0' }),
      ),
    ).toEqual({ paidEquivalentDays: 7, unpaidEquivalentDays: 3 });
  });
});
