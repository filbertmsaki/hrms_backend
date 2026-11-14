import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  LeaveFamily,
  LeaveLedgerEntry,
  LeaveLedgerEntryType as T,
} from '../entities/leave-ledger-entry.entity';
import {
  LeaveLifeEvent,
  LeaveRuleOverride,
} from '../entities/leave-life-event.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveDurationTypeEnum } from '../enums/leave-duration-type.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import {
  addDays,
  annualAccrued,
  carryOverExpiry,
  consumeOldestFirst,
  cycleAnchor,
  daysBetween,
  detectCycle,
  Finding,
  MainlandPolicy,
  round4,
  sickEarlyServiceCap,
  splitSickTiers,
  validateCompassionate,
  validateMaternity,
  validatePaternity,
  validateUnpaid,
} from '../utils/mainland-leave-engine';
import {
  bucketsAsOf,
  reservationsBySource,
  sourceOf,
  summarise,
} from '../utils/mainland-ledger.util';
import { cycleAnniversary } from '../utils/leave-cycle.util';
import { resolveMonthlyBasicWage } from '../utils/mainland-payroll.util';
import { terminationSettlement } from '../utils/mainland-leave-engine';
import {
  leaveToday,
  LeavePolicyRevisionService,
  ResolvedLeaveContext,
} from './leave-policy-revision.service';

export type MainlandResolved = Extract<ResolvedLeaveContext, { status: 'mainland' }>;
export type MainlandPolicyWithCodes = MainlandPolicy & {
  leave_type_codes: Record<string, string>;
};

export type PlanSegment = {
  sourceCycleStart: string;
  cycleStart: string;
  days: number;
  payRate: number | null;
  dates: string[];
  expiresOn?: string | null;
};

export type RequestPlan = {
  family: LeaveFamily;
  countBasis: 'calendar_days' | 'working_days';
  countedDates: string[];
  excludedDates: { date: string; reason: string }[];
  units: number;
  segments: PlanSegment[];
  findings: Finding[];
  evidence: string[];
  available?: number;
  cycle?: { startDate: string; endDate: string } | null;
};

/** Rows that consume entitlement: taken, reversals, live holds, and cutover usage. */
const isUsage = (x: LeaveLedgerEntry) =>
  x.entry_type === T.TAKEN ||
  x.entry_type === T.REVERSAL ||
  x.dimension === 'reservation' ||
  (x.entry_type === T.OPENING_BALANCE && x.metadata?.component === 'taken');

const PENDING_STATUSES = [
  LeaveStatusEnum.SUBMITTED,
  LeaveStatusEnum.IN_REVIEW,
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
];

/**
 * Mainland engine adapter: maps requests to the append-only ledger.
 * Only employees with an effective Mainland assignment reach this service;
 * the legacy calendar-year path handles everyone else unchanged.
 */
