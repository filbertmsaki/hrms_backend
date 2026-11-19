import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { DataSource, EntityManager } from 'typeorm';
import { LeaveAllocationBackfillEntry } from '../entities/leave-allocation-backfill-entry.entity';
import {
  AllocatableLeave,
  allocateByMonth,
  dateRange,
  deriveIncludedDates,
} from '../utils/leave-period-allocation.util';

/**
 * FRS-11.4.08 historical allocation backfill.
 *
 * Legacy approved requests have no `calculation_snapshot.included_dates`, so
 * payroll and reports put their whole duration in the month they start. This
 * service reconstructs the dates ONLY when a deterministic rule reproduces
 * the recorded total_days; everything else is flagged NEEDS_REVIEW and left
 * untouched. total_days, balances and ledger entries are never modified.
 *
 * - plan(): read-only dry run with a before/after month allocation.
 * - apply(): one transaction; row locks; re-checks each request; writes an
 *   APPLIED audit row holding the exact before/after snapshot. A partial
 *   unique index makes a second apply of the same request impossible.
 * - revert(batchId): one transaction; restores the before snapshot only if the
 *   request still holds the after snapshot (otherwise aborts, nothing changes).
 */
export interface BackfillCandidate {
  leaveRequestId: number;
  employeeId: number;
  leaveNo: string;
  status: 'PROPOSED' | 'NEEDS_REVIEW';
  method: string | null;
  reason: string | null;
  totalDays: number;
  beforeAllocation: Record<string, number>;
  afterAllocation: Record<string, number> | null;
  includedDates: string[] | null;
}

export interface BackfillPlan {
  companyId: number;
  scanned: number;
  proposed: number;
  needsReview: number;
  candidates: BackfillCandidate[];
  /** Month -> {before, after} totals over the proposed candidates. */
  monthTotals: Record<string, { before: number; after: number }>;
}

type LegacyRow = AllocatableLeave & {
  id: number;
  employee_id: number;
  leave_no: string;
};

const SNAPSHOT_MARKER = 'allocation_backfill';

export class LeaveAllocationBackfillService {
  constructor(private readonly dataSource: DataSource) {}

  private async legacyRows(
    manager: EntityManager,
    companyId: number,
    opts: { from?: string; to?: string; ids?: number[]; lock?: boolean },
  ): Promise<LegacyRow[]> {
    const params: unknown[] = [companyId];
    let sql = `
      SELECT id, employee_id, leave_no, start_date::text AS start_date,
             end_date::text AS end_date, total_days, requested_minutes,
             duration_type::text AS duration_type, calculation_snapshot
        FROM leave_requests
       WHERE company_id = $1
         AND status = 'approved'
         AND (calculation_snapshot IS NULL
              OR jsonb_typeof(calculation_snapshot->'included_dates') IS DISTINCT FROM 'array')`;
    if (opts.from) {
      params.push(opts.from);
      sql += ` AND end_date >= $${params.length}`;
    }
    if (opts.to) {
      params.push(opts.to);
      sql += ` AND start_date <= $${params.length}`;
    }
    if (opts.ids?.length) {
      params.push(opts.ids);
      sql += ` AND id = ANY($${params.length})`;
    }
    sql += ` ORDER BY id`;
    if (opts.lock) sql += ` FOR UPDATE`;
    return manager.query(sql, params);
  }

  private async companyHolidays(
    manager: EntityManager,
    companyId: number,
    from: string,
    to: string,
  ): Promise<Set<string>> {
    // Company-wide holidays only: branch-specific holidays cannot be
    // attributed to a legacy request safely, so requests whose total relies
    // on them fall to NEEDS_REVIEW instead of being guessed.
    const rows: Array<{ date: string; is_recurring: boolean }> =
      await manager.query(
        `SELECT date::text AS date, is_recurring FROM attendance_holidays
          WHERE company_id = $1 AND branch_id IS NULL
            AND counts_as_working_day = false`,
        [companyId],
      );
    const result = new Set<string>();
    const recurring = new Set(
      rows.filter((r) => r.is_recurring).map((r) => r.date.slice(5, 10)),
    );
    for (const r of rows) if (!r.is_recurring) result.add(r.date.slice(0, 10));
    if (recurring.size) {
      for (const d of dateRange(from, to)) {
        if (recurring.has(d.slice(5, 10))) result.add(d);
      }
    }
    return result;
  }

