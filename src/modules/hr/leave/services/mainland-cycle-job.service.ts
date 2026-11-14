import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { NotificationsService } from '../../../notifications/notifications.service';
import {
  LeaveCycleJobRun,
  LeaveNotificationLog,
} from '../entities/leave-cycle-job-run.entity';
import {
  LeaveLedgerEntry,
  LeaveLedgerEntryType as T,
} from '../entities/leave-ledger-entry.entity';
import { LeaveType } from '../entities/leave-type.entity';
import {
  addDays,
  annualAccrued,
  carryOverExpiry,
  completedMonths,
  daysBetween,
  detectCycle,
  round4,
} from '../utils/mainland-leave-engine';
import { bucketsAsOf, sourceOf } from '../utils/mainland-ledger.util';
import {
  mainlandUnauthorizedAbsence,
  postBirthRestriction,
} from '../utils/mainland-payroll.util';
import { LeaveAuditService } from './leave-audit.service';
import {
  LEAVE_TIMEZONE,
  leaveToday,
  LeavePolicyRevisionService,
} from './leave-policy-revision.service';
import {
  MainlandLeaveService,
  MainlandPolicyWithCodes,
  MainlandResolved,
} from './mainland-leave.service';

/**
 * Daily Mainland cycle job (Africa/Dar_es_Salaam). Per company and employee:
 * posts accrual deltas, sick/compassionate entitlements, closes cycles into
 * carry-over buckets, applies the configured expiry action (flag by default,
 * never silent forfeiture) and sends deduplicated 60/30/7-day warnings.
 * Every posting is delta-based with an idempotency key, so concurrent runs,
 * retries and downtime catch-up converge on one correct set of entries.
 * Anniversary balances never touch the legacy calendar-year lapse job.
 */
@Injectable()
export class MainlandCycleJobService {
  private readonly logger = new Logger(MainlandCycleJobService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly locks: PostgresAdvisoryLockService,
    private readonly revisions: LeavePolicyRevisionService,
    private readonly mainland: MainlandLeaveService,
    private readonly notifications: NotificationsService,
    private readonly audit: LeaveAuditService,
    private readonly config: ConfigService,
  ) {}

  @Cron('15 1 * * *', { timeZone: LEAVE_TIMEZONE })
  async daily() {
    if ([this.config.get('APP_ENV'), this.config.get('NODE_ENV')].includes('test')) return;
    const companies = (await this.dataSource.query(
      `SELECT DISTINCT company_id FROM leave_policy_assignments`,
    )) as { company_id: number }[];
    for (const c of companies) await this.runCompany(c.company_id, leaveToday()).catch(() => undefined);
  }

  /** Run (or retry) a company for a date. Safe to call repeatedly. */
  async runCompany(companyId: number, today: string) {
    const outcome = await this.locks.runWithLock(`mainland-cycle:${companyId}`, async () => {
      const runs = this.dataSource.getRepository(LeaveCycleJobRun);
      let run = await runs.findOne({ where: { company_id: companyId, run_date: today } });
      if (run?.status === 'succeeded') return run;
      run = run
        ? Object.assign(run, { status: 'running', attempts: run.attempts + 1, error: null, started_at: new Date() })
        : runs.create({ company_id: companyId, run_date: today, status: 'running' });
      run = await runs.save(run);
      const stats = { employees: 0, entries: 0, warnings: 0, errors: [] as string[] };
      const employees = (await this.dataSource.query(
        `SELECT DISTINCT employee_id FROM leave_policy_assignments WHERE company_id = $1 AND effective_date <= $2`,
        [companyId, today],
      )) as { employee_id: number }[];
      for (const { employee_id } of employees) {
        try {
          const r = await this.dataSource.transaction((m) => this.processEmployee(m, companyId, employee_id, today));
          stats.employees += r.processed ? 1 : 0;
          stats.entries += r.entries;
          stats.warnings += r.warnings;
        } catch (e) {
          stats.errors.push(`employee ${employee_id}: ${(e as Error).message}`);
        }
      }
      run.status = stats.errors.length ? 'failed' : 'succeeded';
      run.finished_at = new Date();
      run.error = stats.errors.slice(0, 50).join('\n') || null;
      run.stats = stats;
      await runs.save(run);
      if (stats.errors.length) this.logger.error(`Mainland cycle job company ${companyId} ${today}: ${stats.errors.length} failures`);
      return run;
    });
    if (!outcome.acquired) return { skipped: 'another run holds the lock' };
    return outcome.result;
  }

