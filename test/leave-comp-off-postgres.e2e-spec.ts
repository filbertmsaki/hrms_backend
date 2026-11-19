/**
 * FRS-11.1.09 compensatory-off lifecycle against real Postgres: disabled by
 * default, source-linked earning, approval, duplicate protection (including
 * concurrent retries), FIFO expiry of the unused part, reversal, utilisation,
 * ledger reconciliation and exclusion of converted overtime from pay.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-comp-off-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';
import { LeaveBalanceTransaction } from '../src/modules/hr/leave/entities/leave-balance-transaction.entity';
import { LeaveBalanceAdjustment } from '../src/modules/hr/leave/entities/leave-balance-adjustment.entity';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';
import { LeaveCompOffService } from '../src/modules/hr/leave/services/leave-comp-off.service';
import { calculateAvailableLeaveDays } from '../src/modules/hr/leave/utils/leave-balance-rules.util';
import { EmployeePayrollCalculationService } from '../src/modules/hr/payroll/services/payroll-core.services';
import { PayrollOvertimeRequest } from '../src/modules/hr/payroll/entities/payroll-overtime-request.entity';
import { PayrollOvertimePolicy } from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import { AttendanceDailySummary } from '../src/modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceHoliday } from '../src/modules/hr/attendance/holidays/entities/holiday.entity';

describe('Compensatory off (real Postgres)', () => {
  let ds: DataSource;
  let ledger: LeaveBalanceLedgerService;
  let svc: LeaveCompOffService;
  let companyId: number;
  let employeeId: number;
  let typeId: number;
  let hrUser: number;
  const ot: number[] = [];
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;
  const hr = () =>
    ({
      userId: 1,
      companyId,
      companyMembershipId: hrUser,
      employeeId: 0,
      permissions: [],
    }) as never;
  const balance = async () =>
    (await ds.getRepository(LeaveBalance).findOne({
      where: {
        employee_id: employeeId,
        leave_type_id: typeId,
        fiscal_year: '2026',
      },
    }))!;

  const balanceFor = async (
    m: EntityManager,
    c: number,
    e: number,
    t: number,
    y: string,
  ) => {
    await m.query(
      `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year) VALUES ($1,$2,$3,$4)
       ON CONFLICT ON CONSTRAINT "UQ_leave_balance_employee_type_year" DO NOTHING`,
      [c, e, t, y],
    );
    return m.getRepository(LeaveBalance).findOneOrFail({
      where: {
        company_id: c,
        employee_id: e,
        leave_type_id: t,
        fiscal_year: y,
      },
      lock: { mode: 'pessimistic_write' },
    });
  };

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    ds = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Comp ${suffix}`, `comp-${suffix}`],
    );
    employeeId = await id(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, employment_type)
       VALUES ($1,$2,'Comp','Off','male',1,'full_time') RETURNING id`,
      [companyId, `C-${suffix}`.slice(0, 50)],
    );
    typeId = await id(
      `INSERT INTO leave_types (company_id, name, code, max_days_per_year) VALUES ($1,'Compensatory off','CO',0) RETURNING id`,
      [companyId],
    );
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password) VALUES ($1,'H','R',$2,$3,'x') RETURNING id`,
      [
        `UC${suffix}`.slice(0, 20),
        `+256${suffix}`.slice(0, 15),
        `co-${suffix}@example.test`,
      ],
    );
    hrUser = await id(
      `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
      [companyId, user],
    );
    for (const [date, minutes] of [
      ['2026-03-02', 480],
      ['2026-03-09', 240],
      ['2026-04-06', 480],
      ['2026-05-04', 480],
    ] as const) {
      ot.push(
        await id(
          `INSERT INTO payroll_overtime_requests (company_id, employee_id, work_date, requested_minutes, reason, status)
           VALUES ($1,$2,$3,$4,'Year-end closing','APPROVED') RETURNING id`,
          [companyId, employeeId, date, minutes],
        ),
      );
    }
    ledger = new LeaveBalanceLedgerService(
      ds.getRepository(LeaveBalanceTransaction),
      ds.getRepository(LeaveBalance),
      ds.getRepository(LeaveBalanceAdjustment),
    );
    svc = new LeaveCompOffService(ds, ledger, balanceFor);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      for (const t of [
        'leave_comp_off_credits',
        'leave_comp_off_policies',
        'leave_balance_adjustments',
        'leave_balance_transactions',
      ])
        await ds.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
      await ds.destroy();
    }
  });

  const earn = (i: number) =>
    svc.earn(
      companyId,
      {
        employeeId,
        leaveTypeId: typeId,
        sourceType: 'OVERTIME_REQUEST',
        sourceReference: String(ot[i]),
      },
      null,
    );

  it('earns nothing while comp-off is disabled or the policy is not approved', async () => {
    await expect(earn(0)).rejects.toThrow(/not enabled/);
    await ds.query(`UPDATE leave_types SET comp_off_enabled=true WHERE id=$1`, [
      typeId,
    ]);
    await expect(earn(0)).rejects.toThrow(/no HR-approved policy/);
    await ds.query(
      `INSERT INTO leave_comp_off_policies (company_id, leave_type_id, status, hours_per_day, expiry_days, requires_approval)
       VALUES ($1,$2,'draft',8,60,true)`,
      [companyId, typeId],
    );
    await expect(earn(0)).rejects.toThrow(/no HR-approved policy/);
    const [{ n }] = await ds.query(
      `SELECT count(*)::int n FROM leave_comp_off_credits WHERE company_id=$1`,
      [companyId],
    );
    expect(n).toBe(0);
  });

  it('earns once per overtime request, even under concurrent retries, pending approval', async () => {
    await ds.query(
      `UPDATE leave_comp_off_policies SET status='approved', approved_at=now() WHERE company_id=$1`,
      [companyId],
    );
    const results = await Promise.all([earn(0), earn(0), earn(0)]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.credit.id)).size).toBe(1);
    expect(results[0].credit).toMatchObject({
      status: 'pending_approval',
      days: '1.00',
      expires_on: '2026-05-01',
    });
    // Pending approval: nothing reaches the ledger yet.
    const [{ n }] = await ds.query(
      `SELECT count(*)::int n FROM leave_balance_transactions WHERE company_id=$1`,
      [companyId],
    );
    expect(n).toBe(0);
  });

  it('rejects self-approval and credits the ledger on HR approval', async () => {
    const [credit] = await ds.query(
      `SELECT id FROM leave_comp_off_credits WHERE source_reference=$1`,
      [String(ot[0])],
    );
    await expect(
      svc.decide(companyId, credit.id, true, {
        userId: 1,
        companyId,
        companyMembershipId: 999,
        employeeId,
        permissions: [],
      } as never),
    ).rejects.toThrow(/own compensatory off/);
    const approved = await svc.decide(companyId, credit.id, true, hr());
    expect(approved.status).toBe('credited');
    expect(calculateAvailableLeaveDays(await balance())).toBe(1);
    await expect(svc.decide(companyId, credit.id, true, hr())).rejects.toThrow(
      /already credited/,
    );
    for (const i of [1, 2, 3]) {
      const { credit: c } = await earn(i);
      await svc.decide(companyId, c.id, true, hr());
    }
    // 1 + 0.5 + 1 + 1
    expect(calculateAvailableLeaveDays(await balance())).toBe(3.5);
  });

  it('excludes converted overtime from overtime pay', async () => {
    // A fifth approved overtime request in March that was NOT converted.
    const paid = await id(
      `INSERT INTO payroll_overtime_requests (company_id, employee_id, work_date, requested_minutes, reason, status)
       VALUES ($1,$2,'2026-03-16',120,'Stock count','APPROVED') RETURNING id`,
      [companyId, employeeId],
    );
    for (const [date, minutes] of [
      ['2026-03-02', 480],
      ['2026-03-09', 240],
      ['2026-03-16', 120],
    ] as const) {
      await ds.getRepository(AttendanceDailySummary).save(
        ds.getRepository(AttendanceDailySummary).create({
          companyId,
          branchId: null,
          employeeId,
          attendanceDate: date,
          scheduleSource: 'COMP_OFF_FIXTURE',
          shiftId: null,
          timetableId: null,
          timezone: 'Africa/Dar_es_Salaam',
          scheduleStartAt: null,
          scheduleEndAt: null,
          checkInAt: null,
          checkOutAt: null,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          workMinutes: 480,
          breakMinutes: 0,
          overtimeMinutes: minutes,
          attendanceStatus: 'PRESENT',
          remarks: null,
          flags: { overtimeRequiresApproval: true },
          sourceFirstRawLogId: null,
          sourceLastRawLogId: null,
          calculationVersion: 1,
          isAdjusted: false,
          adjustedByCompanyUserId: null,
          adjustedAt: null,
          finalizedAt: new Date('2026-04-01T00:00:00Z'),
        }),
      );
    }
    const pay = Object.create(EmployeePayrollCalculationService.prototype);
    Object.assign(pay, {
      attendanceRepository: ds.getRepository(AttendanceDailySummary),
      overtimeRequestRepository: ds.getRepository(PayrollOvertimeRequest),
      overtimePolicyRepository: ds.getRepository(PayrollOvertimePolicy),
      holidayRepository: ds.getRepository(AttendanceHoliday),
    });
    const march = { startDate: '2026-03-01', endDate: '2026-03-31' };
    const totals = await pay.summarizeAttendance(companyId, employeeId, march);
    // Only the unconverted 120 minutes are payable; 720 converted minutes are not.
    expect(totals.payableOvertimeMinutes).toBe(120);

    // Reversing a converted credit makes that overtime payable again.
    await ds.query(
      `UPDATE leave_comp_off_credits SET status='reversed' WHERE source_reference=$1`,
      [String(ot[1])],
    );
    expect(
      (await pay.summarizeAttendance(companyId, employeeId, march))
        .payableOvertimeMinutes,
    ).toBe(360);
    await ds.query(
      `UPDATE leave_comp_off_credits SET status='credited' WHERE source_reference=$1`,
      [String(ot[1])],
    );
    await ds.query(`DELETE FROM payroll_overtime_requests WHERE id=$1`, [paid]);
  });

  it('uses credits oldest first and expires only the unused part', async () => {
    // Employee takes 1.25 days of comp-off: consumes the March 2 credit and part of March 9.
    const b = await balance();
    await ledger.reserveLeave(b, {
      companyId,
      employeeId,
      leaveTypeId: typeId,
      leaveYear: '2026',
      effectiveDate: '2026-04-20',
      days: 1.25,
      allowNegativeBalance: false,
      idempotencyKey: `co-take-${suffix}`,
    });
    await ledger.consumeReservedLeave(await balance(), {
      companyId,
      employeeId,
      leaveTypeId: typeId,
      leaveYear: '2026',
      effectiveDate: '2026-04-20',
      days: 1.25,
      idempotencyKey: `co-take-${suffix}:c`,
    });
    expect(calculateAvailableLeaveDays(await balance())).toBe(2.25);

    // On 2026-05-10 the March credits (expire 05-01 and 05-08) are due.
    const first = await svc.expireDue(companyId, '2026-05-10');
    expect(first).toEqual({ expired: 2, days: 0.25 }); // 0 left of Mar-02, 0.25 left of Mar-09
    expect(calculateAvailableLeaveDays(await balance())).toBe(2);
    // Rerun is a no-op.
    expect(await svc.expireDue(companyId, '2026-05-10')).toEqual({
      expired: 0,
      days: 0,
    });
    const statuses = await ds.query(
      `SELECT source_reference, status, expired_days FROM leave_comp_off_credits WHERE company_id=$1 ORDER BY work_date`,
      [companyId],
    );
    expect(
      statuses.map((s: { status: string; expired_days: string }) => [
        s.status,
        Number(s.expired_days),
      ]),
    ).toEqual([
      ['expired', 0],
      ['expired', 0.25],
      ['credited', 0],
      ['credited', 0],
    ]);
  });

  it('reverses an unused credit once, refuses one that is already used, and reports utilisation', async () => {
    const [last] = await ds.query(
      `SELECT id FROM leave_comp_off_credits WHERE source_reference=$1`,
      [String(ot[3])],
    );
    const reversed = await svc.reverse(
      companyId,
      last.id,
      hr(),
      'Overtime cancelled by manager',
    );
    expect(reversed.status).toBe('reversed');
    expect(
      await svc.reverse(companyId, last.id, hr(), 'Retry of the same reversal'),
    ).toMatchObject({ status: 'reversed' });
    expect(calculateAvailableLeaveDays(await balance())).toBe(1);
    // Use the remaining day, then try to reverse its credit.
    await ledger.reserveLeave(await balance(), {
      companyId,
      employeeId,
      leaveTypeId: typeId,
      leaveYear: '2026',
      effectiveDate: '2026-05-20',
      days: 1,
      allowNegativeBalance: false,
      idempotencyKey: `co-take2-${suffix}`,
    });
    const [april] = await ds.query(
      `SELECT id FROM leave_comp_off_credits WHERE source_reference=$1`,
      [String(ot[2])],
    );
    await expect(
      svc.reverse(companyId, april.id, hr(), 'Overtime cancelled'),
    ).rejects.toThrow(/already been used/);

    const [u] = await svc.utilization(companyId, '2026');
    expect(u).toMatchObject({
      earned_days: 3.5,
      expired_days: 0.25,
      reversed_days: 1,
      pending_days: 0,
    });

    const rec = await ledger.reconcileBalances(companyId, {
      employeeIds: null,
      fiscalYear: '2026',
      page: 1,
      limit: 5,
    });
    expect(rec.data[0].status).toBe('reconciled');
  });
});