@Injectable()
export class MainlandLeaveService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly revisions: LeavePolicyRevisionService,
  ) {}

  // ------------------------------------------------------------------ resolve
  async resolveForType(
    m: EntityManager,
    companyId: number,
    employeeId: number,
    leaveTypeId: number,
    date: string,
  ): Promise<
    | { mode: 'legacy' }
    | { mode: 'blocked'; issues: string[] }
    | { mode: 'mainland'; resolved: MainlandResolved; family: LeaveFamily; leaveType: LeaveType }
  > {
    const resolved = await this.revisions.resolve(companyId, employeeId, date, m);
    if (resolved.status === 'legacy') return { mode: 'legacy' };
    if (resolved.status === 'blocked') return { mode: 'blocked', issues: resolved.issues };
    const leaveType = await m.getRepository(LeaveType).findOne({ where: { id: leaveTypeId, company_id: companyId } });
    if (!leaveType) throw new NotFoundException('Leave type not found');
    const codes = (resolved.policy as MainlandPolicyWithCodes).leave_type_codes ?? {};
    const entry = Object.entries(codes).find(([, code]) => code === leaveType.code);
    if (!entry) return { mode: 'legacy' };
    const family = (entry[0] === 'occasional' ? 'annual' : entry[0]) as LeaveFamily;
    return { mode: 'mainland', resolved, family, leaveType };
  }

  async lock(m: EntityManager, companyId: number, employeeId: number) {
    await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mainland-leave:${companyId}:${employeeId}`]);
  }

  async rows(m: EntityManager, companyId: number, employeeId: number, family: LeaveFamily) {
    return m.getRepository(LeaveLedgerEntry).find({
      where: { company_id: companyId, employee_id: employeeId, family },
      order: { effective_date: 'ASC', id: 'ASC' },
    });
  }

  /** Insert entries idempotently; existing keys are skipped (reruns are safe). */
  async post(m: EntityManager, entries: Partial<LeaveLedgerEntry>[]) {
    if (!entries.length) return [];
    for (const e of entries) e.amount_days = round4(Number(e.amount_days)).toFixed(4);
    const res = await m
      .createQueryBuilder()
      .insert()
      .into(LeaveLedgerEntry)
      .values(entries as QueryDeepPartialEntity<LeaveLedgerEntry>[])
      .orIgnore()
      .returning('*')
      .execute();
    return res.raw as LeaveLedgerEntry[];
  }

  // ------------------------------------------------------------- day counting
  private countBasis(policy: MainlandPolicy, family: LeaveFamily): 'calendar_days' | 'working_days' {
    const p = policy as unknown as Record<string, { count_basis?: string }>;
    return (p[family]?.count_basis as 'calendar_days' | 'working_days') ?? 'working_days';
  }

  /**
   * Calendar basis counts every date; working basis uses the dates the
   * existing schedule/holiday calculator included (employee schedule aware).
   */
  countRequest(policy: MainlandPolicy, family: LeaveFamily, req: LeaveRequest) {
    const basis = this.countBasis(policy, family);
    const snap = (req.calculation_snapshot ?? {}) as { included_dates?: string[]; excluded_dates?: { date: string; reason: string }[] };
    const half = req.duration_type === LeaveDurationTypeEnum.HALF_DAY;
    if (basis === 'calendar_days') {
      const dates: string[] = [];
      for (let d = String(req.start_date).slice(0, 10); d <= String(req.end_date).slice(0, 10); d = addDays(d, 1)) dates.push(d);
      return { basis, dates, excluded: [] as { date: string; reason: string }[], units: half ? 0.5 : dates.length };
    }
    const dates = snap.included_dates ?? [];
    return { basis, dates, excluded: snap.excluded_dates ?? [], units: half ? Math.min(0.5, dates.length) : Number(req.total_days) };
  }

  // -------------------------------------------------------------------- plan
  async plan(m: EntityManager, companyId: number, req: LeaveRequest, r: MainlandResolved, family: LeaveFamily, today = leaveToday()): Promise<RequestPlan> {
    const policy = r.policy;
    const ctx = r.ctx;
    const counted = this.countRequest(policy, family, req);
    const findings: Finding[] = [];
    const evidence: string[] = [];
    const start = String(req.start_date).slice(0, 10);
    const end = String(req.end_date).slice(0, 10);
    if (start < cycleAnchor(ctx) || start < ctx.hireDate)
      findings.push({ code: 'BEFORE_HIRE', severity: 'error', message: 'Leave cannot start before the hire date' });
    if (ctx.terminationDate && end > ctx.terminationDate)
      findings.push({ code: 'AFTER_TERMINATION', severity: 'error', message: 'Leave cannot extend past the termination date' });
    const rows = (await this.rows(m, companyId, req.employee_id, family)).filter((x) => x.leave_request_id !== req.id);
    const overrides = await m.getRepository(LeaveRuleOverride).find({ where: { company_id: companyId, leave_request_id: req.id } });
    const overridden = new Set(overrides.map((o) => o.rule_code));
    const segments: PlanSegment[] = [];
    let available: number | undefined;
    const cycle = detectCycle(policy, ctx, family === 'sick' ? 'sick' : 'annual', start);

    if (family === 'annual') {
      const lastCycle = detectCycle(policy, ctx, 'annual', end);
      if (cycle && lastCycle && lastCycle.startDate !== cycle.startDate && !policy.annual.advance_leave_enabled)
        findings.push({ code: 'ANNUAL_CROSS_CYCLE', severity: 'warning', message: `Days from ${lastCycle.startDate} draw on the new cycle's accrual only` });
      // Credit = posted buckets + projected unposted accrual through each day's cycle up to last day.
      const buckets = bucketsAsOf(rows, end);
      const reserved = reservationsBySource(rows);
      const futureTaken = rows.filter((x) => x.entry_type === T.TAKEN && x.effective_date > end);
      const withHolds = buckets.map((b) => {
        const src = sourceOf(buckets, b.sourceCycle);
        const hold = (reserved.get(src) ?? 0) + futureTaken.filter((x) => x.source_cycle_start === src).reduce((s, x) => s + Number(x.amount_days), 0);
        return { ...b, remaining: round4(b.remaining + hold), src };
      });
      if (lastCycle) {
        const postedAccrual = rows
          .filter((x) => x.cycle_start === lastCycle.startDate && x.effective_date <= end && ([T.ACCRUAL, T.TRUE_UP].includes(x.entry_type) || (x.entry_type === T.OPENING_BALANCE && x.metadata?.component === 'accrual')))
          .reduce((s, x) => s + Number(x.amount_days), 0);
        const projected = round4(annualAccrued(policy, ctx, addDays(end, 1)).accrued - postedAccrual);
        const own = withHolds.find((b) => b.src === lastCycle.startDate);
        if (own) own.remaining = round4(own.remaining + projected);
        else withHolds.push({ sourceCycle: 0, src: lastCycle.startDate, remaining: projected, expiresOn: null, status: 'active' });
      }
      withHolds.sort((a, b) => a.src.localeCompare(b.src)).forEach((b, i) => (b.sourceCycle = i + 1));
      const consumed = consumeOldestFirst(policy, withHolds, counted.units, start);
      available = round4(withHolds.filter((b) => b.remaining > 0).reduce((s, b) => s + b.remaining, 0));
      let cursor = 0;
      for (const d of consumed.draws) {
        const b = withHolds.find((x) => x.sourceCycle === d.sourceCycle)!;
        segments.push({ sourceCycleStart: b.src, cycleStart: cycle?.startDate ?? start, days: d.days, payRate: 1, dates: counted.dates.slice(Math.floor(cursor), Math.ceil(cursor + d.days)), expiresOn: b.expiresOn });
        cursor += d.days;
      }
      if (consumed.shortfall > 0) {
        if (policy.annual.advance_leave_enabled && overridden.has('ANNUAL_ADVANCE')) {
          segments.push({ sourceCycleStart: cycle?.startDate ?? start, cycleStart: cycle?.startDate ?? start, days: consumed.shortfall, payRate: 1, dates: counted.dates.slice(Math.floor(cursor)) });
          findings.push({ code: 'ANNUAL_ADVANCE', severity: 'warning', message: `${consumed.shortfall} days advanced with HR approval` });
        } else
          findings.push({
            code: policy.annual.advance_leave_enabled ? 'ANNUAL_ADVANCE_NEEDS_HR' : 'ANNUAL_INSUFFICIENT',
            severity: 'error',
            message: `Only ${Math.round(available * 100) / 100} days available through ${end}; short by ${consumed.shortfall}`,
          });
      }
    } else if (family === 'sick') {
      const c = cycle!;
      const used = -rows
        .filter((x) => x.cycle_start === c.startDate && isUsage(x))
        .reduce((s, x) => s + Number(x.amount_days), 0);
      const cap = sickEarlyServiceCap(policy, ctx, start);
      const paidInSpell = cap == null ? 0 : -rows
        .filter((x) => x.effective_date >= ctx.hireDate && isUsage(x) && Number(x.pay_rate ?? 0) > 0)
        .reduce((s, x) => s + Number(x.amount_days), 0);
      const split = splitSickTiers(policy, Math.max(0, used), counted.units, { earlyServicePaidCap: cap, paidUsedInSpell: paidInSpell });
      let cursor = 0;
      for (const s of split.segments) {
        segments.push({ sourceCycleStart: c.startDate, cycleStart: c.startDate, days: s.days, payRate: s.payRate, dates: counted.dates.slice(Math.floor(cursor), Math.ceil(cursor + s.days)) });
        cursor += s.days;
      }
      available = round4(policy.sick.entitlement_days - Math.max(0, used));
      if (split.incapacityFlag) findings.push({ code: 'SICK_BEYOND_ENTITLEMENT', severity: 'warning', message: 'Sick leave beyond the cycle entitlement is unpaid; HR notified' });
      if (cap != null) findings.push({ code: 'SICK_EARLY_SERVICE_CAP', severity: 'warning', message: `Early-service paid sick cap ${cap} days applies` });
      if (policy.sick.medical_certificate_required && !overridden.has('SICK_CERTIFICATE')) evidence.push('medical_certificate');
    } else {
      const event = req.leave_life_event_id
        ? await m.getRepository(LeaveLifeEvent).findOne({ where: { id: req.leave_life_event_id, company_id: companyId, employee_id: req.employee_id } })
        : null;
      const used = (from: string, to: string) =>
        -rows
          .filter((x) => x.effective_date >= from && x.effective_date <= to && isUsage(x))
          .reduce((s, x) => s + Number(x.amount_days), 0);
      let payRate = 1;
      if (family === 'maternity') {
        if (!event || !['birth', 'expected_birth', 'child_death'].includes(event.event_type)) {
          findings.push({ code: 'LIFE_EVENT_REQUIRED', severity: 'error', message: 'Link a birth or expected-birth record' });
        } else if (event.event_type === 'child_death') {
          const birth = event.related_event_id ? await m.getRepository(LeaveLifeEvent).findOne({ where: { id: event.related_event_id, company_id: companyId } }) : null;
          const window = birth ? addDays(cycleAnniversary(birth.event_date, policy.maternity.child_death_window_months), -1) : null;
          if (!birth || event.event_date > (window as string))
            findings.push({ code: 'MATERNITY_CHILD_DEATH_WINDOW', severity: 'error', message: 'Child death must be within the qualifying window of a recorded birth' });
          else if (counted.units > policy.maternity.child_death_extra_days)
            findings.push({ code: 'MATERNITY_ENTITLEMENT', severity: 'error', message: `Child-loss maternity is ${policy.maternity.child_death_extra_days} days` });
        } else {
          const terms = await this.maternityTermsUsed(m, companyId, req.employee_id, event.id);
          const v = validateMaternity(policy, {
            start,
            expectedBirthDate: event.event_date,
            multipleBirth: event.multiple_birth,
            paidTermsUsedAllSpells: terms,
            submittedOn: today,
            earlyStartCertificate: overridden.has('MATERNITY_EARLY_START'),
            nssfReference: event.nssf_reference,
          });
          if (!v.paid) payRate = 0;
          findings.push(...v.findings.map((f) => (f.code === 'MATERNITY_TERM_LIMIT' ? f : f)));
          if (counted.units > v.entitlementDays)
            findings.push({ code: 'MATERNITY_ENTITLEMENT', severity: 'error', message: `Maternity entitlement is ${v.entitlementDays} continuous days` });
        }
      } else if (family === 'paternity') {
        if (!event || event.event_type !== 'birth') findings.push({ code: 'LIFE_EVENT_REQUIRED', severity: 'error', message: 'Link the recorded birth' });
        else {
          const v = validatePaternity(policy, { birthDate: event.event_date, start });
          findings.push(...v.findings);
          const prior = -rows.filter((x) => x.metadata?.life_event_id === event.id && isUsage(x)).reduce((s, x) => s + Number(x.amount_days), 0);
          if (prior + counted.units > v.entitlementDays)
            findings.push({ code: 'PATERNITY_ENTITLEMENT', severity: 'error', message: `Paternity entitlement is ${v.entitlementDays} days per birth` });
        }
      } else if (family === 'compassionate') {
        const c = detectCycle(policy, ctx, 'compassionate', start)!;
        const ret = addDays(end, 1);
        const v = validateCompassionate(policy, { isRestDay: () => false, isPublicHoliday: () => false }, {
          event: event?.event_type ?? 'missing',
          usedInCycle: used(c.startDate, c.endDate),
          requestedDays: counted.units,
          returnDate: today > end ? ret : null,
          submittedOn: today,
        });
        // Retro deadline counted on the employee calendar by the caller-provided dates is approximated by
        // calendar days here; the precise working-day deadline is checked in assertRetroDeadline().
        findings.push(...v.findings.filter((f) => f.code !== 'COMPASSIONATE_LATE'));
        if (today > end) {
          const late = await this.compassionateLate(m, companyId, req, ret, today, policy);
          if (late) findings.push(late);
        }
      } else if (family === 'unpaid') {
        const from = addDays(cycleAnniversary(start, -12), 1);
        findings.push(...validateUnpaid(policy, { usedInRolling12Months: used(from, end), requestedDays: counted.units }).findings);
        payRate = 0;
      }
      const cs = detectCycle(policy, ctx, 'annual', start)?.startDate ?? start;
      if (counted.units > 0)
        segments.push({ sourceCycleStart: cs, cycleStart: cs, days: counted.units, payRate, dates: counted.dates });
    }
    return { family, countBasis: counted.basis, countedDates: counted.dates, excludedDates: counted.excluded, units: counted.units, segments, findings, evidence, available, cycle };
  }

  async maternityTermsUsed(m: EntityManager, companyId: number, employeeId: number, excludeEventId?: number) {
    const rows = (await m.query(
      `SELECT count(*)::int AS n FROM leave_life_events ev
        WHERE ev.company_id = $1 AND ev.employee_id = $2 AND ev.event_type IN ('birth','expected_birth')
          AND ev.id <> COALESCE($3, -1)
          AND (ev.historical_paid_maternity_term
               OR EXISTS (SELECT 1 FROM leave_ledger_entries l
                           WHERE l.company_id = ev.company_id AND l.employee_id = ev.employee_id AND l.family = 'maternity'
                             AND l.entry_type = 'TAKEN' AND l.pay_rate > 0 AND (l.metadata->>'life_event_id')::int = ev.id
                             AND NOT EXISTS (SELECT 1 FROM leave_ledger_entries r WHERE r.reverses_entry_id = l.id)))`,
      [companyId, employeeId, excludeEventId ?? null],
    )) as { n: number }[];
    return rows[0]?.n ?? 0;
  }

  private async compassionateLate(m: EntityManager, companyId: number, req: LeaveRequest, returnDate: string, today: string, policy: MainlandPolicy): Promise<Finding | null> {
    // Working days after return on the company holiday calendar (weekends as rest days).
    const holidays = new Set(
      ((await m.query(`SELECT holiday_date::text AS d FROM holidays WHERE company_id = $1 AND holiday_date BETWEEN $2 AND $3`, [companyId, returnDate, today])) as { d: string }[]).map((x) => x.d),
    );
    let d = returnDate;
    let n = 0;
    while (n < policy.compassionate.retroactive_return_window_working_days) {
      d = addDays(d, 1);
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6 && !holidays.has(d)) n += 1;
    }
    return today > d ? { code: 'COMPASSIONATE_LATE', severity: 'error', message: `Retrospective application deadline was ${d}` } : null;
  }

  private assertPlan(plan: RequestPlan) {
    const errors = plan.findings.filter((f) => f.severity === 'error');
    if (errors.length)
      throw new BadRequestException({ message: errors.map((e) => e.message).join('; '), findings: plan.findings });
  }

  // --------------------------------------------------------------- lifecycle
  /** Submit: validate and hold reservations per bucket / pay tier. */
  async reserve(m: EntityManager, companyId: number, req: LeaveRequest, actor: AuthenticatedUser | null, r: MainlandResolved, family: LeaveFamily) {
    await this.lock(m, companyId, req.employee_id);
    const plan = await this.plan(m, companyId, req, r, family);
    this.assertPlan(plan);
    const typeId = req.leave_type_id;
    await this.post(
      m,
      plan.segments.map((s, i) => ({
        company_id: companyId,
        employee_id: req.employee_id,
        leave_type_id: typeId,
        family,
        entry_type: T.RESERVED,
        dimension: 'reservation' as const,
        cycle_start: s.cycleStart,
        source_cycle_start: s.sourceCycleStart,
        bucket_expires_on: s.expiresOn ?? null,
        effective_date: String(req.start_date).slice(0, 10),
        amount_days: String(-s.days),
        pay_rate: s.payRate == null ? null : s.payRate.toFixed(4),
        leave_request_id: req.id,
        policy_revision_id: r.revision.id,
        idempotency_key: `ml:req:${req.id}:c${req.approval_cycle}:reserve:${i}`,
        reason: 'Leave request submitted',
        metadata: { dates: s.dates, life_event_id: req.leave_life_event_id ?? null, findings: plan.findings },
        created_by_company_user_id: actor?.companyMembershipId ?? null,
      })),
    );
    return plan;
  }

  private async outstandingReservations(m: EntityManager, companyId: number, requestId: number) {
    const rows = await m.getRepository(LeaveLedgerEntry).find({ where: { company_id: companyId, leave_request_id: requestId, dimension: 'reservation' }, order: { id: 'ASC' } });
    const released = new Set(rows.filter((x) => x.entry_type === T.RESERVATION_RELEASED).map((x) => Number(x.metadata?.reservation_id)));
    return rows.filter((x) => x.entry_type === T.RESERVED && !released.has(x.id));
  }

  /** Approve: convert each held reservation into TAKEN rows dated on leave. */
  async approve(m: EntityManager, companyId: number, req: LeaveRequest, actor: AuthenticatedUser | null) {
    await this.lock(m, companyId, req.employee_id);
    const open = await this.outstandingReservations(m, companyId, req.id);
    const entries: Partial<LeaveLedgerEntry>[] = [];
    for (const res of open) {
      const base = { ...res } as Partial<LeaveLedgerEntry>;
      delete base.id;
      delete base.created_at;
      entries.push(
        { ...base, entry_type: T.RESERVATION_RELEASED, amount_days: String(-Number(res.amount_days)), idempotency_key: `ml:res:${res.id}:release`, reason: 'Approved', metadata: { ...res.metadata, reservation_id: res.id }, created_by_company_user_id: actor?.companyMembershipId ?? null },
        { ...base, entry_type: T.TAKEN, dimension: 'balance', amount_days: res.amount_days, idempotency_key: `ml:res:${res.id}:taken`, reason: 'Approved leave', metadata: { ...res.metadata, reservation_id: res.id }, created_by_company_user_id: actor?.companyMembershipId ?? null },
      );
    }
    return this.post(m, entries);
  }

  /** Reject/cancel before approval/return for correction: release holds. */
  async release(m: EntityManager, companyId: number, req: LeaveRequest, actor: AuthenticatedUser | null, reason: string) {
    await this.lock(m, companyId, req.employee_id);
    const open = await this.outstandingReservations(m, companyId, req.id);
    return this.post(
      m,
      open.map((res) => {
        const base = { ...res } as Partial<LeaveLedgerEntry>;
        delete base.id;
        delete base.created_at;
        return { ...base, entry_type: T.RESERVATION_RELEASED, amount_days: String(-Number(res.amount_days)), idempotency_key: `ml:res:${res.id}:release`, reason, metadata: { ...res.metadata, reservation_id: res.id }, created_by_company_user_id: actor?.companyMembershipId ?? null };
      }),
    );
  }

  /**
   * Cancel approved leave or end it early: reverse TAKEN rows, then re-post
   * TAKEN for dates kept (before `keepThrough`). History is never edited.
   */
  async reverseTaken(m: EntityManager, companyId: number, req: LeaveRequest, actor: AuthenticatedUser | null, reason: string, keepThrough?: string | null) {
    await this.lock(m, companyId, req.employee_id);
    const all = await m.getRepository(LeaveLedgerEntry).find({ where: { company_id: companyId, leave_request_id: req.id }, order: { id: 'ASC' } });
    const reversed = new Set(all.filter((x) => x.reverses_entry_id).map((x) => x.reverses_entry_id));
    const taken = all.filter((x) => x.entry_type === T.TAKEN && !reversed.has(x.id));
    const tag = `${Date.now()}`;
    const entries: Partial<LeaveLedgerEntry>[] = [];
    for (const t of taken) {
      const base = { ...t } as Partial<LeaveLedgerEntry>;
      delete base.id;
      delete base.created_at;
      entries.push({ ...base, entry_type: T.REVERSAL, amount_days: String(-Number(t.amount_days)), reverses_entry_id: t.id, idempotency_key: `ml:tx:${t.id}:reverse`, reason, created_by_company_user_id: actor?.companyMembershipId ?? null });
      if (keepThrough) {
        const dates = ((t.metadata?.dates as string[]) ?? []).filter((d) => d <= keepThrough);
        const days = Math.min(-Number(t.amount_days), dates.length);
        if (days > 0)
          entries.push({ ...base, entry_type: T.TAKEN, amount_days: String(-days), idempotency_key: `ml:tx:${t.id}:repost:${keepThrough}:${tag}`, reason: `Re-posted after early return (${keepThrough})`, metadata: { ...t.metadata, dates, reposts_entry_id: t.id }, created_by_company_user_id: actor?.companyMembershipId ?? null });
      }
    }
    return this.post(m, entries);
  }

  // ----------------------------------------------------------------- balance
  /**
   * As-of balance (past/present/future). Actual = ledger rows effective on
   * or before asOf; projected = engine accrual not yet posted (hypothetical).
   */
  async getBalance(companyId: number, employeeId: number, family: LeaveFamily, asOf: string) {
    const m = this.dataSource.manager;
    const resolved = await this.revisions.resolve(companyId, employeeId, asOf, m);
    if (resolved.status !== 'mainland') return { status: resolved.status, detail: resolved };
    const { policy, ctx } = resolved;
    const kind = family === 'sick' ? 'sick' : 'annual';
    const cycle = ['annual', 'sick', 'compassionate'].includes(family) ? detectCycle(policy, ctx, kind, asOf) : null;
    const rows = await this.rows(m, companyId, employeeId, family);
    const pendingIds = new Set(
      (await m.getRepository(LeaveRequest).find({ where: { company_id: companyId, employee_id: employeeId, status: In(PENDING_STATUSES) }, select: ['id'] })).map((x) => x.id),
    );
    const s = summarise(rows, cycle?.startDate ?? null, asOf, pendingIds);
    const buckets = bucketsAsOf(rows, asOf).map((b) => ({ source_cycle_start: sourceOf(bucketsAsOf(rows, asOf), b.sourceCycle), remaining: b.remaining, expires_on: b.expiresOn, status: b.status }));
    let projectedAccrual = 0;
    let entitlement = s.entitlement;
    if (family === 'annual' && cycle) {
      projectedAccrual = round4(annualAccrued(policy, ctx, asOf).accrued - s.accrued);
      entitlement = round4(policy.annual.entitlement_days * (policy.part_time.prorate_by_fte ? ctx.fte : 1));
    }
    if (family === 'sick') entitlement = policy.sick.entitlement_days;
    if (family === 'compassionate') entitlement = policy.compassionate.entitlement_days;
    return {
      status: 'mainland' as const,
      employee_id: employeeId,
      family,
      as_of: asOf,
      policy_revision_id: resolved.revision.id,
      cycle,
      ...s,
      // Pre-cutover sick days came first in the cycle, so they fill the ladder
      // from day one, as splitSickTiers charged them when later requests were planned.
      tier_usage:
        family === 'sick' && s.untiered_taken > 0
          ? Array.from(
              [...splitSickTiers(policy, 0, s.untiered_taken).segments, ...s.tier_usage.map((t) => ({ payRate: t.pay_rate, days: t.days }))]
                .reduce((acc, seg) => acc.set(seg.payRate, round4((acc.get(seg.payRate) ?? 0) + seg.days)), new Map<number, number>())
                .entries(),
            )
              .map(([pay_rate, days]) => ({ pay_rate, days }))
              .sort((a, b) => b.pay_rate - a.pay_rate)
          : s.tier_usage,
      entitlement,
      expired_flagged: round4(buckets.filter((b) => b.status === 'flagged').reduce((a, b) => a + b.remaining, 0)),
      buckets,
      projected: {
        hypothetical: true,
        unposted_accrual: projectedAccrual,
        available_including_projection: round4(s.available + projectedAccrual),
      },
      sick_remaining:
        family === 'sick'
          ? { full_pay: round4(Math.max(0, policy.sick.pay_tiers[0].through_days - s.taken)), total: round4(Math.max(0, policy.sick.entitlement_days - s.taken)) }
          : undefined,
    };
  }

  /** Preview for any employee/type/dates without persisting anything. */
  async preview(companyId: number, req: LeaveRequest) {
    return this.dataSource.transaction(async (m) => {
      const r = await this.resolveForType(m, companyId, req.employee_id, req.leave_type_id, String(req.start_date).slice(0, 10));
      if (r.mode !== 'mainland') return { mode: r.mode, issues: r.mode === 'blocked' ? r.issues : [] };
      const plan = await this.plan(m, companyId, req, r.resolved, r.family);
      return { mode: 'mainland', ...plan };
    });
  }

  /**
   * Termination: annual only. Accrued untaken + eligible carry-over (flagged
   * buckets included until HR forfeits) at monthly basic / divisor. A negative
   * position becomes a draft recovery for Finance; nothing is deducted here.
   */
  async terminationSettlement(m: EntityManager, companyId: number, employeeId: number, exitDate: string) {
    const r = await this.revisions.resolve(companyId, employeeId, exitDate, m);
    if (r.status !== 'mainland') return null;
    const bal = await this.getBalance(companyId, employeeId, 'annual', addDays(exitDate, 1));
    if (bal.status !== 'mainland') return null;
    const b = bal as Extract<typeof bal, { status: 'mainland' }>;
    const unposted = b.projected.unposted_accrual;
    const days = round4(b.balance + unposted);
    const wage = await resolveMonthlyBasicWage(m, companyId, employeeId, exitDate);
    const settlement = wage.ok
      ? terminationSettlement(r.policy, { accruedUntaken: days, eligibleCarryOver: 0, monthlyBasicWage: wage.monthlyBasic })
      : null;
    return { mainland: true as const, days, wage, settlement, policy: r.policy, revisionId: r.revision.id, buckets: b.buckets, unposted_accrual: unposted };
  }

  /** Payroll confirms the payout: post PAYOUT once per payroll reference. */
  async recordPayout(m: EntityManager, companyId: number, employeeId: number, leaveTypeId: number, exitDate: string, days: number, payrollReference: string, revisionId: number) {
    if (days <= 0) return [];
    const r = await this.revisions.resolve(companyId, employeeId, exitDate, m);
    const cycle = r.status === 'mainland' ? detectCycle(r.policy, r.ctx, 'annual', exitDate) : null;
    return this.post(m, [{ company_id: companyId, employee_id: employeeId, leave_type_id: leaveTypeId, family: 'annual', entry_type: T.PAYOUT, dimension: 'balance', cycle_start: cycle?.startDate ?? exitDate, source_cycle_start: cycle?.startDate ?? exitDate, effective_date: exitDate, amount_days: String(-days), policy_revision_id: revisionId, idempotency_key: `ml:payout:${employeeId}:${payrollReference}`, reason: 'Termination payout', metadata: { payroll_reference: payrollReference } }]);
  }

  /** Carry-over helper for the cycle job: closing remainder into a dated bucket. */
  carryOverEntries(companyId: number, employeeId: number, leaveTypeId: number, policy: MainlandPolicy, closingCycleStart: string, nextCycleStart: string, remaining: number, revisionId: number): Partial<LeaveLedgerEntry>[] {
    if (remaining <= 0) return [];
    const expires = carryOverExpiry(policy, nextCycleStart);
    const base = { company_id: companyId, employee_id: employeeId, leave_type_id: leaveTypeId, family: 'annual' as const, dimension: 'balance' as const, effective_date: nextCycleStart, policy_revision_id: revisionId };
    return [
      { ...base, entry_type: T.CARRY_OVER_OUT, cycle_start: closingCycleStart, source_cycle_start: closingCycleStart, amount_days: String(-remaining), idempotency_key: `ml:carry:${employeeId}:${closingCycleStart}:out`, reason: 'Cycle closed' },
      { ...base, entry_type: T.CARRY_OVER_IN, cycle_start: nextCycleStart, source_cycle_start: closingCycleStart, bucket_expires_on: expires, amount_days: String(remaining), idempotency_key: `ml:carry:${employeeId}:${closingCycleStart}:in`, reason: `Carried over; usable through ${expires}`, metadata: { days_to_expiry: daysBetween(nextCycleStart, expires) } },
    ];
  }
}