  /** Operators: recent runs, failures first. */
  async runs(companyId: number) {
    return this.dataSource.getRepository(LeaveCycleJobRun).find({ where: { company_id: companyId }, order: { run_date: 'DESC' }, take: 60 });
  }

  private async typeIds(m: EntityManager, companyId: number, policy: MainlandPolicyWithCodes) {
    const types = await m.getRepository(LeaveType).find({ where: { company_id: companyId } });
    return (family: string) => types.find((t) => t.code === policy.leave_type_codes[family])?.id;
  }

  async processEmployee(m: EntityManager, companyId: number, employeeId: number, today: string) {
    const r = await this.revisions.resolve(companyId, employeeId, today, m);
    if (r.status !== 'mainland') return { processed: false, entries: 0, warnings: 0 };
    await this.mainland.lock(m, companyId, employeeId);
    const policy = r.policy as MainlandPolicyWithCodes;
    const typeId = await this.typeIds(m, companyId, policy);
    const activation = r.assignment.effective_date;
    const entries: Partial<LeaveLedgerEntry>[] = [];
    const base = (family: LeaveLedgerEntry['family'], leaveTypeId: number) => ({
      company_id: companyId, employee_id: employeeId, leave_type_id: leaveTypeId, family, dimension: 'balance' as const, policy_revision_id: r.revision.id,
    });
    const until = r.ctx.terminationDate && r.ctx.terminationDate < today ? addDays(r.ctx.terminationDate, 1) : today;

    // ---- annual accrual, cycle close and carry-over
    const annualType = typeId('annual');
    if (annualType) {
      const rows = await this.mainland.rows(m, companyId, employeeId, 'annual');
      const posted = (cycleStart: string) =>
        rows.filter((x) => x.cycle_start === cycleStart && (x.entry_type === T.ACCRUAL || x.entry_type === T.TRUE_UP || (x.entry_type === T.OPENING_BALANCE && x.metadata?.component === 'accrual')))
          .reduce((s, x) => s + Number(x.amount_days), 0);
      let cycle = detectCycle(policy, r.ctx, 'annual', activation > r.ctx.hireDate ? activation : r.ctx.hireDate);
      while (cycle && cycle.startDate <= until) {
        const closed = cycle.endDate < until;
        const asOf = closed ? addDays(cycle.endDate, 1) : until;
        const accrued = annualAccrued(policy, { ...r.ctx, terminationDate: closed ? cycle.endDate : r.ctx.terminationDate }, asOf).accrued;
        const delta = round4(accrued - posted(cycle.startDate));
        const sixMonths = completedMonths(r.ctx.hireDate, asOf) >= policy.early_service.months && cycle.cycleNumber === 1 && !r.ctx.cycleAnchorDate;
        if (Math.abs(delta) >= 0.0001) {
          const trueUp = sixMonths && !rows.some((x) => x.entry_type === T.TRUE_UP);
          entries.push({
            ...base('annual', annualType), entry_type: trueUp ? T.TRUE_UP : T.ACCRUAL, cycle_start: cycle.startDate, source_cycle_start: cycle.startDate,
            effective_date: closed ? cycle.endDate : addDays(until, -1) < cycle.startDate ? cycle.startDate : addDays(until, -1),
            amount_days: String(delta),
            idempotency_key: trueUp ? `ml:trueup:${employeeId}:${r.ctx.hireDate}` : `ml:acc:${employeeId}:${cycle.startDate}:${closed ? 'final' : until}`,
            reason: trueUp ? 'Six-month true-up to first-cycle accrual' : 'Accrual', metadata: { accrued_total: accrued },
          });
          rows.push({ ...(entries[entries.length - 1] as LeaveLedgerEntry) });
        }
        if (closed) {
          const next = detectCycle(policy, r.ctx, 'annual', addDays(cycle.endDate, 1))!;
          const bucket = rows.filter((x) => x.source_cycle_start === cycle!.startDate && x.dimension === 'balance' && x.effective_date <= cycle!.endDate && x.entry_type !== T.CARRY_OVER_OUT)
            .reduce((s, x) => s + Number(x.amount_days), 0);
          if (!rows.some((x) => x.idempotency_key === `ml:carry:${employeeId}:${cycle!.startDate}:in`))
            entries.push(...this.mainland.carryOverEntries(companyId, employeeId, annualType, policy, cycle.startDate, next.startDate, round4(bucket), r.revision.id));
          cycle = next;
        } else break;
      }
    }

    // ---- sick (36-month) and compassionate (annual) entitlements
    for (const fam of ['sick', 'compassionate'] as const) {
      const id = typeId(fam);
      const c = detectCycle(policy, r.ctx, fam, until);
      if (!id || !c) continue;
      const amount = fam === 'sick' ? policy.sick.entitlement_days : policy.compassionate.entitlement_days;
      entries.push({ ...base(fam, id), entry_type: T.ENTITLEMENT, cycle_start: c.startDate, source_cycle_start: c.startDate, effective_date: c.startDate < activation ? activation : c.startDate, amount_days: String(amount), idempotency_key: `ml:ent:${employeeId}:${fam}:${c.startDate}`, reason: 'Cycle entitlement' });
    }
    let inserted = await this.mainland.post(m, entries);

    // ---- expiry actions and warnings on carry-over buckets
    let warnings = 0;
    if (annualType) {
      const rows = await this.mainland.rows(m, companyId, employeeId, 'annual');
      const buckets = bucketsAsOf(rows, today);
      const expiry: Partial<LeaveLedgerEntry>[] = [];
      for (const b of buckets) {
        if (!b.expiresOn || b.remaining <= 0 || b.status === 'forfeited') continue;
        const src = sourceOf(buckets, b.sourceCycle);
        const cycleStart = detectCycle(policy, r.ctx, 'annual', today)?.startDate ?? src;
        if (today > b.expiresOn && b.status !== 'flagged') {
          const forfeit = policy.annual.expiry_action === 'forfeit';
          expiry.push({ ...base('annual', annualType), entry_type: forfeit ? T.FORFEITED : T.EXPIRY_FLAGGED, cycle_start: cycleStart, source_cycle_start: src, effective_date: addDays(b.expiresOn, 1), amount_days: forfeit ? String(-b.remaining) : '0', idempotency_key: `ml:exp:${employeeId}:${src}:${b.expiresOn}`, reason: forfeit ? 'Carry-over expired (policy: forfeit)' : 'Carry-over expired; flagged for HR decision (days remain usable)', metadata: { remaining: b.remaining, expires_on: b.expiresOn } });
          continue;
        }
        const left = daysBetween(today, b.expiresOn);
        const due = [...policy.carry_over_warning_days].sort((a, z) => a - z).find((d) => left <= d && left >= 0);
        if (due != null) warnings += await this.warn(m, companyId, employeeId, src, b.expiresOn, b.remaining, due);
      }
      inserted = inserted.concat(await this.mainland.post(m, expiry));
    }
    warnings += await this.hrFlags(m, companyId, employeeId, today, policy);
    return { processed: true, entries: inserted.length, warnings };
  }

