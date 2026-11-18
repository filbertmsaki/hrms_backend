/**
 * FRS-11 Phase 2 — leave ledger integrity against real Postgres: reservation,
 * consumption, release, cancellation reversal, adjustment, negative-balance
 * guard, half days, idempotent retries, concurrent approvals under row locks,
 * and ledger ↔ balance reconciliation.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-ledger-integrity-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';
import { LeaveBalanceTransaction } from '../src/modules/hr/leave/entities/leave-balance-transaction.entity';
import { LeaveBalanceAdjustment } from '../src/modules/hr/leave/entities/leave-balance-adjustment.entity';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';
import { LeaveBalanceAdjustmentModeEnum } from '../src/modules/hr/leave/enums/leave-balance-adjustment-mode.enum';
import { calculateAvailableLeaveDays } from '../src/modules/hr/leave/utils/leave-balance-rules.util';

describe('Leave ledger integrity (real Postgres)', () => {
  let ds: DataSource;
  let ledger: LeaveBalanceLedgerService;
  let companyId: number;
  let employeeId: number;
  let leaveTypeId: number;
  let balanceId: number;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const YEAR = '2026';

  const base = () => ({
    companyId,
    employeeId,
    leaveTypeId,
    leaveYear: YEAR,
    effectiveDate: '2026-11-17',
  });

  /** Mirrors the service pattern: lock the balance row, then mutate. */
  const locked = <T>(fn: (b: LeaveBalance, m: EntityManager) => Promise<T>) =>
    ds.transaction(async (m) => {
      const b = await m.getRepository(LeaveBalance).findOneOrFail({
        where: { id: balanceId },
        lock: { mode: 'pessimistic_write' },
      });
      return fn(b, m);
    });

  const balance = () =>
    ds.getRepository(LeaveBalance).findOneByOrFail({ id: balanceId });
  const available = async () => calculateAvailableLeaveDays(await balance());

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? '')) {
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    }
    ds = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    const q = async (sql: string, p: unknown[]) =>
      (await ds.query(sql, p))[0].id;
    companyId = await q(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Ledger ${suffix}`, `ledger-${suffix}`],
    );
    employeeId = await q(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version)
       VALUES ($1,$2,'Ledger','Employee','male',1) RETURNING id`,
      [companyId, `L-${suffix}`.slice(0, 50)],
    );
    leaveTypeId = await q(
      `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Annual','AL') RETURNING id`,
      [companyId],
    );
    balanceId = await q(
      `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year, allocated_days, entitlement_days)
       VALUES ($1,$2,$3,$4,10,10) RETURNING id`,
      [companyId, employeeId, leaveTypeId, YEAR],
    );
    ledger = new LeaveBalanceLedgerService(
      ds.getRepository(LeaveBalanceTransaction),
      ds.getRepository(LeaveBalance),
      ds.getRepository(LeaveBalanceAdjustment),
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(
        `DELETE FROM leave_balance_adjustments WHERE company_id=$1`,
        [companyId],
      );
      await ds.query(
        `DELETE FROM leave_balance_transactions WHERE company_id=$1`,
        [companyId],
      );
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
      await ds.destroy();
    }
  });

  it('reserves once per idempotency key, including concurrent retries', async () => {
    const reserve = () =>
      locked((b, m) =>
        ledger.reserveLeave(
          b,
          {
            ...base(),
            days: 4,
            allowNegativeBalance: false,
            idempotencyKey: 'req-1:reserve',
          },
          m,
        ),
      );
    const results = await Promise.all([reserve(), reserve(), reserve()]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(Number((await balance()).pending_days)).toBe(4);
    expect(await available()).toBe(6);
  });

  it('serialises concurrent approvals so the balance is never over-booked', async () => {
    const reserve = (key: string) =>
      locked((b, m) =>
        ledger.reserveLeave(
          b,
          {
            ...base(),
            days: 4,
            allowNegativeBalance: false,
            idempotencyKey: key,
          },
          m,
        ),
      );
    const settled = await Promise.allSettled([
      reserve('req-2:reserve'),
      reserve('req-3:reserve'),
    ]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find(
      (s) => s.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(String(rejected.reason?.message)).toMatch(
      /Insufficient leave balance/,
    );
    expect(Number((await balance()).pending_days)).toBe(8);
    expect(await available()).toBe(2);
  });

  it('consumes, releases and reverses exactly once', async () => {
    const consume = () =>
      locked((b, m) =>
        ledger.consumeReservedLeave(
          b,
          { ...base(), days: 4, idempotencyKey: 'req-1:consume' },
          m,
        ),
      );
    await consume();
    await consume();
    let b = await balance();
    expect([Number(b.used_days), Number(b.pending_days)]).toEqual([4, 4]);

    // The second reservation (whichever won) is withdrawn.
    await locked((bal, m) =>
      ledger.releaseReservedLeave(
        bal,
        { ...base(), days: 4, idempotencyKey: 'req-x:release' },
        m,
      ),
    );
    b = await balance();
    expect(Number(b.pending_days)).toBe(0);

    // Cancellation of approved leave: retried with the same key, then a stray
    // second key — used days never go negative.
    const reverse = (key: string) =>
      locked((bal, m) =>
        ledger.reverseApprovedLeave(
          bal,
          { ...base(), days: 4, idempotencyKey: key },
          m,
        ),
      );
    await reverse('req-1:cancel');
    await reverse('req-1:cancel');
    await reverse('req-1:cancel-dup');
    b = await balance();
    expect(Number(b.used_days)).toBe(0);
    expect(await available()).toBe(10);
  });

  it('handles half days and the negative-balance policy', async () => {
    await locked((b, m) =>
      ledger.reserveLeave(
        b,
        {
          ...base(),
          days: 0.5,
          allowNegativeBalance: false,
          idempotencyKey: 'half:reserve',
        },
        m,
      ),
    );
    await locked((b, m) =>
      ledger.consumeReservedLeave(
        b,
        { ...base(), days: 0.5, idempotencyKey: 'half:consume' },
        m,
      ),
    );
    expect(await available()).toBe(9.5);
    await expect(
      locked((b, m) =>
        ledger.reserveLeave(
          b,
          {
            ...base(),
            days: 20,
            allowNegativeBalance: false,
            idempotencyKey: 'neg:no',
          },
          m,
        ),
      ),
    ).rejects.toThrow(/Insufficient leave balance/);
    expect(await available()).toBe(9.5);
    await locked((b, m) =>
      ledger.reserveLeave(
        b,
        {
          ...base(),
          days: 12,
          allowNegativeBalance: true,
          idempotencyKey: 'neg:yes',
        },
        m,
      ),
    );
    expect(await available()).toBe(-2.5);
    await locked((b, m) =>
      ledger.releaseReservedLeave(
        b,
        { ...base(), days: 12, idempotencyKey: 'neg:yes:release' },
        m,
      ),
    );
    expect(await available()).toBe(9.5);
  });

  it('applies manual SET adjustments once and records an audit row', async () => {
    const adjust = () =>
      locked((b, m) =>
        ledger.applyManualAdjustment(
          b,
          {
            ...base(),
            mode: LeaveBalanceAdjustmentModeEnum.SET,
            amount: 12,
            reason: 'HR correction',
            idempotencyKey: 'adj-1',
          },
          m,
        ),
      );
    await adjust();
    await adjust();
    expect(await available()).toBe(12);
    const rows = await ds.query(
      `SELECT count(*)::int n FROM leave_balance_adjustments WHERE company_id=$1`,
      [companyId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('reconciles the stored balance to the ledger with zero differences', async () => {
    const result = await ledger.reconcileBalances(companyId, {
      employeeIds: null,
      fiscalYear: YEAR,
      page: 1,
      limit: 10,
    });
    expect(result.data).toHaveLength(1);
    const row = result.data[0];
    expect(row.status).toBe('reconciled');
    expect(row.differences).toEqual({
      used_days: '0.00',
      pending_days: '0.00',
      adjusted_days: '0.00',
    });
    expect(Number(row.available_days)).toBe(await available());
    // Independent check straight from SQL: running totals chain without gaps.
    const tx: Array<{ prev: string; amt: string; next: string }> =
      await ds.query(
        `SELECT previous_used_days prev, used_delta_days amt, new_used_days next
         FROM leave_balance_transactions WHERE leave_balance_id=$1 ORDER BY id`,
        [balanceId],
      );
    for (let i = 0; i < tx.length; i++) {
      expect(Number(tx[i].prev) + Number(tx[i].amt)).toBeCloseTo(
        Number(tx[i].next),
        2,
      );
      if (i > 0)
        expect(Number(tx[i].prev)).toBeCloseTo(Number(tx[i - 1].next), 2);
    }
  });
});