  private buildCandidates(
    rows: LegacyRow[],
    holidays: Set<string>,
  ): BackfillCandidate[] {
    return rows.map((row) => {
      const derived = deriveIncludedDates(row, holidays);
      const beforeAllocation = allocateByMonth(row);
      if (!derived.ok) {
        return {
          leaveRequestId: row.id,
          employeeId: row.employee_id,
          leaveNo: row.leave_no,
          status: 'NEEDS_REVIEW',
          method: null,
          reason: derived.reason,
          totalDays: Number(row.total_days),
          beforeAllocation,
          afterAllocation: null,
          includedDates: null,
        };
      }
      const after = allocateByMonth({
        ...row,
        calculation_snapshot: this.afterSnapshot(row, derived.includedDates, {
          batch_id: 'preview',
          method: derived.method,
        }),
      });
      return {
        leaveRequestId: row.id,
        employeeId: row.employee_id,
        leaveNo: row.leave_no,
        status: 'PROPOSED',
        method: derived.method,
        reason: null,
        totalDays: Number(row.total_days),
        beforeAllocation,
        afterAllocation: after,
        includedDates: derived.includedDates,
      };
    });
  }

  private afterSnapshot(
    row: LegacyRow,
    includedDates: string[],
    marker: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...(row.calculation_snapshot ?? {}),
      duration_type: row.duration_type ?? 'FULL_DAY',
      included_dates: includedDates,
      [SNAPSHOT_MARKER]: marker,
    };
  }

  private rangeOf(rows: LegacyRow[]): [string, string] {
    const starts = rows.map((r) => String(r.start_date).slice(0, 10)).sort();
    const ends = rows.map((r) => String(r.end_date).slice(0, 10)).sort();
    return [starts[0], ends[ends.length - 1]];
  }

  async plan(
    companyId: number,
    opts: { from?: string; to?: string; ids?: number[] } = {},
  ): Promise<BackfillPlan> {
    const manager = this.dataSource.manager;
    const rows = await this.legacyRows(manager, companyId, opts);
    const holidays = rows.length
      ? await this.companyHolidays(manager, companyId, ...this.rangeOf(rows))
      : new Set<string>();
    const candidates = this.buildCandidates(rows, holidays);
    const monthTotals: BackfillPlan['monthTotals'] = {};
    for (const c of candidates.filter((x) => x.status === 'PROPOSED')) {
      for (const [m, d] of Object.entries(c.beforeAllocation)) {
        monthTotals[m] ??= { before: 0, after: 0 };
        monthTotals[m].before += d;
      }
      for (const [m, d] of Object.entries(c.afterAllocation ?? {})) {
        monthTotals[m] ??= { before: 0, after: 0 };
        monthTotals[m].after += d;
      }
    }
    return {
      companyId,
      scanned: rows.length,
      proposed: candidates.filter((c) => c.status === 'PROPOSED').length,
      needsReview: candidates.filter((c) => c.status === 'NEEDS_REVIEW').length,
      candidates,
      monthTotals,
    };
  }

  /** Persist the dry-run plan as PROPOSED / NEEDS_REVIEW audit rows. */
  async recordPlan(plan: BackfillPlan, actor: string): Promise<string> {
    const batchId = randomUUID();
    if (plan.candidates.length) {
      await this.dataSource.getRepository(LeaveAllocationBackfillEntry).insert(
        plan.candidates.map((c) => ({
          batchId,
          companyId: plan.companyId,
          leaveRequestId: c.leaveRequestId,
          status: c.status,
          method: c.method,
          reason: c.reason,
          beforeSnapshot: null,
          afterSnapshot: null,
          beforeAllocation: c.beforeAllocation,
          afterAllocation: c.afterAllocation,
          actor,
        })),
      );
    }
    return batchId;
  }

  async apply(
    companyId: number,
    actor: string,
    opts: { from?: string; to?: string; ids?: number[] } = {},
  ): Promise<{ batchId: string; applied: number; needsReview: number }> {
    const batchId = randomUUID();
    return this.dataSource.transaction(async (manager) => {
      // Locked re-read: a request backfilled or edited concurrently no
      // longer matches the "missing included_dates" filter.
      const rows = await this.legacyRows(manager, companyId, {
        ...opts,
        lock: true,
      });
      const holidays = rows.length
        ? await this.companyHolidays(manager, companyId, ...this.rangeOf(rows))
        : new Set<string>();
      const candidates = this.buildCandidates(rows, holidays);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const repo = manager.getRepository(LeaveAllocationBackfillEntry);
      const now = new Date();
      let applied = 0;
      for (const c of candidates) {
        const row = byId.get(c.leaveRequestId)!;
        if (c.status !== 'PROPOSED' || !c.includedDates) {
          await repo.save(
            repo.create({
              batchId,
              companyId,
              leaveRequestId: c.leaveRequestId,
              status: 'NEEDS_REVIEW',
              method: null,
              reason: c.reason,
              beforeSnapshot: row.calculation_snapshot ?? null,
              afterSnapshot: null,
              beforeAllocation: c.beforeAllocation,
              afterAllocation: null,
              actor,
            }),
          );
          continue;
        }
        const after = this.afterSnapshot(row, c.includedDates, {
          batch_id: batchId,
          method: c.method,
          applied_at: now.toISOString(),
          actor,
        });
        await manager.query(
          `UPDATE leave_requests SET calculation_snapshot = $1::jsonb WHERE id = $2 AND company_id = $3`,
          [JSON.stringify(after), row.id, companyId],
        );
        await repo.save(
          repo.create({
            batchId,
            companyId,
            leaveRequestId: row.id,
            status: 'APPLIED',
            method: c.method,
            reason: null,
            beforeSnapshot: row.calculation_snapshot ?? null,
            afterSnapshot: after,
            beforeAllocation: c.beforeAllocation,
            afterAllocation: c.afterAllocation,
            actor,
            appliedAt: now,
          }),
        );
        applied += 1;
      }
      return {
        batchId,
        applied,
        needsReview: candidates.length - applied,
      };
    });
  }

  async revert(batchId: string, actor: string): Promise<{ reverted: number }> {
    return this.dataSource.transaction(async (manager) => {
      const entries = await manager
        .getRepository(LeaveAllocationBackfillEntry)
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .where('e.batchId = :batchId', { batchId })
        .andWhere(`e.status = 'APPLIED'`)
        .getMany();
      for (const entry of entries) {
        const [current] = await manager.query<
          Array<{ calculation_snapshot: unknown }>
        >(
          `SELECT calculation_snapshot FROM leave_requests WHERE id = $1 AND company_id = $2 FOR UPDATE`,
          [entry.leaveRequestId, entry.companyId],
        );
        if (
          !current ||
          !isDeepStrictEqual(current.calculation_snapshot, entry.afterSnapshot)
        ) {
          throw new Error(
            `Leave request ${entry.leaveRequestId} changed after backfill batch ${batchId}; revert aborted with no changes.`,
          );
        }
        await manager.query(
          `UPDATE leave_requests SET calculation_snapshot = $1::jsonb WHERE id = $2`,
          [
            entry.beforeSnapshot === null
              ? null
              : JSON.stringify(entry.beforeSnapshot),
            entry.leaveRequestId,
          ],
        );
        await manager.update(LeaveAllocationBackfillEntry, entry.id, {
          status: 'REVERTED',
          revertedAt: new Date(),
          reason: `reverted by ${actor}`,
        });
      }
      return { reverted: entries.length };
    });
  }
}