  /** Deduplicated HR flags: unauthorized absence runs, post-birth attendance, rule findings. */
  private async hrFlags(m: EntityManager, companyId: number, employeeId: number, today: string, policy: MainlandPolicyWithCodes) {
    let sent = 0;
    const from = addDays(today, -31);
    const yesterday = addDays(today, -1);
    const absence = await mainlandUnauthorizedAbsence(m, companyId, employeeId, from, yesterday, policy.unauthorized_absence.flag_after_consecutive_working_days);
    for (const run of absence.runs.filter((r) => r.flagHr))
      sent += await this.notify(m, companyId, employeeId, `absence:${employeeId}:${run.start}`, 'Unauthorized absence', `${run.workingDays} consecutive working days of unapproved absence from ${run.start} to ${run.end} (unpaid).`, true, { run });
    const present = (await m.query(
      `SELECT attendance_date::text AS d FROM attendance_daily_summaries WHERE company_id = $1 AND employee_id = $2
         AND attendance_date BETWEEN $3 AND $4 AND (work_minutes > 0 OR upper(attendance_status) IN ('PRESENT','LATE','HALF_DAY'))`,
      [companyId, employeeId, from, yesterday],
    )) as { d: string }[];
    for (const { d } of present) {
      const r = await postBirthRestriction(m, companyId, employeeId, d, policy.maternity.return_restriction_weeks_after_birth);
      if (r.restricted)
        sent += await this.notify(m, companyId, employeeId, `rtw:${employeeId}:${d}`, 'Attendance during post-birth restriction', `Attendance was recorded on ${d}, within the restriction ending ${r.until}, without a fitness-certificate override.`, false, { date: d });
    }
    const findings = (await m.query(
      `SELECT id, leave_request_id, metadata FROM leave_ledger_entries WHERE company_id = $1 AND employee_id = $2 AND entry_type = 'RESERVED'
         AND created_at >= now() - interval '35 days' AND metadata ? 'findings'`,
      [companyId, employeeId],
    )) as { id: number; leave_request_id: number; metadata: { findings?: { code: string; message: string }[] } }[];
    for (const row of findings)
      for (const f of (row.metadata.findings ?? []).filter((x) => ['SICK_BEYOND_ENTITLEMENT', 'MATERNITY_TERM_LIMIT'].includes(x.code)))
        sent += await this.notify(m, companyId, employeeId, `finding:${row.leave_request_id}:${f.code}`, 'Leave requires HR attention', f.message, false, { leave_request_id: row.leave_request_id, code: f.code });
    return sent;
  }

