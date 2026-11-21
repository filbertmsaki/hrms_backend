import {
  calculateAttendanceDeductions,
  validateAttendanceDeductionRules,
} from './payroll-attendance-deductions.util';
import { buildSalarySegments } from './payroll-salary-segments.util';

const segments = buildSalarySegments({
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  versions: [
    {
      id: 1,
      baseSalary: '3000.00',
      effectiveFrom: '2025-01-01',
      effectiveTo: '2026-11-15',
    },
    {
      id: 2,
      baseSalary: '6000.00',
      effectiveFrom: '2026-11-16',
      effectiveTo: null,
    },
  ],
});
const finalized = new Date();
const day = (date: string, status: string, late = 0, early = 0) => ({
  attendanceDate: date,
  attendanceStatus: status,
  lateMinutes: late,
  earlyDepartureMinutes: early,
  finalizedAt: finalized,
});

describe('calculateAttendanceDeductions', () => {
  const base = {
    employeeId: 7,
    leaveSpans: [] as Array<{ start: string; end: string }>,
    segments,
    basicPay: '4500.00',
  };

  it('deducts nothing when every rule is disabled (the default)', () => {
    expect(
      calculateAttendanceDeductions({
        ...base,
        rules: { standard_minutes_per_day: 480 },
        days: [day('2026-11-03', 'ABSENT'), day('2026-11-04', 'LATE', 60)],
      }),
    ).toEqual([]);
  });

  it('charges absence at the salary in force that day and skips leave days and unverified records', () => {
    const lines = calculateAttendanceDeductions({
      ...base,
      leaveSpans: [{ start: '2026-11-05', end: '2026-11-05' }],
      rules: {
        standard_minutes_per_day: 480,
        unauthorized_absence: { enabled: true },
      },
      days: [
        day('2026-11-03', 'ABSENT'), // 3000/30 = 100
        day('2026-11-05', 'ABSENT'), // on approved leave: skipped
        day('2026-11-20', 'ABSENT'), // 6000/30 = 200
        { ...day('2026-11-21', 'ABSENT'), finalizedAt: null }, // unverified
      ],
    });
    expect(lines).toEqual([
      expect.objectContaining({
        code: 'ATTENDANCE_ABSENCE',
        amount: '300.00',
        days: 2,
        dates: ['2026-11-03', '2026-11-20'],
      }),
    ]);
  });

  it('applies lateness only beyond grace and the monthly threshold', () => {
    const lines = calculateAttendanceDeductions({
      ...base,
      rules: {
        standard_minutes_per_day: 480,
        lateness: {
          enabled: true,
          grace_minutes: 10,
          monthly_threshold_minutes: 30,
        },
      },
      days: [day('2026-11-03', 'LATE', 40), day('2026-11-04', 'LATE', 250)],
    });
    // (40-10)=30 consumed by threshold; (250-10)=240 min = 0.5 day × 100
    expect(lines).toEqual([
      expect.objectContaining({ code: 'ATTENDANCE_LATENESS', amount: '50.00' }),
    ]);
  });

  it('respects exemptions and the monthly cap', () => {
    const rules = {
      standard_minutes_per_day: 480,
      unauthorized_absence: { enabled: true },
      monthly_cap_percent_of_basic: 2,
    };
    const days = [day('2026-11-03', 'ABSENT'), day('2026-11-04', 'ABSENT')];
    expect(
      calculateAttendanceDeductions({ ...base, rules, days })[0].amount,
    ).toBe('90.00');
    expect(
      calculateAttendanceDeductions({
        ...base,
        rules: { ...rules, exempt_employee_ids: [7] },
        days,
      }),
    ).toEqual([]);
  });

  it('validates rule configuration', () => {
    expect(
      validateAttendanceDeductionRules({
        standard_minutes_per_day: 0,
        monthly_cap_percent_of_basic: 150,
      }),
    ).toHaveLength(2);
  });
});
