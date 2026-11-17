/**
 * FRS-11 payroll money reconciliation (TZS) through the real payroll engine
 * (EmployeePayrollCalculationService.calculateRun) against Postgres.
 *
 * SYNTHETIC TEST CONFIGURATION — not approved business values:
 *  - base salary TZS 3,100,000 / 1,000,000 per month, proration CALENDAR_DAYS;
 *  - no statutory rule versions (so no PAYE / NSSF lines are produced; the
 *    tests assert only BASIC and LWP lines);
 *  - sick-pay bands 3 days @100%, 4 @50%, then unpaid (illustrative).
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-payroll-money-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createE2eApp } from './helpers/create-e2e-app';
import { EmployeePayrollCalculationService } from '../src/modules/hr/payroll/services/payroll-core.services';
import { PayrollPeriod } from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import { PayrollRun } from '../src/modules/hr/payroll/entities/payroll-run.entities';
import { PayrollInputService } from '../src/modules/hr/payroll/services/payroll-core.services';
import { LeaveService } from '../src/modules/hr/leave/leave.service';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';
import { LeaveBalance } from '../src/modules/hr/leave/entities/leave-balance.entity';

type Output = Awaited<
  ReturnType<EmployeePayrollCalculationService['calculateRun']>
>[number];

describe('Leave → payroll money in TZS (real payroll engine, real Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let payroll: EmployeePayrollCalculationService;
  let companyId: number;
  let userId: number;
  let sick: number;
  let unpaid: number;
  const emp: Record<string, number> = {};
  const leave: Record<string, number> = {};
  const periods: Record<string, PayrollPeriod> = {};
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;

  async function employee(key: string, salary: string) {
    emp[key] = await id(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, hire_date, employment_status)
       VALUES ($1,$2,$3,'Pay','female',1,'2020-01-01','active') RETURNING id`,
      [companyId, `${key}-${suffix}`.slice(0, 50), key],
    );
    await ds.query(
      `INSERT INTO employee_payroll_profiles (company_id, employee_id, payroll_number, effective_from, version, payroll_enabled, payroll_hold)
       VALUES ($1,$2,$3,'2020-01-01',1,true,false)`,
      [companyId, emp[key], `P-${key}-${suffix}`.slice(0, 50)],
    );
    await ds.query(
      `INSERT INTO employee_compensation_versions (company_id, employee_id, base_salary, currency, effective_from, version, status)
       VALUES ($1,$2,$3,'TZS','2020-01-01',1,'ACTIVE')`,
      [companyId, emp[key], salary],
    );
  }

  async function request(
    key: string,
    employeeKey: string,
    type: number,
    start: string,
    end: string,
    days: number,
    dates: string[],
    extra: { duration?: string; bands?: object[] } = {},
  ) {
    leave[key] = await id(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, leave_no, start_date, end_date, total_days, reason,
         created_by_company_user_id, version, status, duration_type, calculation_snapshot, pay_breakdown)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'fixture',$8,1,'approved',$9,$10,$11) RETURNING id`,
      [
        companyId,
        emp[employeeKey],
        type,
        `M-${key}-${suffix}`.slice(0, 50),
        start,
        end,
        days,
        userId,
        extra.duration ?? 'FULL_DAY',
        JSON.stringify({
          duration_type: extra.duration ?? 'FULL_DAY',
          included_dates: dates,
        }),
        extra.bands
          ? JSON.stringify({
              rule_set_id: 1,
              rule_type: 'sick_leave',
              bands: extra.bands,
              calculated_at: '2026-10-01',
            })
          : null,
      ],
    );
  }

  const run = async (period: PayrollPeriod) => {
    const r = { id: 0, payrollGroupId: null } as unknown as PayrollRun;
    return payroll.calculateRun(companyId, period, r);
  };
  const lines = (outputs: Output[], key: string) => {
    const o = outputs.find((x) => x.employee.id === emp[key])!;
    const amount = (code: string) =>
      o.lineItems
        .filter((l) => l.componentCode === code)
        .map((l) => String(l.amount));
    return {
      basic: amount('BASIC'),
      lwp: amount('LWP'),
      all: o.lineItems.map((l) => l.componentCode),
      result: o.result,
    };
  };

  beforeAll(async () => {
    if (!/_e2e$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to *_e2e databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    payroll = app.get(EmployeePayrollCalculationService);
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Money ${suffix}`, `money-${suffix}`],
    );
    const user = await id(
      `INSERT INTO users (user_no, first_name, last_name, phone, email, password) VALUES ($1,'P','R',$2,$3,'x') RETURNING id`,
      [
        `UM${suffix}`.slice(0, 20),
        `+257${suffix}`.slice(0, 15),
        `money-${suffix}@example.test`,
      ],
    );
    userId = await id(
      `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
      [companyId, user],
    );
    sick = await id(
      `INSERT INTO leave_types (company_id, name, code, is_paid) VALUES ($1,'Sick','SL',true) RETURNING id`,
      [companyId],
    );
    unpaid = await id(
      `INSERT INTO leave_types (company_id, name, code, is_paid) VALUES ($1,'Unpaid','LWP',false) RETURNING id`,
      [companyId],
    );
    // SYNTHETIC zero-rate PAYE so the engine's mandatory statutory gate
    // passes without inventing any real tax rate. Not a business value.
    const scheme = await id(
      `INSERT INTO statutory_schemes (company_id, code, name, scheme_type, status)
       VALUES ($1,'PAYE-SYNTHETIC-ZERO','Synthetic zero-rate PAYE (test only)','PAYE','ACTIVE') RETURNING id`,
      [companyId],
    );
    const rule = await id(
      `INSERT INTO statutory_rule_versions (company_id, scheme_id, version_number, calculation_method, effective_from, status, configuration)
       VALUES ($1,$2,1,'PROGRESSIVE_BANDS','2020-01-01','APPROVED','{"test_configuration":true}') RETURNING id`,
      [companyId, scheme],
    );
    await ds.query(
      `INSERT INTO statutory_tax_bands (rule_version_id, lower_limit, upper_limit, base_tax, rate_percent, sort_order) VALUES ($1,0,NULL,0,0,1)`,
      [rule],
    );
    const cal = await id(
      `INSERT INTO payroll_calendars (company_id, code, name) VALUES ($1,'M','Monthly') RETURNING id`,
      [companyId],
    );
    for (const [code, m, s, e] of [
      ['2026-10', 10, '2026-10-01', '2026-10-31'],
      ['2026-11', 11, '2026-11-01', '2026-11-30'],
    ] as const) {
      const pid = await id(
        `INSERT INTO payroll_periods (company_id, payroll_calendar_id, period_code, period_year, period_month, start_date, end_date, cutoff_date, payment_date)
         VALUES ($1,$2,$3,2026,$4,$5,$6,$6,$6) RETURNING id`,
        [companyId, cal, code, m, s, e],
      );
      periods[code] = await ds
        .getRepository(PayrollPeriod)
        .findOneByOrFail({ id: pid });
    }
    await employee('SICK', '3100000.00'); // 100,000/day in Oct, 103,333.33/day in Nov
    await employee('UNPAID', '3100000.00');
    await employee('HALF', '3100000.00');
    await employee('ROUND', '1000000.00'); // 33,333.333.../day in Nov
    await employee('NONE', '3100000.00');

    await request(
      'A',
      'SICK',
      sick,
      '2026-10-28',
      '2026-11-06',
      8,
      [
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
      ],
      {
        bands: [
          { days: 3, pay_percent: 100 },
          { days: 4, pay_percent: 50 },
          { days: 1, pay_percent: 0 },
        ],
      },
    );
    await request('U', 'UNPAID', unpaid, '2026-10-15', '2026-10-16', 2, [
      '2026-10-15',
      '2026-10-16',
    ]);
    await request(
      'H',
      'HALF',
      unpaid,
      '2026-10-20',
      '2026-10-20',
      0.5,
      ['2026-10-20'],
      { duration: 'HALF_DAY' },
    );
    await request('R', 'ROUND', unpaid, '2026-11-10', '2026-11-10', 1, [
      '2026-11-10',
    ]);
  }, 180000);

  afterAll(async () => {
    if (ds?.isInitialized)
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    await app?.close();
  });

  it('October: full-pay sick days cost nothing; unpaid and half-day deductions are exact', async () => {
    const out = await run(periods['2026-10']);
    expect(lines(out, 'SICK')).toMatchObject({
      basic: ['3100000.00'],
      lwp: [],
    }); // 3 days @100%
    expect(lines(out, 'UNPAID')).toMatchObject({
      basic: ['3100000.00'],
      lwp: ['200000.00'],
    }); // 2 × 100,000
    expect(lines(out, 'HALF')).toMatchObject({ lwp: ['50000.00'] }); // 0.5 × 100,000
    expect(lines(out, 'NONE')).toMatchObject({
      basic: ['3100000.00'],
      lwp: [],
    });
  });

  it('November: partial-pay sick bands deduct exactly the unpaid equivalent; rounding is half-up to cents', async () => {
    const out = await run(periods['2026-11']);
    // Nov part of A: 4 days @50% + 1 day @0% = 3 unpaid-equivalent days × 3,100,000/30
    expect(lines(out, 'SICK').lwp).toEqual(['310000.00']);
    // 1,000,000 × 1 / 30 = 33,333.333… → 33,333.33
    expect(lines(out, 'ROUND').lwp).toEqual(['33333.33']);
    // The cross-period sick leave costs 0 + 310,000 in total, i.e. exactly once.
  });

  it('re-running payroll is deterministic and never adds a second deduction', async () => {
    const a = await run(periods['2026-10']);
    const b = await run(periods['2026-10']);
    for (const key of ['SICK', 'UNPAID', 'HALF', 'NONE']) {
      expect(lines(b, key).lwp).toEqual(lines(a, key).lwp);
      expect(
        lines(b, key).all.filter((c) => c === 'LWP').length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('cancelled leave no longer deducts on the next calculation', async () => {
    await ds.query(`UPDATE leave_requests SET status='cancelled' WHERE id=$1`, [
      leave.U,
    ]);
    const out = await run(periods['2026-10']);
    expect(lines(out, 'UNPAID').lwp).toEqual([]);
    await ds.query(`UPDATE leave_requests SET status='approved' WHERE id=$1`, [
      leave.U,
    ]);
  });

  it('gross, deductions and net pay reconcile to the line items (no PAYE/NSSF in this synthetic setup)', async () => {
    const out = await run(periods['2026-10']);
    const o = out.find((x) => x.employee.id === emp.UNPAID)!;
    const r = o.result as {
      grossPay: string;
      employeeDeductions: string;
      netPay: string;
    };
    // Every line the engine produced, with its amount, for the evidence log.
    const byCode = Object.fromEntries(
      o.lineItems.map((l) => [l.componentCode, String(l.amount)]),
    );
    expect(byCode.BASIC).toBe('3100000.00');
    expect(byCode.LWP).toBe('200000.00');
    // Synthetic zero-rate PAYE produces no tax.
    expect(Number(byCode['PAYE-SYNTHETIC-ZERO'] ?? 0)).toBe(0);
    expect(Number(r.netPay)).toBe(
      Number(r.grossPay) - Number(r.employeeDeductions),
    );
    // LWP reduces pay by exactly TZS 200,000 against an identical employee with no leave.
    const none = out.find((x) => x.employee.id === emp.NONE)!.result as {
      netPay: string;
    };
    expect(Number(none.netPay) - Number(r.netPay)).toBe(200000);
  });

  describe('encashment → payroll → payment / reversal', () => {
    let leaveService: LeaveService;
    let inputs: PayrollInputService;
    let ledger: LeaveBalanceLedgerService;
    let payrollUser: number;
    let annual: number;
    const enc: Record<string, number> = {};
    const hr = () =>
      ({
        userId: 1,
        companyId,
        companyMembershipId: userId,
        employeeId: 0,
        permissions: ['data_scope:company', 'leave-balances.manage'],
      }) as never;
    const payrollOfficer = () =>
      ({
        userId: 2,
        companyId,
        companyMembershipId: payrollUser,
        employeeId: 0,
        permissions: ['data_scope:company'],
      }) as never;

    async function approvedEncashment(
      key: string,
      days: number,
      amount: string,
    ) {
      const [bal] = await ds.query(
        `INSERT INTO leave_balances (company_id, employee_id, leave_type_id, fiscal_year, allocated_days, entitlement_days)
         VALUES ($1,$2,$3,'2026',21,21)
         ON CONFLICT ON CONSTRAINT "UQ_leave_balance_employee_type_year" DO UPDATE SET updated_at=now() RETURNING id`,
        [companyId, emp.NONE, annual],
      );
      enc[key] = await id(
        `INSERT INTO leave_encashment_requests (company_id, employee_id, leave_type_id, leave_balance_id, fiscal_year,
           requested_days, approved_days, minimum_balance_after_encashment, reason, status, calculated_amount, daily_rate)
         VALUES ($1,$2,$3,$4,'2026',$5,$5,0,'Encash unused days','approved',$6,$7) RETURNING id`,
        [
          companyId,
          emp.NONE,
          annual,
          bal.id,
          days,
          amount,
          (Number(amount) / days).toFixed(2),
        ],
      );
      const balance = await ds
        .getRepository(LeaveBalance)
        .findOneByOrFail({ id: bal.id });
      const tx = await ledger.applyEncashment(balance, {
        companyId,
        employeeId: emp.NONE,
        leaveTypeId: annual,
        leaveYear: '2026',
        effectiveDate: '2026-11-15',
        days,
        requestId: enc[key],
        idempotencyKey: `enc-${key}-${suffix}`,
      });
      await ds.query(
        `UPDATE leave_encashment_requests SET ledger_transaction_id=$1 WHERE id=$2`,
        [tx.transaction.id, enc[key]],
      );
    }
    const encashmentLines = async () =>
      (await run(periods['2026-11']))
        .find((x) => x.employee.id === emp.NONE)!
        .lineItems.filter((l) => l.componentCode === 'LEAVE_ENCASHMENT')
        .map((l) => String(l.amount));

    beforeAll(async () => {
      leaveService = app.get(LeaveService);
      inputs = app.get(PayrollInputService);
      ledger = app.get(LeaveBalanceLedgerService);
      const user = await id(
        `INSERT INTO users (user_no, first_name, last_name, phone, email, password) VALUES ($1,'Pay','Roll',$2,$3,'x') RETURNING id`,
        [
          `UP${suffix}`.slice(0, 20),
          `+258${suffix}`.slice(0, 15),
          `payroll-${suffix}@example.test`,
        ],
      );
      payrollUser = await id(
        `INSERT INTO company_users (company_id, user_id) VALUES ($1,$2) RETURNING id`,
        [companyId, user],
      );
      annual = await id(
        `INSERT INTO leave_types (company_id, name, code) VALUES ($1,'Annual','AL') RETURNING id`,
        [companyId],
      );
      await approvedEncashment('E1', 3, '450000.00'); // 3 days × TZS 150,000
      await approvedEncashment('E2', 2, '300000.00');
    });

    it('blocks the handoff until the payroll component is Finance-ready', async () => {
      await expect(
        leaveService.recordLeaveEncashmentPayrollHandoff(
          companyId,
          enc.E1,
          { payroll_period_code: '2026-11', currency: 'TZS' } as never,
          hr(),
        ),
      ).rejects.toThrow(/not set up or not active/);
      // SYNTHETIC: test_configuration is honoured only outside production.
      await ds.query(
        `INSERT INTO payroll_components (company_id, code, name, component_type, calculation_method, version, status, calculation_configuration)
         VALUES ($1,'LEAVE_ENCASHMENT','Leave encashment','EARNING','EXTERNAL_INPUT',1,'ACTIVE',$2)`,
        [companyId, JSON.stringify({ test_configuration: true })],
      );
    });

    it('hands off the exact amount once, and payroll pays it only after payroll approval', async () => {
      const item = await leaveService.recordLeaveEncashmentPayrollHandoff(
        companyId,
        enc.E1,
        { payroll_period_code: '2026-11', currency: 'TZS' } as never,
        hr(),
      );
      expect(item).toMatchObject({
        payment_status: 'IN_PAYROLL',
        payable_amount: '450000.00',
      });
      await expect(
        leaveService.recordLeaveEncashmentPayrollHandoff(
          companyId,
          enc.E1,
          { payroll_period_code: '2026-11' } as never,
          hr(),
        ),
      ).rejects.toThrow(/already been recorded/);
      const [{ n }] = await ds.query(
        `SELECT count(*)::int n FROM payroll_inputs WHERE company_id=$1 AND source_reference=$2`,
        [companyId, `leave-encashment:${enc.E1}`],
      );
      expect(n).toBe(1);
      expect(await encashmentLines()).toEqual([]); // still DRAFT
      await expect(
        inputs.approve(hr(), item.payroll_input_id!),
      ).rejects.toThrow(); // maker cannot check
      await inputs.approve(payrollOfficer(), item.payroll_input_id!);
      expect(await encashmentLines()).toEqual(['450000.00']);
      const nov = (await run(periods['2026-11'])).find(
        (x) => x.employee.id === emp.NONE,
      )!.result as { grossPay: string };
      expect(Number(nov.grossPay)).toBe(3100000 + 450000);
    });

    it('refuses to reverse once payroll approved the input; records payment once at the exact amount', async () => {
      await expect(
        leaveService.reverseLeaveEncashment(
          companyId,
          enc.E1,
          'Changed mind',
          hr(),
        ),
      ).rejects.toThrow();
      const pay = (amount: number) =>
        leaveService.recordLeaveEncashmentPayment(
          companyId,
          enc.E1,
          {
            payment_reference: 'PAY-2026-11',
            paid_at: '2026-11-30',
            currency: 'TZS',
            amount,
          } as never,
          hr(),
        );
      await expect(pay(450000.5)).rejects.toThrow(/must match/);
      expect(await pay(450000)).toMatchObject({ payment_status: 'PAID' });
      await expect(pay(450000)).rejects.toThrow(/already been recorded/);
    });

    it('reversal before payroll approval withdraws the input and restores the leave balance', async () => {
      const item = await leaveService.recordLeaveEncashmentPayrollHandoff(
        companyId,
        enc.E2,
        { payroll_period_code: '2026-11', currency: 'TZS' } as never,
        hr(),
      );
      const before = await ds.query(
        `SELECT allocated_days, used_days, adjusted_days FROM leave_balances WHERE employee_id=$1 AND leave_type_id=$2`,
        [emp.NONE, annual],
      );
      const reversed = await leaveService.reverseLeaveEncashment(
        companyId,
        enc.E2,
        'Employee withdrew the request',
        hr(),
      );
      expect(reversed.status).toBe('cancelled');
      const [input] = await ds.query(
        `SELECT status FROM payroll_inputs WHERE id=$1`,
        [item.payroll_input_id],
      );
      expect(input.status).toBe('REJECTED');
      expect(await encashmentLines()).toEqual(['450000.00']); // only E1
      const after = await ds.query(
        `SELECT allocated_days, used_days, adjusted_days FROM leave_balances WHERE employee_id=$1 AND leave_type_id=$2`,
        [emp.NONE, annual],
      );
      expect(after).not.toEqual(before); // 2 encashed days returned to the balance
      const rec = await ledger.reconcileBalances(companyId, {
        employeeIds: [emp.NONE],
        fiscalYear: '2026',
        page: 1,
        limit: 5,
      });
      expect(rec.data[0].status).not.toBe('mismatch');
    });
  });
});