  private async notify(m: EntityManager, companyId: number, employeeId: number, key: string, title: string, message: string, includeManager: boolean, metadata: Record<string, unknown>) {
    const recipients = (await m.query(
      `SELECT DISTINCT cu_id FROM (
         SELECT mgr.company_user_id AS cu_id FROM employees e JOIN employees mgr ON mgr.id = e.reports_to WHERE e.id = $2 AND e.company_id = $1 AND $3::boolean
         UNION
         SELECT cur.company_user_id FROM company_user_roles cur JOIN roles r ON r.id = cur.role_id JOIN company_users cu ON cu.id = cur.company_user_id
          WHERE cu.company_id = $1 AND r.name = 'HR_MANAGER') x WHERE cu_id IS NOT NULL`,
      [companyId, employeeId, includeManager],
    )) as { cu_id: number }[];
    const ids = recipients.map((x) => x.cu_id);
    const res = await m.createQueryBuilder().insert().into(LeaveNotificationLog).values({ company_id: companyId, dedupe_key: key, recipients: ids }).orIgnore().returning('id').execute();
    if (!(res.raw as unknown[]).length) return 0;
    for (const receiver of ids)
      await this.notifications.createAndPush({ company_id: companyId, receiver_company_user_id: receiver, title, message, related_module: 'leave', entity_type: 'employee', entity_id: employeeId, dedupe_key: `${key}:${receiver}`, metadata });
    return 1;
  }

  private async warn(m: EntityManager, companyId: number, employeeId: number, src: string, expiresOn: string, remaining: number, threshold: number) {
    const key = `carry-warn:${employeeId}:${src}:${expiresOn}:${threshold}`;
    const recipients = (await m.query(
      `SELECT DISTINCT cu_id FROM (
         SELECT mgr.company_user_id AS cu_id FROM employees e JOIN employees mgr ON mgr.id = e.reports_to WHERE e.id = $2 AND e.company_id = $1
         UNION
         SELECT cur.company_user_id FROM company_user_roles cur JOIN roles r ON r.id = cur.role_id JOIN company_users cu ON cu.id = cur.company_user_id
          WHERE cu.company_id = $1 AND r.name = 'HR_MANAGER') x WHERE cu_id IS NOT NULL`,
      [companyId, employeeId],
    )) as { cu_id: number }[];
    const ids = recipients.map((x) => x.cu_id);
    const res = await m.createQueryBuilder().insert().into(LeaveNotificationLog).values({ company_id: companyId, dedupe_key: key, recipients: ids }).orIgnore().returning('id').execute();
    if (!(res.raw as unknown[]).length) return 0;
    const name = ((await m.query(`SELECT first_name, last_name FROM employees WHERE id = $1`, [employeeId])) as { first_name: string; last_name: string }[])[0];
    for (const receiver of ids)
      await this.notifications.createAndPush({
        company_id: companyId,
        receiver_company_user_id: receiver,
        title: `Carried-over leave expires in ${threshold} days`,
        message: `${name?.first_name ?? ''} ${name?.last_name ?? ''}: ${Math.round(remaining * 100) / 100} carried-over annual days (cycle from ${src}) expire on ${expiresOn}.`,
        related_module: 'leave',
        entity_type: 'employee',
        entity_id: employeeId,
        dedupe_key: `${key}:${receiver}`,
        metadata: { employee_id: employeeId, source_cycle_start: src, expires_on: expiresOn, remaining, threshold },
      });
    return 1;
  }

