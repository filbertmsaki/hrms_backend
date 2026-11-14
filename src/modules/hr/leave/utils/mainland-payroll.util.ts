import type { EntityManager } from 'typeorm';
import {
  addDays,
  holidayWorkPay,
  round4,
  type MainlandPolicy,
} from './mainland-leave-engine';

/**
 * Payroll-facing reads of the Mainland ledger. They take an EntityManager so
 * payroll can call them without a module dependency on leave services.
 */

/** True when the employee has an effective Mainland assignment on `date`. */
export async function isMainlandOn(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  date: string,
) {
  const rows = await m.query<{ jurisdiction: string }[]>(
    `SELECT r.jurisdiction FROM leave_policy_assignments a
       JOIN LATERAL (SELECT jurisdiction FROM leave_policy_revisions r
                      WHERE r.policy_id = a.policy_id AND r.effective_date <= $3 AND r.withdrawn_at IS NULL
                      ORDER BY r.effective_date DESC, r.id DESC LIMIT 1) r ON true
      WHERE a.company_id = $1 AND a.employee_id = $2 AND a.effective_date <= $3
      ORDER BY a.effective_date DESC, a.id DESC LIMIT 1`,
    [companyId, employeeId, date],
  );
  return rows[0]?.jurisdiction === 'mainland';
}

export type LeavePayAllocation = {
  days: number;
  paidEquivalentDays: number;
  unpaidEquivalentDays: number;
  byRate: { pay_rate: number; days: number }[];
};

/**
 * Per-request pay allocation for dates inside [start, end] from TAKEN rows
 * that are not reversed (re-posts after early return included). Each row's
 * units are spread evenly over its dates, so half days stay half days.
 */
export async function mainlandLeaveAllocation(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  start: string,
  end: string,
) {
  const rows = await m.query<
    {
      leave_request_id: number;
      amount_days: string;
      pay_rate: string | null;
      metadata: { dates?: string[] } | null;
    }[]
  >(
    `SELECT l.id, l.leave_request_id, l.amount_days, l.pay_rate, l.metadata
       FROM leave_ledger_entries l
      WHERE l.company_id = $1 AND l.employee_id = $2 AND l.entry_type = 'TAKEN' AND l.leave_request_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM leave_ledger_entries r WHERE r.reverses_entry_id = l.id)`,
    [companyId, employeeId],
  );
  const out = new Map<number, LeavePayAllocation>();
  for (const r of rows) {
    const dates = r.metadata?.dates ?? [];
    if (!dates.length) continue;
    const perDate = -Number(r.amount_days) / dates.length;
    const inside = dates.filter((d) => d >= start && d <= end).length;
    if (!inside) continue;
    const days = round4(inside * perDate);
    const rate = r.pay_rate == null ? 1 : Number(r.pay_rate);
    const a = out.get(r.leave_request_id) ?? {
      days: 0,
      paidEquivalentDays: 0,
      unpaidEquivalentDays: 0,
      byRate: [],
    };
    a.days = round4(a.days + days);
    a.paidEquivalentDays = round4(a.paidEquivalentDays + days * rate);
    a.unpaidEquivalentDays = round4(a.unpaidEquivalentDays + days * (1 - rate));
    const slot = a.byRate.find((x) => x.pay_rate === rate);
    if (slot) slot.days = round4(slot.days + days);
    else a.byRate.push({ pay_rate: rate, days });
    out.set(r.leave_request_id, a);
  }
  return out;
}

/**
 * Unauthorized absence: ABSENT attendance on working days not covered by
 * approved leave (any type), a public holiday, or an attendance exemption.
 * Returns the unpaid dates (fed to payroll once per date) and consecutive runs.
 */
