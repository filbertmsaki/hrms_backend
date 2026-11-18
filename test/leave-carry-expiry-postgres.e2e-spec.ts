/**
 * FRS-11 Phase 2/3 — carry-forward expiry and rollover interactions with the
 * real services against Postgres: partially consumed carried days, duplicate
 * and concurrent expiry runs, cancellation after rollover, HR adjustment
 * after rollover, and ledger reconciliation of both years.
 *
 * Policy fixture (synthetic): 20 days/year, carry max 5, carried days expire
 * after month 3 (31 March), used first, auto-expire on.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-carry-expiry-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createE2eApp } from './helpers/create-e2e-app';
import { LeaveRolloverService } from '../src/modules/hr/leave/services/leave-rollover.service';
import { LeaveCarryForwardService } from '../src/modules/hr/leave/services/leave-carry-forward.service';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';
import { LeaveBalanceAdjustmentModeEnum } from '../src/modules/hr/leave/enums/leave-balance-adjustment-mode.enum';
import { calculateAvailableLeaveDays } from '../src/modules/hr/leave/utils/leave-balance-rules.util';

describe('Carry-forward expiry and rollover interactions (real services, Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let rollover: LeaveRolloverService;
  let carry: LeaveCarryForwardService;
  let ledger: LeaveBalanceLedgerService;
  let companyId: number;
  let employeeId: number;
  let typeId: number;
  let userId: number;
  let lastYearLeave: number;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;
  const bal = async (year: string) =>
    await ds.getRepository(LeaveBalance).findOneOrFail({
      where: {
        employee_id: employeeId,
        leave_type_id: typeId,
        fiscal_year: year,
      },
    });
  const base = (year: string) => ({
    companyId,
    employeeId,
    leaveTypeId: typeId,
    leaveYear: year,
  });
  const txCount = async (type: string) =>
    Number(
      (
        await ds.query(
          `SELECT count(*)::int n FROM leave_balance_transactions WHERE company_id=$1 AND transaction_type::text=$2`,
          [companyId, type],
        )
      )[0].n,
    );

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    rollover = app.get(LeaveRolloverService);
    carry = app.get(LeaveCarryForwardService);
    ledger = app.get(LeaveBalanceLedgerService);
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Carry ${suffix}`, `carry-${suffix}`],
    );
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password) VALUES ($1,'C','F',$2,$3,'x') RETURNING id`,
      [
        `UCF${suffix}`.slice(0, 20),
        `+259${suffix}`.slice(0, 15),
        `carry-${suffix}@example.test`,
      ],
    );
    userId = await id(
      `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
      [companyId, user],
    );
    employeeId = await id(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, hire_date, employment_status)
       VALUES ($1,$2,'Carry','Expiry','female',1,'2020-01-01','active') RETURNING id`,
      [companyId, `CF-${suffix}`.slice(0, 50)],
    );
    typeId = await id(
      `INSERT INTO leave_types (company_id, name, code, max_days_per_year) VALUES ($1,'Annual','AL',20) RETURNING id`,
      [companyId],
    );
    const policy = await id(
      `INSERT INTO leave_policies (company_id, name, policy_key, status, lifecycle_status, effective_from, priority)
       VALUES ($1,'Standard annual (synthetic)',$2,'active','active','2020-01-01',1) RETURNING id`,
      [companyId, `std-${suffix}`],
    );
    await ds.query(
      `INSERT INTO leave_policy_types (policy_id, leave_type_id, annual_quota_days, carry_forward_enabled, carry_forward_max_days,
         carry_forward_expiry_months, carry_forward_auto_expire, carry_forward_consume_first)
       VALUES ($1,$2,20,true,5,3,true,true)`,
      [policy, typeId],
    );
    // 2025: 20 entitled, 8 used (via the ledger so it reconciles).
    await ds.query(
      `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year, allocated_days, entitlement_days)
       VALUES ($1,$2,$3,'2025',20,20)`,
      [companyId, employeeId, typeId],
    );
    lastYearLeave = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason,
         created_by_company_user_id, version, status, calculation_snapshot)
       VALUES ($1,$2,$3,$4,'2025-06-02','2025-06-11',8,'Holiday',$5,1,'approved',$6) RETURNING id`,
      [
        companyId,
        employeeId,
        typeId,
        `CF25-${suffix}`.slice(0, 50),
        userId,
        JSON.stringify({
          duration_type: 'FULL_DAY',
          included_dates: [
            '2025-06-02',
            '2025-06-03',
            '2025-06-04',
            '2025-06-05',
            '2025-06-06',
            '2025-06-09',
            '2025-06-10',
            '2025-06-11',
          ],
        }),
      ],
    );
    await ledger.reserveLeave(await bal('2025'), {
      ...base('2025'),
      effectiveDate: '2025-06-02',
      days: 8,
      allowNegativeBalance: false,
      leaveRequestId: lastYearLeave,
      idempotencyKey: `cf-r-${suffix}`,
    });
    await ledger.consumeReservedLeave(await bal('2025'), {
      ...base('2025'),
      effectiveDate: '2025-06-02',
      days: 8,
      leaveRequestId: lastYearLeave,
      idempotencyKey: `cf-c-${suffix}`,
    });

    const run = await rollover.createPreview(
      companyId,
      { from_leave_year: '2025' },
      null,
    );
    await ds.query(
      `UPDATE leave_rollover_runs SET status='pending_approval' WHERE id=$1`,
      [run.id],
    );
    await rollover.approveAndPost(companyId, run.id, null);
  }, 180000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      for (const t of [
        'leave_balance_adjustments',
        'leave_balance_transactions',
      ])
        await ds.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await app?.close();
  });

  it('rollover carried 5 of 12 unused days into 2026', async () => {
    const b = await bal('2026');
    expect(
      Number(b.carried_forward_days) || Number(b.opening_balance_days),
    ).toBe(5);
    expect((await bal('2025')).closed_at).not.toBeNull();
  });

  it('expires only the unused part of carried days, once, even when runs overlap', async () => {
    // 2 days taken in February 2026 consume carried days first.
    const feb = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason,
         created_by_company_user_id, version, status, calculation_snapshot)
       VALUES ($1,$2,$3,$4,'2026-02-09','2026-02-10',2,'Family',$5,1,'approved',$6) RETURNING id`,
      [
        companyId,
        employeeId,
        typeId,
        `CF26-${suffix}`.slice(0, 50),
        userId,
        JSON.stringify({
          duration_type: 'FULL_DAY',
          included_dates: ['2026-02-09', '2026-02-10'],
        }),
      ],
    );
    await ledger.reserveLeave(await bal('2026'), {
      ...base('2026'),
      effectiveDate: '2026-02-09',
      days: 2,
      allowNegativeBalance: false,
      leaveRequestId: feb,
      idempotencyKey: `cf26-r-${suffix}`,
    });
    await ledger.consumeReservedLeave(await bal('2026'), {
      ...base('2026'),
      effectiveDate: '2026-02-09',
      days: 2,
      leaveRequestId: feb,
      idempotencyKey: `cf26-c-${suffix}`,
    });

    // Before the expiry date nothing expires.
    await carry.processCompany(companyId, '2026', '2026-03-31');
    expect(await txCount('EXPIRED')).toBe(0);

    // Two overlapping daily runs after 31 March.
    await Promise.allSettled([
      carry.processCompany(companyId, '2026', '2026-04-01'),
      carry.processCompany(companyId, '2026', '2026-04-01'),
    ]);
    await carry.processCompany(companyId, '2026', '2026-04-02'); // next day's run
    expect(await txCount('EXPIRED')).toBe(1);
    const b = await bal('2026');
    expect(Number(b.expired_days)).toBe(3); // 5 carried − 2 used
    // 5 carried + 20 entitlement − 2 used − 3 expired
    expect(calculateAvailableLeaveDays(b)).toBe(20);
  });

  it('HR adjustment after rollover lands in the open year and reconciles', async () => {
    await ledger.applyManualAdjustment(await bal('2026'), {
      ...base('2026'),
      effectiveDate: '2026-04-10',
      mode: LeaveBalanceAdjustmentModeEnum.ADD,
      amount: 1,
      reason: 'Correction after rollover',
      idempotencyKey: `cf-adj-${suffix}`,
    });
    expect(calculateAvailableLeaveDays(await bal('2026'))).toBe(21);
    const rec = await ledger.reconcileBalances(companyId, {
      employeeIds: null,
      fiscalYear: '2026',
      page: 1,
      limit: 5,
    });
    expect(rec.data[0].status).toBe('reconciled');
  });

  it('cancellation of last-year leave after rollover: closed year stays closed to bookings, ledger stays consistent', async () => {
    // Reversal of the 2025 leave (what the cancellation flow posts).
    await ledger.reverseApprovedLeave(await bal('2025'), {
      ...base('2025'),
      effectiveDate: '2026-04-15',
      days: 8,
      leaveRequestId: lastYearLeave,
      idempotencyKey: `cf-cancel-${suffix}`,
    });
    const closed = await bal('2025');
    expect(Number(closed.used_days)).toBe(0);
    // The restored days sit in the closed year: they cannot be booked there…
    await expect(
      ledger.reserveLeave(closed, {
        ...base('2025'),
        effectiveDate: '2025-12-30',
        days: 1,
        allowNegativeBalance: false,
        idempotencyKey: `cf-closed-${suffix}`,
      }),
    ).rejects.toThrow(/has been closed/);
    // …and the posted carry-forward into 2026 is not silently recomputed.
    expect(
      Number((await bal('2026')).carried_forward_days) ||
        Number((await bal('2026')).opening_balance_days),
    ).toBe(5);
    const rec = await ledger.reconcileBalances(companyId, {
      employeeIds: null,
      fiscalYear: '2025',
      page: 1,
      limit: 5,
    });
    expect(rec.data[0].status).not.toBe('mismatch');
  });
});
