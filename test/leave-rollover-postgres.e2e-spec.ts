/**
 * FRS-11 Phase 2 — year-end rollover with the real Nest services against
 * Postgres: carry-forward cap, lapse, posting idempotency under concurrent
 * approval, re-posting, closed-year guard and ledger reconciliation.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-rollover-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createE2eApp } from './helpers/create-e2e-app';
import { LeaveRolloverService } from '../src/modules/hr/leave/services/leave-rollover.service';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';
import { calculateAvailableLeaveDays } from '../src/modules/hr/leave/utils/leave-balance-rules.util';

describe('Leave year-end rollover (real Postgres, real services)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let rollover: LeaveRolloverService;
  let ledger: LeaveBalanceLedgerService;
  let companyId: number;
  let employeeId: number;
  let typeId: number;
  let runId: number;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;
  const balanceFor = (year: string) =>
    ds.getRepository(LeaveBalance).findOne({
      where: {
        employee_id: employeeId,
        leave_type_id: typeId,
        fiscal_year: year,
      },
    });

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    rollover = app.get(LeaveRolloverService);
    ledger = app.get(LeaveBalanceLedgerService);
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Roll ${suffix}`, `roll-${suffix}`],
    );
    employeeId = await id(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, hire_date, employment_status)
       VALUES ($1,$2,'Roll','Over','female',1,'2020-01-01','active') RETURNING id`,
      [companyId, `R-${suffix}`.slice(0, 50)],
    );
    typeId = await id(
      `INSERT INTO leave_types (company_id, name, code, is_carry_forward_allowed, max_carry_forward_days, max_days_per_year)
       VALUES ($1,'Annual','AL',true,5,20) RETURNING id`,
      [companyId],
    );
    await ds.query(
      `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year, allocated_days, entitlement_days, used_days)
       VALUES ($1,$2,$3,'2025',20,20,8)`,
      [companyId, employeeId, typeId],
    );
  }, 120000);

  afterAll(async () => {
    if (ds?.isInitialized)
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    await app?.close();
  });

  it('previews: 12 unused, 5 carried (cap), 7 lapse', async () => {
    const run = await rollover.createPreview(
      companyId,
      { from_leave_year: '2025' },
      null,
    );
    runId = run.id;
    const [line] = await ds.query(
      `SELECT unused_days, carry_forward_days, lapse_days, exceptions FROM leave_rollover_lines WHERE run_id=$1`,
      [runId],
    );
    expect(Number(line.unused_days)).toBe(12);
    expect(Number(line.carry_forward_days)).toBe(5);
    expect(Number(line.lapse_days)).toBe(7);
    // A second preview for the same year reuses the open run.
    const again = await rollover.createPreview(
      companyId,
      { from_leave_year: '2025' },
      null,
    );
    expect(again.id).toBe(runId);
  });

  it('posts exactly once when two approvals race', async () => {
    await ds.query(
      `UPDATE leave_rollover_runs SET status='pending_approval' WHERE id=$1`,
      [runId],
    );
    const settled = await Promise.allSettled([
      rollover.approveAndPost(companyId, runId, null),
      rollover.approveAndPost(companyId, runId, null),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const next = await balanceFor('2026');
    expect(next).not.toBeNull();
    const carried =
      Number(next!.carried_forward_days) || Number(next!.opening_balance_days);
    expect(carried).toBe(5);
    const old = await balanceFor('2025');
    expect(old!.closed_at).not.toBeNull();
    const types = await ds.query(
      `SELECT transaction_type::text t, leave_year y, amount_days a FROM leave_balance_transactions WHERE company_id=$1 ORDER BY id`,
      [companyId],
    );
    const keyed = types.map((r: { t: string; y: string }) => `${r.t}:${r.y}`);
    expect(new Set(keyed).size).toBe(keyed.length); // no posting duplicated
  });

  it('refuses to post the same run again and leaves balances unchanged', async () => {
    const before = await balanceFor('2026');
    await expect(
      rollover.approveAndPost(companyId, runId, null),
    ).rejects.toThrow();
    const after = await balanceFor('2026');
    expect(after!.carried_forward_days).toBe(before!.carried_forward_days);
    expect(after!.opening_balance_days).toBe(before!.opening_balance_days);
  });

  it('blocks new bookings against the closed year', async () => {
    const closed = (await balanceFor('2025'))!;
    await expect(
      ledger.reserveLeave(closed, {
        companyId,
        employeeId,
        leaveTypeId: typeId,
        leaveYear: '2025',
        effectiveDate: '2025-12-30',
        days: 1,
        allowNegativeBalance: false,
        idempotencyKey: `closed-${suffix}`,
      }),
    ).rejects.toThrow(/has been closed/);
  });

  it('reconciles the new year with the ledger and shows the carried days', async () => {
    const result = await ledger.reconcileBalances(companyId, {
      employeeIds: null,
      fiscalYear: '2026',
      page: 1,
      limit: 10,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).not.toBe('mismatch');
    const next = (await balanceFor('2026'))!;
    expect(Number(result.data[0].available_days)).toBeCloseTo(
      calculateAvailableLeaveDays(next),
      2,
    );
    expect(calculateAvailableLeaveDays(next)).toBeGreaterThanOrEqual(5);
  });
});