export async function mainlandUnauthorizedAbsence(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  start: string,
  end: string,
  flagAfter: number,
) {
  const absent = await m.query<{ d: string }[]>(
    `SELECT s.attendance_date::text AS d FROM attendance_daily_summaries s
      WHERE s.company_id = $1 AND s.employee_id = $2 AND s.attendance_date BETWEEN $3 AND $4
        AND upper(s.attendance_status) = 'ABSENT'
        AND NOT EXISTS (SELECT 1 FROM leave_requests r WHERE r.company_id = s.company_id AND r.employee_id = s.employee_id
                         AND r.status = 'approved' AND s.attendance_date BETWEEN r.start_date AND r.end_date)
        AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.company_id = s.company_id AND h.holiday_date = s.attendance_date)
        AND NOT EXISTS (SELECT 1 FROM attendance_holidays ah WHERE ah.company_id = s.company_id AND ah.date = s.attendance_date AND ah.counts_as_working_day = false)
        AND coalesce((s.flags::jsonb ->> 'isHoliday')::boolean, false) = false
        AND coalesce((s.flags::jsonb ->> 'isOffDay')::boolean, false) = false
        AND coalesce((s.flags::jsonb ->> 'exempt')::boolean, false) = false
      ORDER BY s.attendance_date`,
    [companyId, employeeId, start, end],
  );
  const working = await m.query<{ d: string }[]>(
    `SELECT s.attendance_date::text AS d FROM attendance_daily_summaries s
      WHERE s.company_id = $1 AND s.employee_id = $2 AND s.attendance_date BETWEEN $3 AND $4
        AND upper(s.attendance_status) NOT IN ('OFF_DAY','HOLIDAY','OFF_DAY_PRESENT')
      ORDER BY s.attendance_date`,
    [companyId, employeeId, start, end],
  );
  const absentSet = new Set(absent.map((x) => x.d));
  const runs: {
    start: string;
    end: string;
    workingDays: number;
    flagHr: boolean;
  }[] = [];
  type Run = { start: string; end: string; workingDays: number };
  let cur = null as Run | null;
  for (const { d } of working) {
    if (absentSet.has(d))
      cur = cur
        ? { ...cur, end: d, workingDays: cur.workingDays + 1 }
        : { start: d, end: d, workingDays: 1 };
    else if (cur) {
      runs.push({ ...cur, flagHr: cur.workingDays > flagAfter });
      cur = null;
    }
  }
  const last: Run | null = cur;
  if (last) runs.push({ ...last, flagHr: last.workingDays > flagAfter });
  return { unpaidDates: [...absentSet].sort(), runs };
}

export type MonthlyWage =
  | {
      ok: true;
      monthlyBasic: number;
      currency: string;
      payFrequency: string;
      compensationVersionId: number;
    }
  | { ok: false; reason: string };

/**
 * Effective monthly basic wage. Non-monthly frequencies are converted
 * explicitly; hourly/daily pay needs HR-provided scheduled hours, so it is
 * reported instead of guessed.
 */
