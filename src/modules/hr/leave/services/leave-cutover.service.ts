import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import {
  LeaveCutoverRow,
  LeaveCutoverSnapshot,
} from '../entities/leave-cutover.entity';
import {
  LeaveLedgerEntry,
  LeaveLedgerEntryType as T,
} from '../entities/leave-ledger-entry.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveDurationTypeEnum } from '../enums/leave-duration-type.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import {
  addDays,
  annualAccrued,
  carryOverExpiry,
  detectCycle,
  EmployeeLeaveContext,
  round4,
  splitSickTiers,
} from '../utils/mainland-leave-engine';
import { LeaveAuditService } from './leave-audit.service';
import {
  canonicalJson,
  LeavePolicyRevisionService,
  sha256,
} from './leave-policy-revision.service';
import { MainlandLeaveService, MainlandPolicyWithCodes } from './mainland-leave.service';

/** Gap between the legacy cache and the reconstructed opening that HR must review. */
const LEGACY_TOLERANCE_DAYS = 0.5;

const PENDING = [
  LeaveStatusEnum.SUBMITTED,
  LeaveStatusEnum.IN_REVIEW,
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
];

type ReqLite = Pick<LeaveRequest, 'id' | 'leave_type_id' | 'start_date' | 'end_date' | 'status' | 'duration_type' | 'total_days' | 'calculation_snapshot'>;

/** Dates of a request inside [from, toExclusive), by counting basis. */
export function requestDatesIn(req: ReqLite, basis: 'calendar_days' | 'working_days', from: string, toExclusive: string) {
  const start = String(req.start_date).slice(0, 10);
  const end = String(req.end_date).slice(0, 10);
  let dates: string[];
  if (basis === 'calendar_days') {
    dates = [];
    for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  } else {
    dates = ((req.calculation_snapshot as { included_dates?: string[] } | null)?.included_dates ?? []).slice();
  }
  const inside = dates.filter((d) => d >= from && d < toExclusive);
  const unit = req.duration_type === LeaveDurationTypeEnum.HALF_DAY ? 0.5 : 1;
  return { dates: inside, units: inside.length * unit, missingDates: basis === 'working_days' && dates.length === 0 };
}

/**
 * Cutover: build a reconciliation from historical requests, seal and sign it,
 * then post OPENING_BALANCE entries exactly once. Legacy balances, legacy
 * transactions and requests are never modified.
 */
