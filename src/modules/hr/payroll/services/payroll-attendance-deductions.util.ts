import { PayrollMoney } from './payroll-money.util';
import {
  CompensationLike,
  SalarySegment,
} from './payroll-salary-segments.util';

/**
 * Attendance deduction rules. Every money-affecting rule is opt-in and is
 * applied only from an ACTIVE policy (independently approved, with a recorded
 * legal review reference). Lateness and early departure are recorded and
 * reported regardless; they only reduce pay when their rule is enabled.
 */
export type AttendanceDeductionRules = {
  /** Working minutes in a normal day, used to turn minutes into a day fraction. */
  standard_minutes_per_day: number;
  unauthorized_absence?: { enabled: boolean };
  half_day?: { enabled: boolean; day_fraction?: number };
  lateness?: {
    enabled: boolean;
    grace_minutes?: number;
    /** Minutes late in the month before any deduction starts. */
    monthly_threshold_minutes?: number;
  };
  early_departure?: {
    enabled: boolean;
    grace_minutes?: number;
    monthly_threshold_minutes?: number;
  };
  /** Total attendance deductions may not exceed this % of basic pay. */
  monthly_cap_percent_of_basic?: number | null;
  exempt_employee_ids?: number[];
};

export type AttendanceDayRecord = {
  attendanceDate: string;
  attendanceStatus: string;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  finalizedAt: Date | null;
};

export type AttendanceDeductionLine = {
  code:
    | 'ATTENDANCE_ABSENCE'
    | 'ATTENDANCE_HALF_DAY'
    | 'ATTENDANCE_LATENESS'
    | 'ATTENDANCE_EARLY_DEPARTURE';
  name: string;
  amount: string;
  days: number;
  dates: string[];
};

const LATE_STATUSES = new Set(['LATE', 'LATE_AND_EARLY_DEPARTURE']);
const EARLY_STATUSES = new Set(['EARLY_DEPARTURE', 'LATE_AND_EARLY_DEPARTURE']);