export async function resolveMonthlyBasicWage(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  date: string,
): Promise<MonthlyWage> {
  const rows = await m.query<
    {
      id: number;
      base_salary: string;
      currency: string;
      pay_frequency: string;
    }[]
  >(
    `SELECT id, base_salary, currency, pay_frequency FROM employee_compensation_versions
      WHERE company_id = $1 AND employee_id = $2 AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $3)
        AND status IN ('ACTIVE','SCHEDULED','SUPERSEDED')
      ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [companyId, employeeId, date],
  );
  const r = rows[0];
  if (!r) return { ok: false, reason: `No compensation effective on ${date}` };
  const base = Number(r.base_salary);
  const factor: Record<string, number> = {
    MONTHLY: 1,
    SEMI_MONTHLY: 2,
    BIWEEKLY: 26 / 12,
    BI_WEEKLY: 26 / 12,
    WEEKLY: 52 / 12,
    ANNUAL: 1 / 12,
    YEARLY: 1 / 12,
  };
  const f = factor[String(r.pay_frequency).toUpperCase()];
  if (!f)
    return {
      ok: false,
      reason: `Pay frequency ${r.pay_frequency} needs an explicit monthly conversion`,
    };
  return {
    ok: true,
    monthlyBasic: Math.round(base * f * 100) / 100,
    currency: r.currency,
    payFrequency: r.pay_frequency,
    compensationVersionId: r.id,
  };
}

/** Return-to-work restriction after birth; override needs certificate + reason. */
export async function postBirthRestriction(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  date: string,
  restrictionWeeks: number,
) {
  const births = await m.query<{ id: number; d: string }[]>(
    `SELECT id, event_date::text AS d FROM leave_life_events
      WHERE company_id = $1 AND employee_id = $2 AND event_type = 'birth' AND event_date <= $3 AND event_date > $3::date - ($4 * 7)
      ORDER BY event_date DESC LIMIT 1`,
    [companyId, employeeId, date, restrictionWeeks],
  );
  if (!births.length) return { restricted: false as const };
  const until = addDays(births[0].d, restrictionWeeks * 7 - 1);
  const override = await m.query<{ id: number }[]>(
    `SELECT id FROM leave_rule_overrides WHERE company_id = $1 AND employee_id = $2 AND rule_code = 'RETURN_TO_WORK'
       AND certificate_document_id IS NOT NULL AND (applies_on IS NULL OR applies_on <= $3) LIMIT 1`,
    [companyId, employeeId, date],
  );
  return {
    restricted: !override.length,
    until,
    overrideId: override[0]?.id ?? null,
    birthEventId: births[0].id,
  };
}

/** Effective Mainland rules for an employee on a date (raw read, no DI). */
export async function mainlandRulesOn(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  date: string,
) {
  const rows = await m.query<
    {
      rules: { maternity?: { return_restriction_weeks_after_birth?: number } };
      jurisdiction: string;
    }[]
  >(
    `SELECT r.rules, r.jurisdiction FROM leave_policy_assignments a
       JOIN LATERAL (SELECT rules, jurisdiction FROM leave_policy_revisions r
                      WHERE r.policy_id = a.policy_id AND r.effective_date <= $3 AND r.withdrawn_at IS NULL
                      ORDER BY r.effective_date DESC, r.id DESC LIMIT 1) r ON true
      WHERE a.company_id = $1 AND a.employee_id = $2 AND a.effective_date <= $3
      ORDER BY a.effective_date DESC, a.id DESC LIMIT 1`,
    [companyId, employeeId, date],
  );
  return rows[0]?.jurisdiction === 'mainland' ? rows[0].rules : null;
}

/**
 * Attendance guard: present/clock-in within the post-birth restriction needs
 * a fitness-certificate override. Returns a message when blocked.
 */
export async function returnToWorkBlock(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  date: string,
): Promise<string | null> {
  const rules = await mainlandRulesOn(m, companyId, employeeId, date);
  const weeks = rules?.maternity?.return_restriction_weeks_after_birth;
  if (!weeks) return null;
  const r = await postBirthRestriction(m, companyId, employeeId, date, weeks);
  return r.restricted
    ? `Attendance is blocked until ${r.until} after a recent birth; HR must record a fitness-certificate override first.`
    : null;
}

/** Today's date in the leave timezone (Africa/Dar_es_Salaam). */
export function leaveTodayDar(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Mainland public-holiday work: hours actually worked on a non-working public
 * holiday, paid at pay_multiplier x (monthly basic / scheduled monthly hours),
 * falling back to fallback_monthly_hours when no schedule is configured.
 * Payroll must drop these minutes from its holiday overtime so nothing is paid twice.
 */
export async function mainlandHolidayWork(
  m: EntityManager,
  companyId: number,
  employeeId: number,
  start: string,
  end: string,
  scheduledMonthlyHours: number | null,
) {
  const rules = (await mainlandRulesOn(
    m,
    companyId,
    employeeId,
    end,
  )) as unknown as MainlandPolicy | null;
  if (!rules?.public_holiday_work) return null;
  const days = await m.query<{ d: string; minutes: number }[]>(
    `SELECT s.attendance_date::text AS d, s.work_minutes::int AS minutes FROM attendance_daily_summaries s
      WHERE s.company_id = $1 AND s.employee_id = $2 AND s.attendance_date BETWEEN $3 AND $4 AND s.work_minutes > 0
        AND (EXISTS (SELECT 1 FROM attendance_holidays ah WHERE ah.company_id = s.company_id AND ah.date = s.attendance_date
                       AND ah.counts_as_working_day = false AND (ah.branch_id IS NULL OR ah.branch_id = s.branch_id))
             OR EXISTS (SELECT 1 FROM holidays h WHERE h.company_id = s.company_id AND h.holiday_date = s.attendance_date)
             OR coalesce((s.flags::jsonb ->> 'isHoliday')::boolean, false))
      ORDER BY s.attendance_date`,
    [companyId, employeeId, start, end],
  );
  if (!days.length) return null;
  const minutes = days.reduce((a, x) => a + x.minutes, 0);
  const wage = await resolveMonthlyBasicWage(m, companyId, employeeId, end);
  if (!wage.ok)
    return {
      minutes,
      dates: days.map((x) => x.d),
      amount: null,
      hourlyRate: null,
      issue: wage.reason,
      multiplier: rules.public_holiday_work.pay_multiplier,
      monthlyHours: null,
    };
  const monthlyHours =
    scheduledMonthlyHours && scheduledMonthlyHours > 0
      ? scheduledMonthlyHours
      : rules.public_holiday_work.fallback_monthly_hours;
  const pay = holidayWorkPay(rules, {
    hoursWorked: minutes / 60,
    monthlyBasicWage: wage.monthlyBasic,
    scheduledMonthlyHours: monthlyHours,
  });
  return {
    minutes,
    dates: days.map((x) => x.d),
    amount: pay.amount,
    hourlyRate: pay.hourlyRate,
    issue: null,
    multiplier: rules.public_holiday_work.pay_multiplier,
    monthlyHours,
    currency: wage.currency,
  };
}
