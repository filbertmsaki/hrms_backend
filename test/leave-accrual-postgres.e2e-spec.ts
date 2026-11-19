/**
 * FRS-11 Phase 2 — scheduled balance generation / accrual with the real
 * service against Postgres: concurrent runs (cron + manual) create one
 * balance per employee/type/year, reruns (catch-up) do not double-credit,
 * and the stored balance stays reconciled with the ledger.
 *
 *   DB_NAME=hrms_frs11_e2e npm run test:e2e -- leave-accrual-postgres
 */
import './setup-e2e';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createE2eApp } from './helpers/create-e2e-app';
import { LeaveBalanceService } from '../src/modules/hr/leave/services/leave-balance.service';
import { LeaveBalanceLedgerService } from '../src/modules/hr/leave/services/leave-balance-ledger.service';

describe('Leave balance generation / accrual (real Postgres, real services)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let balances: LeaveBalanceService;
  let ledger: LeaveBalanceLedgerService;
  let companyId: number;
  let employeeId: number;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const id = async (sql: string, p: unknown[]) =>
    (await ds.query(sql, p))[0].id;
  const snapshot = async () =>
    ds.query(
      `SELECT leave_type_id, fiscal_year, entitlement_days, accrued_days, allocated_days
         FROM leave_balances WHERE employee_id=$1 ORDER BY leave_type_id, fiscal_year`,
      [employeeId],
    );

  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Restricted to disposable *_e2e / *_test_db databases.');
    app = await createE2eApp();
    ds = app.get(DataSource);
    balances = app.get(LeaveBalanceService);
    ledger = app.get(LeaveBalanceLedgerService);
    companyId = await id(
      `INSERT INTO companies (name, slug) VALUES ($1,$2) RETURNING id`,
      [`Accr ${suffix}`, `accr-${suffix}`],
    );
    employeeId = await id(
      `INSERT INTO employees (company_id, employee_no, first_name, last_name, gender, version, hire_date, employment_status)
       VALUES ($1,$2,'Ac','Crual','male',1,'2020-01-01','active') RETURNING id`,
      [companyId, `A-${suffix}`.slice(0, 50)],
    );
    await ds.query(
      `INSERT INTO leave_types (company_id, name, code, max_days_per_year) VALUES ($1,'Annual','AL',21),($1,'Sick','SL',14)`,
      [companyId],
    );
  }, 120000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(
        `DELETE FROM leave_balance_transactions WHERE company_id=$1`,
        [companyId],
      );
      await ds.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await app?.close();
  });

  it('two simultaneous generation runs create one balance per type and year', async () => {
    const settled = await Promise.allSettled([
      balances.generateBalancesForCompany(companyId, '2026'),
      balances.generateBalancesForCompany(companyId, '2026'),
    ]);
    // Either both succeed (second sees the rows) or one loses a unique race
    // cleanly; never two rows.
    expect(settled.some((s) => s.status === 'fulfilled')).toBe(true);
    const rows = await snapshot();
    expect(rows.length).toBeGreaterThan(0);
    const keys = rows.map(
      (r: { leave_type_id: number; fiscal_year: string }) =>
        `${r.leave_type_id}:${r.fiscal_year}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('catch-up reruns do not change or double the entitlement', async () => {
    const first = await snapshot();
    await balances.generateBalancesForCompany(companyId, '2026');
    await balances.generateBalancesForCompany(companyId, '2026');
    expect(await snapshot()).toEqual(first);
  });

  it('stays reconciled with the ledger', async () => {
    const result = await ledger.reconcileBalances(companyId, {
      employeeIds: null,
      fiscalYear: '2026',
      page: 1,
      limit: 10,
    });
    for (const row of result.data) expect(row.status).not.toBe('mismatch');
  });
});
