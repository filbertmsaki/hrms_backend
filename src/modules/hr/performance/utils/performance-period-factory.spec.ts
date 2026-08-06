import { PerformancePeriodFactory } from './performance-period-factory';

describe('PerformancePeriodFactory', () => {
  it('builds monthly periods across a financial year boundary window', () => {
    const factory = new PerformancePeriodFactory();

    const periods = factory.buildMonthlyPeriods('2026-07-15', '2026-09-30');

    expect(periods).toHaveLength(3);
    expect(periods[0]).toMatchObject({
      name: 'July 2026',
      startDate: '2026-07-15',
      endDate: '2026-07-31',
    });
    expect(periods[2]).toMatchObject({
      name: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });

  it('groups monthly periods into quarters', () => {
    const factory = new PerformancePeriodFactory();

    const monthly = factory.buildMonthlyPeriods('2026-01-01', '2026-06-30');
    const quarters = factory.buildQuarterlyPeriods(monthly);

    expect(quarters).toHaveLength(2);
    expect(quarters[0]).toMatchObject({
      name: 'Q1 2026',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
    expect(quarters[1]).toMatchObject({
      name: 'Q2 2026',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    });
  });
});