function within(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export function validateAttendanceDeductionRules(
  rules: AttendanceDeductionRules,
) {
  const problems: string[] = [];
  if (
    !Number.isFinite(rules.standard_minutes_per_day) ||
    rules.standard_minutes_per_day <= 0
  ) {
    problems.push('standard_minutes_per_day must be a positive number.');
  }
  const fraction = rules.half_day?.day_fraction;
  if (fraction !== undefined && (fraction <= 0 || fraction > 1)) {
    problems.push('half_day.day_fraction must be between 0 and 1.');
  }
  for (const key of ['lateness', 'early_departure'] as const) {
    const rule = rules[key];
    if (!rule) continue;
    if (
      (rule.grace_minutes ?? 0) < 0 ||
      (rule.monthly_threshold_minutes ?? 0) < 0
    ) {
      problems.push(`${key} grace and threshold cannot be negative.`);
    }
  }
  const cap = rules.monthly_cap_percent_of_basic;
  if (cap !== undefined && cap !== null && (cap <= 0 || cap > 100)) {
    problems.push('monthly_cap_percent_of_basic must be between 0 and 100.');
  }
  return problems;
}

/**
 * Computes attendance deductions for one employee and period.
 * - only finalized (verified) attendance counts;
 * - days covered by approved leave are skipped, so unpaid leave is never
 *   deducted twice and paid leave never deducted;
 * - each day is charged at the salary segment in force on that date, with the
 *   payroll proration divisor; days outside employment have no segment.
 */
export function calculateAttendanceDeductions<
  T extends CompensationLike,
>(args: {
  employeeId: number;
  rules: AttendanceDeductionRules;
  days: AttendanceDayRecord[];
  leaveSpans: Array<{ start: string; end: string }>;
  segments: SalarySegment<T>[];
  basicPay: string;
}): AttendanceDeductionLine[] {
  const { rules } = args;
  if ((rules.exempt_employee_ids ?? []).includes(args.employeeId)) return [];
  const segmentFor = (date: string) =>
    args.segments.find((segment) => within(date, segment.start, segment.end));
  const onLeave = (date: string) =>
    args.leaveSpans.some((span) => within(date, span.start, span.end));
  const dailyRate = (date: string) => {
    const segment = segmentFor(date);
    return segment
      ? {
          salary: segment.compensation.baseSalary,
          divisor: segment.denominator,
        }
      : null;
  };
  const verified = args.days.filter(
    (day) =>
      day.finalizedAt && !onLeave(String(day.attendanceDate).slice(0, 10)),
  );

  const lines: AttendanceDeductionLine[] = [];
  const addDayFractions = (
    code: AttendanceDeductionLine['code'],
    name: string,
    entries: Array<{ date: string; fraction: number }>,
  ) => {
    let amount = '0.00';
    let days = 0;
    const dates: string[] = [];
    for (const entry of entries) {
      const rate = dailyRate(entry.date);
      if (!rate || entry.fraction <= 0) continue;
      amount = PayrollMoney.add(
        amount,
        PayrollMoney.multiplyRatio(
          rate.salary,
          Number(entry.fraction.toFixed(6)),
          rate.divisor,
        ),
      );
      days += entry.fraction;
      dates.push(entry.date);
    }
    if (PayrollMoney.toCents(amount) > 0n) {
      lines.push({ code, name, amount, days: Number(days.toFixed(4)), dates });
    }
  };

  if (rules.unauthorized_absence?.enabled) {
    addDayFractions(
      'ATTENDANCE_ABSENCE',
      'Unauthorised absence',
      verified
        .filter((day) => day.attendanceStatus === 'ABSENT')
        .map((day) => ({
          date: String(day.attendanceDate).slice(0, 10),
          fraction: 1,
        })),
    );
  }
  if (rules.half_day?.enabled) {
    const fraction = rules.half_day.day_fraction ?? 0.5;
    addDayFractions(
      'ATTENDANCE_HALF_DAY',
      'Half-day attendance',
      verified
        .filter((day) => day.attendanceStatus === 'HALF_DAY')
        .map((day) => ({
          date: String(day.attendanceDate).slice(0, 10),
          fraction,
        })),
    );
  }
  const minutesRule = (
    key: 'lateness' | 'early_departure',
    statuses: Set<string>,
    pick: (day: AttendanceDayRecord) => number,
    code: AttendanceDeductionLine['code'],
    name: string,
  ) => {
    const rule = rules[key];
    if (!rule?.enabled) return;
    const grace = rule.grace_minutes ?? 0;
    const perDay = verified
      .filter((day) => statuses.has(day.attendanceStatus))
      .map((day) => ({
        date: String(day.attendanceDate).slice(0, 10),
        minutes: Math.max(0, Number(pick(day) ?? 0) - grace),
      }))
      .filter((entry) => entry.minutes > 0);
    let threshold = rule.monthly_threshold_minutes ?? 0;
    const charged = perDay.map((entry) => {
      const consumed = Math.min(threshold, entry.minutes);
      threshold -= consumed;
      return {
        date: entry.date,
        fraction: (entry.minutes - consumed) / rules.standard_minutes_per_day,
      };
    });
    addDayFractions(code, name, charged);
  };
  minutesRule(
    'lateness',
    LATE_STATUSES,
    (day) => day.lateMinutes,
    'ATTENDANCE_LATENESS',
    'Lateness',
  );
  minutesRule(
    'early_departure',
    EARLY_STATUSES,
    (day) => day.earlyDepartureMinutes,
    'ATTENDANCE_EARLY_DEPARTURE',
    'Early departure',
  );

  // Cap the total, trimming the last lines first.
  const capPercent = rules.monthly_cap_percent_of_basic;
  let cap =
    capPercent !== undefined && capPercent !== null
      ? PayrollMoney.toCents(
          PayrollMoney.multiplyPercent(args.basicPay, String(capPercent)),
        )
      : PayrollMoney.toCents(args.basicPay);
  return lines
    .map((line) => {
      const cents = PayrollMoney.toCents(line.amount);
      const applied = cents < cap ? cents : cap;
      cap -= applied;
      return { ...line, amount: PayrollMoney.fromCents(applied) };
    })
    .filter((line) => PayrollMoney.toCents(line.amount) > 0n);
}