  // ------------------------------------------------------ HR bucket actions
  private async bucket(m: EntityManager, companyId: number, employeeId: number, src: string) {
    const r = await this.revisions.resolve(companyId, employeeId, leaveToday(), m);
    if (r.status !== 'mainland') throw new BadRequestException('Employee is not on a Mainland policy');
    const rows = await this.mainland.rows(m, companyId, employeeId, 'annual');
    const buckets = bucketsAsOf(rows, '9999-12-31');
    const b = buckets.find((x) => sourceOf(buckets, x.sourceCycle) === src);
    if (!b || !b.expiresOn) throw new NotFoundException('Carry-over bucket not found');
    if (b.status === 'forfeited') throw new ConflictException('Bucket already forfeited');
    return { r, b, rows };
  }

  /** HR extends a bucket to the approved extension limit (default 12 months). */
  async extend(companyId: number, employeeId: number, src: string, actor: AuthenticatedUser, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async (m) => {
      await this.mainland.lock(m, companyId, employeeId);
      const { r, b, rows } = await this.bucket(m, companyId, employeeId, src);
      const carryIn = rows.find((x) => x.source_cycle_start === src && (x.entry_type === T.CARRY_OVER_IN || (x.entry_type === T.OPENING_BALANCE && x.bucket_expires_on)));
      const nextStart = carryIn?.cycle_start ?? src;
      const newExpiry = carryOverExpiry(r.policy, nextStart, true);
      if (newExpiry <= (b.expiresOn as string)) throw new ConflictException('Bucket already at the maximum extension');
      const typeId = rows[0].leave_type_id;
      const [entry] = await this.mainland.post(m, [{ company_id: companyId, employee_id: employeeId, leave_type_id: typeId, family: 'annual', entry_type: T.EXPIRY_EXTENDED, dimension: 'balance', cycle_start: nextStart, source_cycle_start: src, effective_date: leaveToday(), amount_days: '0', idempotency_key: `ml:ext:${employeeId}:${src}:${newExpiry}`, reason: reason.trim(), metadata: { previous_expires_on: b.expiresOn, new_expires_on: newExpiry }, created_by_company_user_id: actor.companyMembershipId ?? null, policy_revision_id: r.revision.id }]);
      await this.audit.log({ company_id: companyId, action: 'leave_carry_over.extended', entity_name: 'employee', entity_id: employeeId, actor, payload: { source_cycle_start: src, new_expires_on: newExpiry, reason } }, m);
      return entry ?? { already_extended: true };
    });
  }

  /** HR explicitly forfeits a bucket's remaining days (reason required). */
  async forfeit(companyId: number, employeeId: number, src: string, actor: AuthenticatedUser, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async (m) => {
      await this.mainland.lock(m, companyId, employeeId);
      const { r, b, rows } = await this.bucket(m, companyId, employeeId, src);
      if (b.remaining <= 0) throw new ConflictException('Nothing left to forfeit');
      const cycleStart = detectCycle(r.policy, r.ctx, 'annual', leaveToday())?.startDate ?? src;
      const [entry] = await this.mainland.post(m, [{ company_id: companyId, employee_id: employeeId, leave_type_id: rows[0].leave_type_id, family: 'annual', entry_type: T.FORFEITED, dimension: 'balance', cycle_start: cycleStart, source_cycle_start: src, effective_date: leaveToday(), amount_days: String(-b.remaining), idempotency_key: `ml:forfeit:${employeeId}:${src}`, reason: reason.trim(), metadata: { expires_on: b.expiresOn }, created_by_company_user_id: actor.companyMembershipId ?? null, policy_revision_id: r.revision.id }]);
      await this.audit.log({ company_id: companyId, action: 'leave_carry_over.forfeited', entity_name: 'employee', entity_id: employeeId, actor, payload: { source_cycle_start: src, days: b.remaining, reason } }, m);
      return entry;
    });
  }
}

export type { MainlandResolved };
