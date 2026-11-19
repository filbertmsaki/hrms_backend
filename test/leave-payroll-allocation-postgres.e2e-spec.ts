/**
 * FRS-11.1.02 / 11.2.09 / 11.4.08 against a real Postgres database:
 * statutory sick-pay bands consumed by payroll exactly once across periods,
 * the historical allocation backfill (dry run, apply, duplicate protection,
 * revert, drift-safe revert) and the monthly leave-to-payroll reconciliation.
 *
 * Run only against a disposable database, e.g.
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-payroll-allocation-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { EmployeePayrollCalculationService } from '../src/modules/hr/payroll/services/payroll-core.services';
import { LeaveRequest } from '../src/modules/hr/leave/entities/leave-request.entity';
import { PayrollLeaveRule } from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import { LeaveAllocationBackfillService } from '../src/modules/hr/leave/services/leave-allocation-backfill.service';
import { LeavePayrollReconciliationService } from '../src/modules/hr/leave/services/leave-payroll-reconciliation.service';

type Summary = {
  paidDays: number;
  unpaidDays: number;
  paidEquivalentDays: number;
  unpaidEquivalentDays: number;
  leaveRequestIds: number[];
  policyBreakdown: Record<string, { pay_source: string }>;
};

const OCT = { startDate: '2026-10-01', endDate: '2026-10-31' };
const NOV = { startDate: '2026-11-01', endDate: '2026-11-30' };

describe('Leave ↔ payroll allocation (real Postgres)', () => {
  let ds: DataSource;
  let companyId: number;
  let employeeId: number;
  let userId: number;
  let sickTypeId: number;
  let unpaidTypeId: number;
  const ids: Record<string, number> = {};
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let payroll: {
    summarizeLeave(c: number, e: number, p: object): Promise<Summary>;
  };
  let backfill: LeaveAllocationBackfillService;

  const one = async <T = Record<string, unknown>>(
    sql: string,
    p: unknown[] = [],
  ) => (await ds.query<T[]>(sql, p))[0];

  const summarize = (period: typeof OCT) =>
    payroll.summarizeLeave(companyId, employeeId, period);

  async function leave(
    key: string,
    v: {
      type: number;
      start: string;
      end: string;
      days: number;
      status?: string;
      duration?: string;
      snapshot?: object | null;
      bands?: Array<{ days: number; pay_percent: number }>;
    },
  ) {
    const row = await one<{ id: number }>(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no,
         start_date, end_date, total_days, reason, created_by_company_user_id, version,
         status, duration_type, calculation_snapshot, pay_breakdown)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'fixture',$8,1,$9,$10,$11,$12) RETURNING id`,
      [
        companyId,
        employeeId,
        v.type,
        `LV-${key}-${suffix}`.slice(0, 50),
        v.start,
        v.end,
        v.days,
        userId,
        v.status ?? 'approved',
        v.duration ?? 'FULL_DAY',
        v.snapshot === undefined ? null : JSON.stringify(v.snapshot),
        v.bands
          ? JSON.stringify({
              rule_set_id: 1,
              rule_type: 'sick_leave',
              bands: v.bands,
              calculated_at: '2026-10-01T00:00:00Z',
            })
          : null,
      ],
    );
    ids[key] = row.id;
  }

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? '')) {
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    }
    ds = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    companyId = (
      await one<{ id: number }>(
        `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
        [`FRS11 ${suffix}`, `frs11-${suffix}`],
      )
    ).id;
    const user = await one<{ id: number }>(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password)
       VALUES ($1,'Fixture','User',$2,$3,'x') RETURNING id`,
      [
        `U${suffix}`.slice(0, 30),
        `+255${suffix}`.slice(0, 15),
        `frs11-${suffix}@example.test`,
      ],
    );
    userId = (
      await one<{ id: number }>(
        `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
        [companyId, user.id],
      )
    ).id;
    employeeId = (
      await one<{ id: number }>(
        `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version)
         VALUES ($1,$2,'Synthetic','Employee','female',1) RETURNING id`,
        [companyId, `E-${suffix}`.slice(0, 50)],
      )
    ).id;
    sickTypeId = (
      await one<{ id: number }>(
        `INSERT INTO leave_types (company_id, name, code, is_paid) VALUES ($1,'Sick','SICK',true) RETURNING id`,
        [companyId],
      )
    ).id;
    unpaidTypeId = (
      await one<{ id: number }>(
        `INSERT INTO leave_types (company_id, name, code, is_paid) VALUES ($1,'Unpaid','LWP',false) RETURNING id`,
        [companyId],
      )
    ).id;
    // A payroll leave rule for SICK that would pay everything at 100%: the
    // recorded statutory bands must take precedence over it.
    await ds.query(
      `INSERT INTO payroll_leave_rules (company_id, code, name, leave_type_code, effective_from, status, paid_percentage)
       VALUES ($1,'SICK-RULE','Sick rule','SICK','2020-01-01','ACTIVE','100')`,
      [companyId],
    );

    // A: sick, 8 working days over Oct/Nov, bands 3@100, 4@50, 1@0.
    await leave('A', {
      type: sickTypeId,
      start: '2026-10-28',
      end: '2026-11-06',
      days: 8,
      snapshot: {
        duration_type: 'FULL_DAY',
        included_dates: [
          '2026-10-28',
          '2026-10-29',
          '2026-10-30',
          '2026-11-02',
          '2026-11-03',
          '2026-11-04',
          '2026-11-05',
          '2026-11-06',
        ],
      },
      bands: [
        { days: 3, pay_percent: 100 },
        { days: 4, pay_percent: 50 },
        { days: 1, pay_percent: 0 },
      ],
    });
    // B: sick half day in the half-pay band.
    await leave('B', {
      type: sickTypeId,
      start: '2026-10-14',
      end: '2026-10-14',
      days: 0.5,
      duration: 'HALF_DAY',
      snapshot: { duration_type: 'HALF_DAY', included_dates: ['2026-10-14'] },
      bands: [{ days: 0.5, pay_percent: 50 }],
    });
    // C: cancelled sick leave — must never reach payroll.
    await leave('C', {
      type: sickTypeId,
      start: '2026-10-20',
      end: '2026-10-20',
      days: 1,
      status: 'cancelled',
      snapshot: { duration_type: 'FULL_DAY', included_dates: ['2026-10-20'] },
      bands: [{ days: 1, pay_percent: 100 }],
    });
    // D: legacy unpaid leave Thu 29 Oct – Tue 3 Nov, 4 working days, no snapshot.
    await leave('D', {
      type: unpaidTypeId,
      start: '2026-10-29',
      end: '2026-11-03',
      days: 4,
    });
    // E: legacy request no rule can reproduce (7 days in a 5-day range).
    await leave('E', {
      type: unpaidTypeId,
      start: '2026-10-05',
      end: '2026-10-09',
      days: 7,
    });
    // F: legacy half day without snapshot or bands (sick → leave-type pay).
    await leave('F', {
      type: sickTypeId,
      start: '2026-11-10',
      end: '2026-11-10',
      days: 0.5,
      duration: 'HALF_DAY',
    });

    const svc = Object.create(EmployeePayrollCalculationService.prototype);
    Object.assign(svc, {
      leaveRepository: ds.getRepository(LeaveRequest),
      leaveRuleRepository: ds.getRepository(PayrollLeaveRule),
    });
    payroll = svc;
    backfill = new LeaveAllocationBackfillService(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(
        `DELETE FROM leave_allocation_backfill_entries WHERE company_id = $1`,
        [companyId],
      );
      await ds.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
      await ds.destroy();
    }
  });

  it('consumes statutory sick-pay bands once across payroll periods, before backfill', async () => {
    const oct = await summarize(OCT);
    const nov = await summarize(NOV);
    // Oct: A 3@100, B 0.5@50, D legacy 4 unpaid in start month, E legacy 7 unpaid.
    const num = (a: number[]) => [...a].sort((x, y) => x - y);
    expect(num(oct.leaveRequestIds)).toEqual(num([ids.A, ids.B, ids.D, ids.E]));
    expect(oct.paidEquivalentDays).toBeCloseTo(3.25, 6);
    expect(oct.unpaidEquivalentDays).toBeCloseTo(0.25 + 4 + 7, 6);
    // Nov: A 4@50 + 1@0, F half day paid via leave type; D contributes 0 (legacy).
    expect(nov.paidEquivalentDays).toBeCloseTo(2 + 0.5, 6);
    expect(nov.unpaidEquivalentDays).toBeCloseTo(3, 6);
    expect(oct.policyBreakdown.SICK.pay_source).toBe('statutory_pay_bands');
    // A in total: 8 days, paid-equivalent 3 (Oct) + 2 (Nov) = 3 + 4*0.5 + 0, exactly once.
    expect(oct.policyBreakdown.SICK).toBeDefined();
    // Rerun is deterministic.
    const rerun = await summarize(OCT);
    expect(num(rerun.leaveRequestIds)).toEqual(num(oct.leaveRequestIds));
    expect({ ...rerun, leaveRequestIds: [] }).toEqual({
      ...oct,
      leaveRequestIds: [],
    });
  });

  it('dry run proposes only reproducible allocations and changes nothing', async () => {
    const plan = await backfill.plan(companyId);
    expect(plan.scanned).toBe(3);
    expect(plan.proposed).toBe(2);
    expect(plan.needsReview).toBe(1);
    const d = plan.candidates.find((c) => c.leaveRequestId === ids.D)!;
    expect(d.method).toBe('exclude_weekends');
    expect(d.beforeAllocation).toEqual({ '2026-10': 4 });
    expect(d.afterAllocation).toEqual({ '2026-10': 2, '2026-11': 2 });
    expect(
      plan.candidates.find((c) => c.leaveRequestId === ids.E)!.status,
    ).toBe('NEEDS_REVIEW');
    const after = await one<{ n: string }>(
      `SELECT count(*) n FROM leave_requests WHERE company_id=$1 AND calculation_snapshot IS NULL`,
      [companyId],
    );
    expect(Number(after.n)).toBe(3);
    const batch = await backfill.recordPlan(plan, 'e2e');
    const rec = await ds.query(
      `SELECT status, count(*)::int n FROM leave_allocation_backfill_entries WHERE batch_id=$1 GROUP BY status ORDER BY status`,
      [batch],
    );
    expect(rec).toEqual([
      { status: 'NEEDS_REVIEW', n: 1 },
      { status: 'PROPOSED', n: 2 },
    ]);
  });

  let octRecorded: Summary;
  let batchId: string;

  it('applies the backfill transactionally and moves legacy days into the right period', async () => {
    octRecorded = await summarize(OCT); // what an already-calculated Oct payroll recorded
    const result = await backfill.apply(companyId, 'e2e');
    batchId = result.batchId;
    expect(result).toMatchObject({ applied: 2, needsReview: 1 });
    const oct = await summarize(OCT);
    const nov = await summarize(NOV);
    expect(oct.unpaidEquivalentDays).toBeCloseTo(0.25 + 2 + 7, 6);
    expect(nov.unpaidEquivalentDays).toBeCloseTo(3 + 2, 6);
    // D's 4 unpaid days are now split 2/2 and still counted exactly once.
    expect(
      oct.unpaidEquivalentDays - octRecorded.unpaidEquivalentDays + 2,
    ).toBeCloseTo(0, 6);
    expect(nov.paidEquivalentDays).toBeCloseTo(2.5, 6);
    const snap = await one<{ s: Record<string, unknown> }>(
      `SELECT calculation_snapshot s FROM leave_requests WHERE id=$1`,
      [ids.D],
    );
    expect(snap.s.included_dates).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect((snap.s.allocation_backfill as { batch_id: string }).batch_id).toBe(
      batchId,
    );
  });

  it('is idempotent and the database rejects a second APPLIED row', async () => {
    const again = await backfill.apply(companyId, 'e2e');
    expect(again).toMatchObject({ applied: 0, needsReview: 1 });
    await expect(
      ds.query(
        `INSERT INTO leave_allocation_backfill_entries
           (batch_id, company_id, leave_request_id, status, before_allocation, actor)
         VALUES (gen_random_uuid(), $1, $2, 'APPLIED', '{}'::jsonb, 'dup')`,
        [companyId, ids.D],
      ),
    ).rejects.toThrow(/UQ_leave_alloc_backfill_applied|duplicate key/);
  });

  it('monthly reconciliation flags periods payroll calculated before the change', async () => {
    const cal = await one<{ id: number }>(
      `INSERT INTO payroll_calendars (company_id, code, name) VALUES ($1,'M','Monthly') RETURNING id`,
      [companyId],
    );
    const period = async (code: string, p: typeof OCT, m: number) =>
      (
        await one<{ id: number }>(
          `INSERT INTO payroll_periods (company_id, payroll_calendar_id, period_code, period_year, period_month,
             start_date, end_date, cutoff_date, payment_date)
           VALUES ($1,$2,$3,2026,$4,$5,$6,$6,$6) RETURNING id`,
          [companyId, cal.id, code, m, p.startDate, p.endDate],
        )
      ).id;
    const octId = await period('2026-10', OCT, 10);
    const novId = await period('2026-11', NOV, 11);
    const result = async (periodId: number, s: Summary, runNo: string) => {
      const run = await one<{ id: number }>(
        `INSERT INTO payroll_runs (company_id, payroll_period_id, run_no, run_type, created_by_company_user_id, version, status)
         VALUES ($1,$2,$3,'REGULAR',$4,1,'LOCKED') RETURNING id`,
        [companyId, periodId, `${runNo}-${suffix}`.slice(0, 50), userId],
      );
      await ds.query(
        `INSERT INTO employee_payroll_results (company_id, payroll_run_id, payroll_period_id, employee_id,
           employee_snapshot, compensation_snapshot, calculation_snapshot, calculation_hash)
         VALUES ($1,$2,$3,$4,'{}','{}',$5,'h')`,
        [
          companyId,
          run.id,
          periodId,
          employeeId,
          JSON.stringify({
            monthly_leave_summary: {
              approved_leave_request_ids: s.leaveRequestIds,
              paid_days: s.paidDays,
              unpaid_days: s.unpaidDays,
              paid_equivalent_days: s.paidEquivalentDays,
              unpaid_equivalent_days: s.unpaidEquivalentDays,
            },
          }),
        ],
      );
    };
    await result(octId, octRecorded, 'OCT');
    await result(novId, await summarize(NOV), 'NOV');
    const recon = new LeavePayrollReconciliationService(ds, (c, e, p) =>
      payroll.summarizeLeave(c, e, p),
    );
    const rows = await recon.reconcile(companyId, '2026-10-01', '2026-11-30');
    const oct = rows.find((r) => r.period_code === '2026-10')!;
    const nov = rows.find((r) => r.period_code === '2026-11')!;
    expect(oct.status).toBe('DIFF');
    expect(oct.recorded_days - oct.expected_days).toBeCloseTo(2, 6);
    expect(
      oct.recorded_unpaid_equivalent_days! -
        oct.expected_unpaid_equivalent_days!,
    ).toBeCloseTo(2, 6);
    expect(nov.status).toBe('MATCH');
    expect(
      LeavePayrollReconciliationService.toCsv(rows).split('\n'),
    ).toHaveLength(3);

    // Cancellation after payroll: Nov payroll recorded A; leave now says no.
    await ds.query(`UPDATE leave_requests SET status='cancelled' WHERE id=$1`, [
      ids.A,
    ]);
    const afterCancel = await recon.reconcile(
      companyId,
      '2026-11-01',
      '2026-11-30',
    );
    expect(afterCancel[0]).toMatchObject({ status: 'DIFF' });
    expect(afterCancel[0].notes).toMatch(/request set differs/);
    await ds.query(`UPDATE leave_requests SET status='approved' WHERE id=$1`, [
      ids.A,
    ]);
  });

  it('reverts a batch exactly, and refuses to revert over later edits', async () => {
    expect(await backfill.revert(batchId, 'e2e')).toEqual({ reverted: 2 });
    const oct = await summarize(OCT);
    expect(oct.unpaidEquivalentDays).toBeCloseTo(
      octRecorded.unpaidEquivalentDays,
      6,
    );
    const nulls = await one<{ n: string }>(
      `SELECT count(*) n FROM leave_requests WHERE id = ANY($1) AND calculation_snapshot IS NULL`,
      [[ids.D, ids.F]],
    );
    expect(Number(nulls.n)).toBe(2);

    const second = await backfill.apply(companyId, 'e2e');
    expect(second.applied).toBe(2);
    await ds.query(
      `UPDATE leave_requests SET calculation_snapshot = calculation_snapshot || '{"edited":true}' WHERE id=$1`,
      [ids.F],
    );
    await expect(backfill.revert(second.batchId, 'e2e')).rejects.toThrow(
      /revert aborted/,
    );
    // Whole revert rolled back: D still backfilled, entries still APPLIED.
    const d = await one<{ s: object | null }>(
      `SELECT calculation_snapshot s FROM leave_requests WHERE id=$1`,
      [ids.D],
    );
    expect(d.s).not.toBeNull();
    const applied = await one<{ n: string }>(
      `SELECT count(*) n FROM leave_allocation_backfill_entries WHERE batch_id=$1 AND status='APPLIED'`,
      [second.batchId],
    );
    expect(Number(applied.n)).toBe(2);
  });
});