@Injectable()
export class LeaveCutoverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly revisions: LeavePolicyRevisionService,
    private readonly mainland: MainlandLeaveService,
    private readonly audit: LeaveAuditService,
  ) {}

  private async snapshot(m: EntityManager, companyId: number, id: number, lock = false) {
    const s = await m.getRepository(LeaveCutoverSnapshot).findOne({ where: { id, company_id: companyId }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!s) throw new NotFoundException('Cutover snapshot not found');
    return s;
  }

  async list(companyId: number) {
    return this.dataSource.getRepository(LeaveCutoverSnapshot).find({ where: { company_id: companyId }, order: { id: 'DESC' }, take: 50 });
  }

  async rows(companyId: number, snapshotId: number) {
    await this.snapshot(this.dataSource.manager, companyId, snapshotId);
    return this.dataSource.getRepository(LeaveCutoverRow).find({ where: { company_id: companyId, snapshot_id: snapshotId }, order: { employee_id: 'ASC', family: 'ASC' } });
  }

  /** Recompute one employee's reconciliation rows (pure inputs → rows). */
  async reconstruct(m: EntityManager, companyId: number, employee: Employee, policy: MainlandPolicyWithCodes, cutover: string, profile: { fte: string; cycle_anchor_date: string | null; previous_employment_periods: { start_date: string; end_date: string }[] }) {
    const codes = policy.leave_type_codes;
    const types = await m.getRepository(LeaveType).find({ where: { company_id: companyId, code: In(Object.values(codes)) } });
    const typeId = (family: string) => types.find((t) => t.code === codes[family])?.id;
    const ctx: EmployeeLeaveContext = {
      hireDate: String(employee.hire_date).slice(0, 10),
      cycleAnchorDate: profile.cycle_anchor_date,
      fte: Number(profile.fte),
      previousEmploymentPeriods: profile.previous_employment_periods,
      terminationDate: employee.exit_date ? String(employee.exit_date).slice(0, 10) : null,
    };
    const requests = (await m.getRepository(LeaveRequest).find({
      where: { company_id: companyId, employee_id: employee.id, status: In([LeaveStatusEnum.APPROVED, ...PENDING]) },
      select: ['id', 'leave_type_id', 'start_date', 'end_date', 'status', 'duration_type', 'total_days', 'calculation_snapshot'],
    })) as ReqLite[];
    // Unpaid blocks feed accrual pauses.
    const unpaidId = typeId('unpaid');
    ctx.unpaidBlocks = requests
      .filter((r) => r.leave_type_id === unpaidId && r.status === LeaveStatusEnum.APPROVED)
      .map((r) => ({ start: String(r.start_date).slice(0, 10), end: String(r.end_date).slice(0, 10) }));
    const out: Partial<LeaveCutoverRow>[] = [];

    const sum = (ids: (number | undefined)[], basis: 'calendar_days' | 'working_days', from: string, to: string, statuses: LeaveStatusEnum[]) => {
      let units = 0;
      const refs: { id: number; units: number }[] = [];
      const exceptions: string[] = [];
      for (const r of requests) {
        if (!ids.includes(r.leave_type_id) || !statuses.includes(r.status)) continue;
        const x = requestDatesIn(r, basis, from, to);
        if (x.missingDates) exceptions.push(`request_${r.id}_missing_included_dates`);
        // A request across the cutover keeps its legacy booking; HR must split or confirm it.
        if (String(r.start_date).slice(0, 10) < cutover && String(r.end_date).slice(0, 10) >= cutover) exceptions.push(`request_${r.id}_spans_cutover`);
        if (x.units > 0) { units += x.units; refs.push({ id: r.id, units: x.units }); }
      }
      return { units: round4(units), refs, exceptions };
    };

    // Annual (occasional leave shares the annual balance).
    const annualIds = [typeId('annual'), typeId('occasional')];
    const annualType = typeId('annual');
    const cycle = detectCycle(policy, ctx, 'annual', cutover);
    if (annualType && cycle) {
      const exceptions: string[] = [];
      const accrued = annualAccrued(policy, ctx, cutover).accrued;
      const takenCur = sum(annualIds, 'calendar_days', cycle.startDate, cutover, [LeaveStatusEnum.APPROVED]);
      let prior: string | null = null;
      let carry = 0;
      let expires: string | null = null;
      let priorRefs: unknown = [];
      if (cycle.cycleNumber > 1) {
        const p = detectCycle(policy, ctx, 'annual', addDays(cycle.startDate, -1))!;
        prior = p.startDate;
        const ent = annualAccrued(policy, { ...ctx, terminationDate: p.endDate }, cycle.startDate).accrued;
        const takenPrior = sum(annualIds, 'calendar_days', p.startDate, cycle.startDate, [LeaveStatusEnum.APPROVED]);
        carry = round4(ent - takenPrior.units);
        priorRefs = takenPrior.refs;
        exceptions.push(...takenPrior.exceptions);
        expires = carryOverExpiry(policy, cycle.startDate);
        if (carry < 0) exceptions.push('prior_cycle_overdrawn');
        if (expires < cutover) exceptions.push('carry_expired_before_cutover_flagged');
        if (cycle.cycleNumber > 2) exceptions.push('older_cycles_not_reconstructed');
      }
      const outstanding = sum(annualIds, 'calendar_days', cutover, '9999-12-31', [LeaveStatusEnum.APPROVED, ...PENDING]);
      // Legacy cache is a cross-check only (fiscal-year based), never the opening amount.
      // Available mirrors LeaveBalanceLedgerService.calculateAvailableDays.
      const legacy = (await m.query(
        `SELECT fiscal_year, leave_year_start_date::text AS year_start, leave_year_end_date::text AS year_end,
                round((CASE WHEN coalesce(opening_balance_days,0) <> 0 THEN opening_balance_days ELSE coalesce(carried_forward_days,0) END)
                    + (CASE WHEN coalesce(entitlement_days,0) <> 0 THEN entitlement_days ELSE coalesce(allocated_days,0) END)
                    + coalesce(adjusted_days,0) - coalesce(used_days,0) - coalesce(pending_days,0) - coalesce(approved_future_days,0)
                    - coalesce(expired_days,0) - coalesce(attendance_deduction_days,0), 4)::float AS available
           FROM leave_balances WHERE company_id=$1 AND employee_id=$2 AND leave_type_id=$3
          ORDER BY (leave_year_start_date <= $4::date - 1 AND leave_year_end_date >= $4::date - 1) DESC NULLS LAST, fiscal_year DESC LIMIT 2`,
        [companyId, employee.id, annualType, cutover],
      )) as { fiscal_year: string; year_start: string | null; year_end: string | null; available: number }[];
      const proposed = round4(Math.max(0, carry) + accrued - takenCur.units);
      if (!legacy.length) exceptions.push('no_legacy_balance_reference');
      else {
        const ref = legacy[0];
        const coversCutover = !!ref.year_start && !!ref.year_end && ref.year_start < cutover && ref.year_end >= addDays(cutover, -1);
        if (!coversCutover) exceptions.push('legacy_balance_year_does_not_cover_cutover');
        // Legacy available already deducts pending/approved future leave.
        const diff = round4(ref.available - (proposed - outstanding.units));
        if (Math.abs(diff) > LEGACY_TOLERANCE_DAYS) exceptions.push(`legacy_balance_differs_by_${diff}`);
      }
      out.push({
        family: 'annual', leave_type_id: annualType, cycle_anchor: ctx.cycleAnchorDate ?? ctx.hireDate, cycle_start: cycle.startDate, prior_cycle_start: prior,
        prior_carry_days: carry.toFixed(4), carry_expires_on: expires, accrued_days: accrued.toFixed(4), taken_days: takenCur.units.toFixed(4),
        outstanding_days: outstanding.units.toFixed(4), proposed_days: proposed.toFixed(4),
        exceptions: [...new Set([...exceptions, ...takenCur.exceptions, ...outstanding.exceptions])],
        sources: { taken_requests: takenCur.refs, prior_taken_requests: priorRefs, outstanding_requests: outstanding.refs, legacy_balances: legacy, fte: ctx.fte, policy_unpaid_blocks: ctx.unpaidBlocks },
      });
    }
    // Sick: usage in the 36-month cycle (tiers derive from usage).
    const sickType = typeId('sick');
    const sc = detectCycle(policy, ctx, 'sick', cutover);
    if (sickType && sc) {
      const used = sum([sickType], 'working_days', sc.startDate, cutover, [LeaveStatusEnum.APPROVED]);
      const outstanding = sum([sickType], 'working_days', cutover, '9999-12-31', [LeaveStatusEnum.APPROVED, ...PENDING]);
      out.push({
        family: 'sick', leave_type_id: sickType, cycle_anchor: ctx.cycleAnchorDate ?? ctx.hireDate, cycle_start: sc.startDate, prior_cycle_start: null,
        accrued_days: policy.sick.entitlement_days.toFixed(4), taken_days: used.units.toFixed(4), outstanding_days: outstanding.units.toFixed(4),
        proposed_days: round4(policy.sick.entitlement_days - used.units).toFixed(4), exceptions: [...new Set([...used.exceptions, ...outstanding.exceptions])],
        sources: { taken_requests: used.refs, outstanding_requests: outstanding.refs, tiers: splitSickTiers(policy, 0, used.units).segments },
      });
    }
    const compType = typeId('compassionate');
    if (compType && cycle) {
      const used = sum([compType], 'working_days', cycle.startDate, cutover, [LeaveStatusEnum.APPROVED]);
      out.push({
        family: 'compassionate', leave_type_id: compType, cycle_anchor: ctx.cycleAnchorDate ?? ctx.hireDate, cycle_start: cycle.startDate, prior_cycle_start: null,
        accrued_days: policy.compassionate.entitlement_days.toFixed(4), taken_days: used.units.toFixed(4), outstanding_days: '0.0000',
        proposed_days: round4(policy.compassionate.entitlement_days - used.units).toFixed(4), exceptions: used.exceptions, sources: { taken_requests: used.refs },
      });
    }
    return out.map((r) => {
      const row = { ...r, company_id: companyId, employee_id: employee.id, override_days: null, override_reason: null, resolved: (r.exceptions ?? []).length === 0 };
      return { ...row, source_fingerprint: sha256(canonicalJson({ ...r, employee_id: employee.id })) };
    });
  }

  /** Build a draft reconciliation for employees with a Mainland profile at cutover. */
  async build(companyId: number, actor: AuthenticatedUser, input: { policyId: number; cutoverDate: string; employeeIds?: number[] }) {
    if (!actor.companyMembershipId) throw new BadRequestException('Company membership required');
    return this.dataSource.transaction(async (m) => {
      const revision = await this.revisions.revisionAsOf(m, companyId, input.policyId, input.cutoverDate);
      if (!revision || revision.jurisdiction !== 'mainland')
        throw new BadRequestException('No approved Mainland revision is effective on the cutover date');
      const ids = input.employeeIds?.length
        ? input.employeeIds
        : ((await m.query(
            `SELECT DISTINCT ON (p.employee_id) p.employee_id, p.jurisdiction FROM leave_employee_profiles p
              JOIN employees e ON e.id = p.employee_id
             WHERE p.company_id = $1 AND p.effective_date <= $2 AND (e.exit_date IS NULL OR e.exit_date >= $2)
             ORDER BY p.employee_id, p.effective_date DESC, p.id DESC`,
            [companyId, input.cutoverDate],
          )) as { employee_id: number; jurisdiction: string }[]).filter((x) => x.jurisdiction === 'mainland').map((x) => x.employee_id);
      if (!ids.length) throw new BadRequestException('No Mainland employees found for the cutover date');
      const repo = m.getRepository(LeaveCutoverSnapshot);
      const snap = await repo.save(repo.create({ company_id: companyId, policy_id: input.policyId, policy_revision_id: revision.id, cutover_date: input.cutoverDate, status: 'draft', created_by_company_user_id: actor.companyMembershipId! }));
      const missing: string[] = [];
      const rowRepo = m.getRepository(LeaveCutoverRow);
      for (const id of ids) {
        const e = await m.getRepository(Employee).findOne({ where: { id, company_id: companyId } });
        const profile = e ? await this.revisions.profileAsOf(m, companyId, id, input.cutoverDate) : null;
        if (!e || !e.hire_date || !profile || profile.jurisdiction !== 'mainland') { missing.push(`employee_${id}`); continue; }
        const rows = await this.reconstruct(m, companyId, e, revision.rules as unknown as MainlandPolicyWithCodes, input.cutoverDate, profile);
        await rowRepo.save(rows.map((r) => rowRepo.create({ ...r, snapshot_id: snap.id })));
      }
      await this.audit.log({ company_id: companyId, action: 'leave_cutover.built', entity_name: 'leave_cutover', entity_id: snap.id, actor, payload: { cutover_date: input.cutoverDate, employees: ids.length, skipped: missing } }, m);
      return { snapshot: snap, skipped: missing };
    });
  }

  /** Draft-only HR override / resolution of a row (reason required). */
  async resolveRow(companyId: number, rowId: number, actor: AuthenticatedUser, input: { overrideDays?: number | null; reason: string }) {
    if (!input.reason?.trim()) throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async (m) => {
      const row = await m.getRepository(LeaveCutoverRow).findOne({ where: { id: rowId, company_id: companyId } });
      if (!row) throw new NotFoundException('Row not found');
      const snap = await this.snapshot(m, companyId, row.snapshot_id, true);
      if (snap.status !== 'draft') throw new ConflictException('Snapshot is no longer a draft');
      row.override_days = input.overrideDays == null ? null : round4(input.overrideDays).toFixed(4);
      row.override_reason = input.reason.trim();
      row.resolved = true;
      await m.getRepository(LeaveCutoverRow).save(row);
      await this.audit.log({ company_id: companyId, action: 'leave_cutover.row_resolved', entity_name: 'leave_cutover', entity_id: snap.id, actor, payload: { row_id: row.id, employee_id: row.employee_id, family: row.family, proposed: row.proposed_days, override_days: row.override_days, reason: row.override_reason } }, m);
      return row;
    });
  }

  private seal(rows: LeaveCutoverRow[]) {
    return sha256(canonicalJson(rows.map((r) => ({ id: r.id, e: r.employee_id, f: r.family, p: r.proposed_days, o: r.override_days, fp: r.source_fingerprint, c: r.prior_carry_days, x: r.carry_expires_on }))));
  }

  /** HR sign-off; all rows must be resolved. The builder cannot approve. */
  async approve(companyId: number, id: number, actor: AuthenticatedUser, input: { reason: string; evidence: string }) {
    if (!input.reason?.trim() || !input.evidence?.trim()) throw new BadRequestException('Reason and evidence are required');
    return this.dataSource.transaction(async (m) => {
      const snap = await this.snapshot(m, companyId, id, true);
      if (snap.status !== 'draft') throw new ConflictException('Only drafts can be approved');
      if (snap.created_by_company_user_id === actor.companyMembershipId) throw new ForbiddenException('The snapshot must be approved by someone other than its builder');
      const rows = await m.getRepository(LeaveCutoverRow).find({ where: { snapshot_id: id }, order: { id: 'ASC' } });
      const unresolved = rows.filter((r) => !r.resolved);
      if (unresolved.length) throw new BadRequestException({ message: 'Unresolved reconciliation rows', rows: unresolved.map((r) => ({ id: r.id, employee_id: r.employee_id, family: r.family, exceptions: r.exceptions })) });
      Object.assign(snap, { status: 'approved', rows_sha256: this.seal(rows), approved_by_company_user_id: actor.companyMembershipId, approved_at: new Date(), approval_reason: input.reason.trim(), approval_evidence: input.evidence.trim() });
      await m.getRepository(LeaveCutoverSnapshot).save(snap);
      await this.audit.log({ company_id: companyId, action: 'leave_cutover.approved', entity_name: 'leave_cutover', entity_id: id, actor, payload: { rows_sha256: snap.rows_sha256, evidence: snap.approval_evidence, reason: snap.approval_reason } }, m);
      return snap;
    });
  }

  /**
   * Post opening entries once. Rejects tampered snapshots and stale rows
   * (source records changed since approval). Re-running is a no-op.
   */
  async post(companyId: number, id: number, actor: AuthenticatedUser) {
    return this.dataSource.transaction(async (m) => {
      const snap = await this.snapshot(m, companyId, id, true);
      if (snap.status === 'posted') return { snapshot: snap, posted: 0, already_posted: true };
      if (snap.status !== 'approved') throw new ConflictException('Snapshot must be approved before posting');
      const rows = await m.getRepository(LeaveCutoverRow).find({ where: { snapshot_id: id }, order: { id: 'ASC' } });
      if (this.seal(rows) !== snap.rows_sha256) throw new ConflictException('Snapshot rows do not match the approved seal');
      const revision = await this.revisions.revisionAsOf(m, companyId, snap.policy_id, snap.cutover_date);
      if (!revision || revision.id !== snap.policy_revision_id) throw new ConflictException('The effective policy revision changed since approval; rebuild the snapshot');
      const policy = revision.rules as unknown as MainlandPolicyWithCodes;
      const stale: number[] = [];
      const byEmployee = new Map<number, LeaveCutoverRow[]>();
      for (const r of rows) byEmployee.set(r.employee_id, [...(byEmployee.get(r.employee_id) ?? []), r]);
      for (const [employeeId, list] of byEmployee) {
        const e = await m.getRepository(Employee).findOne({ where: { id: employeeId, company_id: companyId } });
        const profile = await this.revisions.profileAsOf(m, companyId, employeeId, snap.cutover_date);
        if (!e || !profile) { stale.push(...list.map((x) => x.id)); continue; }
        const fresh = await this.reconstruct(m, companyId, e, policy, snap.cutover_date, profile);
        for (const r of list) if (fresh.find((f) => f.family === r.family)?.source_fingerprint !== r.source_fingerprint) stale.push(r.id);
      }
      if (stale.length) throw new ConflictException({ message: 'Source records changed since approval; rebuild and re-approve', stale_rows: stale });
      const entries: Partial<LeaveLedgerEntry>[] = [];
      for (const r of rows) entries.push(...(await this.openingEntries(m, companyId, snap, r, policy)));
      const inserted = await this.mainland.post(m, entries);
      Object.assign(snap, { status: 'posted', posted_at: new Date(), posted_by_company_user_id: actor.companyMembershipId ?? null });
      await m.getRepository(LeaveCutoverSnapshot).save(snap);
      await this.audit.log({ company_id: companyId, action: 'leave_cutover.posted', entity_name: 'leave_cutover', entity_id: id, actor, payload: { entries: inserted.length } }, m);
      return { snapshot: snap, posted: inserted.length, already_posted: false };
    });
  }

  private async openingEntries(m: EntityManager, companyId: number, snap: LeaveCutoverSnapshot, r: LeaveCutoverRow, policy: MainlandPolicyWithCodes): Promise<Partial<LeaveLedgerEntry>[]> {
    const k = `ml:open:${snap.id}:${r.id}`;
    const base = { company_id: companyId, employee_id: r.employee_id, leave_type_id: r.leave_type_id, family: r.family, dimension: 'balance' as const, cycle_start: r.cycle_start, source_cycle_start: r.cycle_start, effective_date: snap.cutover_date, policy_revision_id: snap.policy_revision_id, reason: `Cutover opening (snapshot ${snap.id})` };
    const out: Partial<LeaveLedgerEntry>[] = [];
    const override = r.override_days != null ? Number(r.override_days) : null;
    if (r.family === 'annual') {
      if (Number(r.prior_carry_days) > 0 && r.prior_cycle_start)
        out.push({ ...base, entry_type: T.OPENING_BALANCE, source_cycle_start: r.prior_cycle_start, bucket_expires_on: r.carry_expires_on, amount_days: r.prior_carry_days, idempotency_key: `${k}:carry`, metadata: { component: 'carry', snapshot_id: snap.id, row_id: r.id } });
      out.push({ ...base, entry_type: T.OPENING_BALANCE, amount_days: r.accrued_days, idempotency_key: `${k}:accrual`, metadata: { component: 'accrual', snapshot_id: snap.id, row_id: r.id } });
      if (Number(r.taken_days) > 0)
        out.push({ ...base, entry_type: T.OPENING_BALANCE, amount_days: String(-Number(r.taken_days)), idempotency_key: `${k}:taken`, metadata: { component: 'taken', snapshot_id: snap.id, row_id: r.id } });
      if (r.carry_expires_on && r.carry_expires_on < snap.cutover_date && r.prior_cycle_start)
        out.push({ ...base, entry_type: T.EXPIRY_FLAGGED, source_cycle_start: r.prior_cycle_start, amount_days: '0', idempotency_key: `${k}:flag`, metadata: { snapshot_id: snap.id } });
      if (override != null) {
        const delta = round4(override - Number(r.proposed_days));
        if (delta !== 0) out.push({ ...base, entry_type: T.ADJUSTMENT, amount_days: String(delta), idempotency_key: `${k}:override`, reason: r.override_reason, metadata: { component: 'override', snapshot_id: snap.id, row_id: r.id } });
      }
    } else {
      out.push({ ...base, entry_type: T.ENTITLEMENT, amount_days: r.accrued_days, idempotency_key: `ml:ent:${r.employee_id}:${r.family}:${r.cycle_start}`, metadata: { snapshot_id: snap.id } });
      if (r.family === 'sick') {
        for (const [i, s] of splitSickTiers(policy, 0, Number(r.taken_days)).segments.entries())
          out.push({ ...base, entry_type: T.OPENING_BALANCE, amount_days: String(-s.days), pay_rate: s.payRate.toFixed(4), idempotency_key: `${k}:taken:${i}`, metadata: { component: 'taken', snapshot_id: snap.id, row_id: r.id } });
      } else if (Number(r.taken_days) > 0)
        out.push({ ...base, entry_type: T.OPENING_BALANCE, amount_days: String(-Number(r.taken_days)), idempotency_key: `${k}:taken`, metadata: { component: 'taken', snapshot_id: snap.id, row_id: r.id } });
      if (override != null) {
        const delta = round4(override - Number(r.proposed_days));
        if (delta !== 0) out.push({ ...base, entry_type: T.ADJUSTMENT, amount_days: String(delta), idempotency_key: `${k}:override`, reason: r.override_reason, metadata: { component: 'override' } });
      }
    }
    // Outstanding future/pending requests are carried as scheduled/reserved Mainland entries.
    const refs = ((r.sources.outstanding_requests as { id: number; units: number }[]) ?? []);
    for (const ref of refs) {
      const req = await m.getRepository(LeaveRequest).findOne({ where: { id: ref.id } });
      if (!req) continue;
      const approved = req.status === LeaveStatusEnum.APPROVED;
      out.push({ ...base, entry_type: approved ? T.TAKEN : T.RESERVED, dimension: approved ? 'balance' : 'reservation', effective_date: String(req.start_date).slice(0, 10) < snap.cutover_date ? snap.cutover_date : String(req.start_date).slice(0, 10), amount_days: String(-ref.units), pay_rate: '1.0000', leave_request_id: req.id, idempotency_key: approved ? `${k}:sched:${req.id}` : `ml:req:${req.id}:c${req.approval_cycle}:reserve:0`, metadata: { component: 'outstanding', snapshot_id: snap.id } });
    }
    return out;
  }

  /** Void a draft/approved (unposted) snapshot. */
  async void(companyId: number, id: number, actor: AuthenticatedUser, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async (m) => {
      const snap = await this.snapshot(m, companyId, id, true);
      if (!['draft', 'approved'].includes(snap.status)) throw new ConflictException('Only unposted snapshots can be voided');
      Object.assign(snap, { status: 'void', closed_at: new Date(), close_reason: reason.trim() });
      await m.getRepository(LeaveCutoverSnapshot).save(snap);
      await this.audit.log({ company_id: companyId, action: 'leave_cutover.voided', entity_name: 'leave_cutover', entity_id: id, actor, payload: { reason } }, m);
      return snap;
    });
  }

  /**
   * Recovery after posting: reverse every opening entry (audit trail kept).
   * Blocked once any employee in the snapshot is actively assigned.
   */
  async reversePosting(companyId: number, id: number, actor: AuthenticatedUser, reason: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
    return this.dataSource.transaction(async (m) => {
      const snap = await this.snapshot(m, companyId, id, true);
      if (snap.status !== 'posted') throw new ConflictException('Only posted snapshots can be reversed');
      const assigned = (await m.query(`SELECT count(*)::int AS n FROM leave_policy_assignments WHERE company_id=$1 AND cutover_snapshot_id=$2`, [companyId, id])) as { n: number }[];
      if (assigned[0].n > 0) throw new ConflictException('Employees are already activated on this snapshot; reassign them first');
      // Repository reads keep date columns as ISO strings (raw rows would shift them by timezone).
      const ids = ((await m.query(`SELECT id FROM leave_ledger_entries WHERE company_id=$1 AND (metadata->>'snapshot_id')::int=$2 AND entry_type <> 'REVERSAL'`, [companyId, id])) as { id: number }[]).map((x) => x.id);
      const entries = ids.length ? await m.getRepository(LeaveLedgerEntry).find({ where: { id: In(ids) } }) : [];
      const rev = entries.map((e) => {
        const { id: _id, created_at: _c, ...rest } = e;
        void _id; void _c;
        return { ...rest, entry_type: T.REVERSAL, amount_days: String(-Number(e.amount_days)), reverses_entry_id: e.id, idempotency_key: `ml:tx:${e.id}:reverse`, reason, created_by_company_user_id: actor.companyMembershipId ?? null };
      });
      const inserted = await this.mainland.post(m, rev);
      Object.assign(snap, { status: 'reversed', closed_at: new Date(), close_reason: reason.trim() });
      await m.getRepository(LeaveCutoverSnapshot).save(snap);
      await this.audit.log({ company_id: companyId, action: 'leave_cutover.reversed', entity_name: 'leave_cutover', entity_id: id, actor, payload: { reversed: inserted.length, reason } }, m);
      return { reversed: inserted.length };
    });
  }

  /** Activation gate for Mainland assignments. */
  async assertActivationAllowed(m: EntityManager, companyId: number, employeeIds: number[], snapshotId: number | null | undefined, date: string) {
    if (!snapshotId) throw new BadRequestException('Mainland activation requires a posted cutover snapshot');
    const snap = await this.snapshot(m, companyId, snapshotId);
    if (snap.status !== 'posted') throw new BadRequestException('Cutover snapshot must be approved and posted');
    if (snap.cutover_date !== date) throw new BadRequestException(`Assignment must take effect on the cutover date ${snap.cutover_date}`);
    const covered = new Set(((await m.query(`SELECT DISTINCT employee_id FROM leave_cutover_rows WHERE snapshot_id=$1`, [snapshotId])) as { employee_id: number }[]).map((x) => x.employee_id));
    const missing = employeeIds.filter((id) => !covered.has(id));
    if (missing.length) throw new BadRequestException({ message: 'Employees not covered by the cutover snapshot', employee_ids: missing });
  }

  /** CSV export of the reconciliation. */
  async exportCsv(companyId: number, id: number) {
    const rows = await this.rows(companyId, id);
    const head = ['employee_id', 'family', 'cycle_anchor', 'cycle_start', 'prior_cycle_start', 'prior_carry_days', 'carry_expires_on', 'accrued_days', 'taken_days', 'outstanding_days', 'proposed_days', 'override_days', 'override_reason', 'exceptions', 'source_requests'];
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = rows.map((r) => [r.employee_id, r.family, r.cycle_anchor, r.cycle_start, r.prior_cycle_start, r.prior_carry_days, r.carry_expires_on, r.accrued_days, r.taken_days, r.outstanding_days, r.proposed_days, r.override_days, r.override_reason, r.exceptions.join('|'), JSON.stringify(r.sources.taken_requests ?? [])].map(esc).join(','));
    return [head.join(','), ...lines].join('\n');
  }
}
