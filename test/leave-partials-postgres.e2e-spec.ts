/**
 * Leave "partials" closure (2026-11-18) against real Postgres and the real
 * Nest services: accumulation cap under concurrency, refunds into a year
 * closed by rollover, year-end encashment approval → automatic payroll
 * handoff (and rejection refund), reconciliation, exit-settlement draft →
 * approve → void, the leave-cycle schedule, and PDF generation timing.
 *
 *   DB_NAME=hrms_leave_partials_e2e npm run test:e2e -- leave-partials-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { createE2eApp } from './helpers/create-e2e-app';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { LeaveService } from '../src/modules/hr/leave/leave.service';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';
import { LeaveBalanceAdjustmentModeEnum } from '../src/modules/hr/leave/enums/leave-balance-adjustment-mode.enum';
import { LeaveRolloverService } from '../src/modules/hr/leave/services/leave-rollover.service';
import { LeaveExitSettlementService } from '../src/modules/hr/leave/services/leave-exit-settlement.service';
import { LeavePayrollReconciliationService } from '../src/modules/hr/leave/services/leave-payroll-reconciliation.service';
import { LeaveConfigReadinessService } from '../src/modules/hr/leave/services/leave-config-readiness.service';
import { calculateAvailableLeaveDays } from '../src/modules/hr/leave/utils/leave-balance-rules.util';

describe('Leave partials closure (real Postgres, real services)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let leave: LeaveService;
  let ledger: LeaveBalanceLedgerService;
  let rollover: LeaveRolloverService;
  let exits: LeaveExitSettlementService;
  let companyId: number;
  let hrCompanyUserId: number;
  let employeeId: number;
  let typeId: number;
  let hr: AuthenticatedUser;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const today = new Date().toISOString().slice(0, 10);
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id as number;
  const balance = (year: string) =>
    ds.getRepository(LeaveBalance).findOneOrFail({
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
    leave = app.get(LeaveService);
    ledger = app.get(LeaveBalanceLedgerService);
    rollover = app.get(LeaveRolloverService);
    exits = app.get(LeaveExitSettlementService);
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Partials ${suffix}`, `partials-${suffix}`],
    );
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password) VALUES ($1,'H','R',$2,$3,'x') RETURNING id`,
      [
        `UP${suffix}`.slice(0, 20),
        `+257${suffix}`.slice(0, 15),
        `partials-${suffix}@example.test`,
      ],
    );
    hrCompanyUserId = await id(
      `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
      [companyId, user],
    );
    hr = {
      id: user,
      email: `partials-${suffix}@example.test`,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId,
      companyMembershipId: hrCompanyUserId,
      roles: ['HR_MANAGER'],
      permissions: [
        'data_scope:company',
        'leave_requests:approve',
        'leave_requests:read',
        'leave_requests:override',
      ],
    } as AuthenticatedUser;
    employeeId = await id(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, hire_date, employment_status)
       VALUES ($1,$2,'Pat','Ials','female',1,'2020-01-01','active') RETURNING id`,
      [companyId, `P-${suffix}`.slice(0, 50)],
    );
    typeId = await id(
      `INSERT INTO leave_types (company_id, name, code, max_days_per_year)
       VALUES ($1,'Annual','AL',20) RETURNING id`,
      [companyId],
    );
    // 2025 closed by rollover; current year open.
    await ds.query(
      `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year, allocated_days, entitlement_days, accrued_days, used_days, closed_at)
       VALUES ($1,$2,$3,'2025',20,20,20,8, now())`,
      [companyId, employeeId, typeId],
    );
    await ds.query(
      `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year, allocated_days, entitlement_days, accrued_days, used_days)
       VALUES ($1,$2,$3,$4,20,20,20,0)`,
      [companyId, employeeId, typeId, today.slice(0, 4)],
    );
  }, 180000);

  afterAll(async () => {
    if (ds?.isInitialized)
      await ds
        .query(`DELETE FROM companies WHERE id=$1`, [companyId])
        .catch(() => undefined);
    await app?.close();
  });

  it('maximum accumulation: concurrent credits cannot both pass the cap', async () => {
    const current = await balance(today.slice(0, 4));
    const available = calculateAvailableLeaveDays(current);
    const cap = { maximumDays: available + 3, policyReference: 'test' };
    const credit = (n: number) =>
      ds.transaction((m) =>
        ledger.applyManualAdjustment(
          current,
          {
            companyId,
            employeeId,
            leaveTypeId: typeId,
            leaveYear: today.slice(0, 4),
            effectiveDate: today,
            mode: LeaveBalanceAdjustmentModeEnum.ADD,
            amount: 2,
            reason: 'cap race',
            idempotencyKey: `cap-race-${suffix}-${n}`,
            accumulationCap: cap,
          },
          m,
        ),
      );
    const settled = await Promise.allSettled([credit(1), credit(2)]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find(
      (s) => s.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(String(rejected.reason?.message)).toMatch(/maximum accumulation/);
    const after = await balance(today.slice(0, 4));
    expect(calculateAvailableLeaveDays(after)).toBeCloseTo(available + 2, 2);
    const [tx] = await ds.query(
      `SELECT metadata FROM leave_balance_transactions WHERE company_id=$1 AND idempotency_key LIKE $2`,
      [companyId, `cap-race-${suffix}-%`],
    );
    expect(tx.metadata.accumulation_cap).toMatchObject({
      exceeded: false,
      maximum_days: available + 3,
    });
  });

  it('refund into a closed year credits the current cycle and leaves the closed year frozen', async () => {
    const closedBefore = await balance('2025');
    const currentBefore = await balance(today.slice(0, 4));
    // An encashment existed on the closed year → HR review flag expected.
    await ds.query(
      `INSERT INTO leave_encashment_requests (company_id, employee_id, leave_type_id, leave_balance_id, fiscal_year, requested_days, approved_days, minimum_balance_after_encashment, reason, status)
       VALUES ($1,$2,$3,$4,'2025',1,1,0,'old','approved')`,
      [companyId, employeeId, typeId, closedBefore.id],
    );
    await expect(
      ledger.reverseApprovedLeave(closedBefore, {
        companyId,
        employeeId,
        leaveTypeId: typeId,
        leaveYear: '2025',
        effectiveDate: today,
        days: 3,
        idempotencyKey: `direct-${suffix}`,
      }),
    ).rejects.toThrow(/closed by the year-end rollover/);

    await ds.transaction((m) =>
      ledger.reverseApprovedLeaveByYear(
        [closedBefore],
        {
          companyId,
          employeeId,
          leaveTypeId: typeId,
          leaveYear: '2025',
          effectiveDate: today,
          days: 3,
          idempotencyKey: `cancel-${suffix}`,
          onClosedYear: (
            leave as unknown as {
              closedYearRefundHandler: (
                ...a: unknown[]
              ) => (b: LeaveBalance, d: number, k: string) => Promise<null>;
            }
          ).closedYearRefundHandler(
            m,
            companyId,
            { id: employeeId, hire_date: '2020-01-01' },
            typeId,
            4242,
            hr,
          ),
        },
        m,
      ),
    );
    const closedAfter = await balance('2025');
    const currentAfter = await balance(today.slice(0, 4));
    expect(closedAfter.used_days).toBe(closedBefore.used_days);
    expect(calculateAvailableLeaveDays(currentAfter)).toBeCloseTo(
      calculateAvailableLeaveDays(currentBefore) + 3,
      2,
    );
    const [flag] = await ds.query(
      `SELECT payload FROM leave_audit_logs WHERE company_id=$1 AND action='leave_balance.closed_year_refund_needs_review'`,
      [companyId],
    );
    expect(flag.payload.closed_leave_year).toBe('2025');
  });

  let approvedEncashmentId: number;
  it('year-end encashment: HR approval hands it to payroll automatically, never marks it paid', async () => {
    const closed = await balance('2025');
    const make = async (label: string) => {
      const encId = await id(
        `INSERT INTO leave_encashment_requests (company_id, employee_id, leave_type_id, leave_balance_id, fiscal_year, requested_days, approved_days,
           minimum_balance_after_encashment, reason, status, source, currency, calculated_amount, payable_amount, daily_rate, calculation)
         VALUES ($1,$2,$3,$4,'2025',2,2,0,$5,'pending','rollover','TZS',200000,200000,100000,'{"awaiting_hr_approval":true}') RETURNING id`,
        [companyId, employeeId, typeId, closed.id, label],
      );
      const tx = await ds.transaction((m) =>
        ledger.applyEncashment(
          closed,
          {
            companyId,
            employeeId,
            leaveTypeId: typeId,
            leaveYear: '2025',
            effectiveDate: '2025-12-31',
            days: 2,
            requestId: encId,
            idempotencyKey: `rollover-encash-${label}-${suffix}`,
          },
          m,
        ),
      );
      await ds.query(
        `UPDATE leave_encashment_requests SET ledger_transaction_id=$2 WHERE id=$1`,
        [encId, tx.transaction.id],
      );
      return encId;
    };
    approvedEncashmentId = await make('approve');
    const rejectId = await make('reject');

    await expect(
      leave.decideLeaveEncashmentRequest(
        companyId,
        approvedEncashmentId,
        { approve: true, approved_days: 1 } as never,
        hr,
      ),
    ).rejects.toThrow(/approved in full or rejected/);

    // No payroll period yet: approval succeeds, handoff is recorded as failed.
    await leave.decideLeaveEncashmentRequest(
      companyId,
      approvedEncashmentId,
      { approve: true } as never,
      hr,
    );
    let [row] = await ds.query(
      `SELECT status, payment_status, payroll_input_id, calculation FROM leave_encashment_requests WHERE id=$1`,
      [approvedEncashmentId],
    );
    expect(row.status).toBe('approved');
    expect(row.payroll_input_id).toBeNull();
    expect(row.calculation.auto_handoff_last_error).toMatch(
      /No open payroll period/,
    );

    const cal = await id(
      `INSERT INTO payroll_calendars (company_id, code, name) VALUES ($1,'M','Monthly') RETURNING id`,
      [companyId],
    );
    const end = new Date(Date.now() + 20 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await ds.query(
      `INSERT INTO payroll_periods (company_id, payroll_calendar_id, period_code, period_year, period_month, start_date, end_date, cutoff_date, payment_date, status)
       VALUES ($1,$2,'P-NEXT',2026,12,$3,$4,$4,$4,'OPEN')`,
      [companyId, cal, today, end],
    );
    await ds.query(
      `INSERT INTO payroll_components (company_id, code, name, component_type, calculation_method, version, status, calculation_configuration)
       VALUES ($1,'LEAVE_ENCASHMENT','Leave encashment','EARNING','EXTERNAL_INPUT',1,'ACTIVE',$2)`,
      [companyId, JSON.stringify({ test_configuration: true })],
    );
    expect(await leave.retryPendingAutoHandOffs(companyId)).toMatchObject({
      handed_off: 1,
    });
    expect(await leave.retryPendingAutoHandOffs(companyId)).toMatchObject({
      handed_off: 0,
    });
    [row] = await ds.query(
      `SELECT e.payment_status, e.payroll_period_code, i.status::text input_status, i.amount::float amount
         FROM leave_encashment_requests e JOIN payroll_inputs i ON i.id = e.payroll_input_id WHERE e.id=$1`,
      [approvedEncashmentId],
    );
    expect(row).toMatchObject({
      payment_status: 'IN_PAYROLL',
      payroll_period_code: 'P-NEXT',
      input_status: 'DRAFT',
      amount: 200000,
    });
    const inputs = await ds.query(
      `SELECT count(*)::int n FROM payroll_inputs WHERE company_id=$1`,
      [companyId],
    );
    expect(inputs[0].n).toBe(1);

    // Rejection refunds the days to the current cycle, closed year unchanged.
    const before = calculateAvailableLeaveDays(
      await balance(today.slice(0, 4)),
    );
    await leave.decideLeaveEncashmentRequest(
      companyId,
      rejectId,
      { approve: false, comments: 'no' } as never,
      hr,
    );
    expect(
      calculateAvailableLeaveDays(await balance(today.slice(0, 4))),
    ).toBeCloseTo(before + 2, 2);
  }, 60000);

  it('reconciliation classifies the handed-off encashment as submitted', async () => {
    const recon = new LeavePayrollReconciliationService(ds);
    const rows = await recon.reconcileEncashments(
      companyId,
      '2020-01-01',
      today,
    );
    const mine = rows.find((r) => r.encashment_id === approvedEncashmentId)!;
    expect(mine.status).toBe('SUBMITTED');
    expect(mine.payroll_input_amount).toBe(200000);
  });

  it('exit settlement: preview changes no leave; approve and void transitions', async () => {
    const future = new Date(Date.now() + 40 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const exitDate = new Date(Date.now() + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const reqId = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason, created_by_company_user_id, version, status)
       VALUES ($1,$2,$3,$4,$5,$5,1,'future',$6,1,'approved') RETURNING id`,
      [
        companyId,
        employeeId,
        typeId,
        `LP-${suffix}`.slice(0, 50),
        future,
        hrCompanyUserId,
      ],
    );
    const offId = await id(
      `INSERT INTO offboarding_requests (company_id, employee_id, offboarding_code, title, offboarding_type, reason, last_working_date, version)
       VALUES ($1,$2,$3,'Exit','resignation','fixture',$4,1) RETURNING id`,
      [companyId, employeeId, `OFF-${suffix}`.slice(0, 40), exitDate],
    );
    await exits.settle(companyId, employeeId, exitDate, hr, offId, 'preview');
    const [req] = await ds.query(
      `SELECT status FROM leave_requests WHERE id=$1`,
      [reqId],
    );
    expect(req.status).toBe('approved'); // preview never cancels leave

    // Settlement rows depend on policy (accruing/encashable); seed a draft
    // to verify the approval and void transitions deterministically.
    const settlementId = await id(
      `INSERT INTO leave_exit_settlements (company_id, employee_id, leave_type_id, offboarding_request_id, exit_date, earned_to_exit_days, carried_forward_days, adjusted_days, used_days, deducted_days, settlement_days, status)
       VALUES ($1,$2,$3,$4,$5,10,0,0,2,0,8,'draft') RETURNING id`,
      [companyId, employeeId, typeId, offId, exitDate],
    );
    await exits.approve(companyId, offId, hr);
    let [s] = await ds.query(
      `SELECT status, details FROM leave_exit_settlements WHERE id=$1`,
      [settlementId],
    );
    expect(s.status).toBe('approved');
    expect(s.details.approved_by_company_user_id).toBe(hrCompanyUserId);
    await expect(exits.approve(companyId, offId, hr)).rejects.toThrow(
      /no draft/,
    );
    await exits.voidForOffboarding(companyId, offId, 'Offboarding cancelled');
    [s] = await ds.query(
      `SELECT status FROM leave_exit_settlements WHERE id=$1`,
      [settlementId],
    );
    expect(s.status).toBe('void');
    const recon = await new LeavePayrollReconciliationService(
      ds,
    ).reconcileExitSettlements(companyId, '2020-01-01', '2100-01-01');
    expect(recon.find((r) => r.settlement_id === settlementId)?.status).toBe(
      'VOID',
    );
  }, 60000);

  it('cycle schedule lists closed and open cycles per balance', async () => {
    const res = await rollover.listCycleSchedule(companyId, {});
    const byYear = Object.fromEntries(
      res.data.map((r) => [r.leave_year as string, r.processing_status]),
    );
    expect(byYear['2025']).toBe('closed');
    expect(byYear[today.slice(0, 4)]).toBe('open');
  });

  it('readiness report runs the new checks', async () => {
    const report = await new LeaveConfigReadinessService(ds).report(companyId);
    const areas = new Set(report.findings.map((f) => f.area));
    for (const a of ['workflows', 'notifications', 'scheduler'])
      expect(areas.has(a as never)).toBe(true);
    expect(
      report.findings.find((f) => f.code === 'no_active_workflow'),
    ).toBeDefined();
  });

  it('PDF: generates with concurrent reads (timing and query count reported)', async () => {
    const reqId = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason, created_by_company_user_id, version, status, calculation_snapshot)
       VALUES ($1,$2,$3,$4,$5,$5,1,'pdf',$6,1,'approved',$7) RETURNING id`,
      [
        companyId,
        employeeId,
        typeId,
        `PDF-${suffix}`.slice(0, 50),
        today,
        hrCompanyUserId,
        JSON.stringify({ included_dates: [today] }),
      ],
    );
    let queries = 0;
    const seen = new Map<string, number>();
    const original = PostgresQueryRunner.prototype.query;
    PostgresQueryRunner.prototype.query = function (
      this: PostgresQueryRunner,
      ...args: Parameters<typeof original>
    ) {
      queries += 1;
      if (process.env.PDF_QUERY_DUMP) {
        const k = String(args[0]).replace(/\s+/g, ' ').slice(0, 110);
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      return original.apply(this, args);
    } as typeof original;
    const timings: number[] = [];
    try {
      await leave.getLeaveRequestPdf(companyId, reqId, hr); // warm-up
      queries = 0;
      for (let i = 0; i < 5; i++) {
        const t = Date.now();
        const pdf = await leave.getLeaveRequestPdf(companyId, reqId, hr);
        timings.push(Date.now() - t);
        expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
      }
      const t = Date.now();
      await Promise.all(
        [1, 2, 3, 4].map(() => leave.getLeaveRequestPdf(companyId, reqId, hr)),
      );
      const concurrent = Date.now() - t;

      console.log(
        `PDF timing ms: ${timings.join(', ')} (median ${[...timings].sort((a, b) => a - b)[2]}); 4 concurrent: ${concurrent} ms; queries per PDF: ${(queries / 9).toFixed(1)}; rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`,
      );
      if (process.env.PDF_QUERY_DUMP)
        console.log(
          [...seen]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([k, n]) => `${n}x ${k}`)
            .join('\n'),
        );
    } finally {
      PostgresQueryRunner.prototype.query = original;
    }
  }, 120000);
});
