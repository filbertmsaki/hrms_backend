/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion --
   Operator-run UAT fixture script: raw SQL rows are untyped and the
   notification stubs are intentionally no-op async functions. */
/**
 * Removes the UAT payroll test fixture created by uat-payroll-test-seed.ts.
 * Deletes ONLY records reachable from the test markers (UAT-PAY-* employees,
 * *@hrms-uat.test users, UAT-TEST calendar/group/cost centre). Payroll runs
 * of the UAT-TEST group are deleted with their results. Statutory rules are
 * left as they are (pass --revert-rules to set them back to DRAFT).
 *
 *   APP_ENV=uat npm run uat:payroll-test:undo                 (shows what it would remove)
 *   APP_ENV=uat npm run uat:payroll-test:undo -- --apply [--revert-rules]
 */
import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';

const COMPANY_ID = 1;
const APPLY = process.argv.includes('--apply');

async function main() {
  const options = AppDataSource.options as { database?: string };
  const rehearsal = process.env.UAT_SEED_REHEARSAL_DB;
  if (
    options.database !== 'hrms_uat_db' &&
    !(
      rehearsal &&
      options.database === rehearsal &&
      rehearsal.startsWith('hrms_uat_rehearsal')
    )
  ) {
    throw new Error(`Refusing to run against ${options.database}.`);
  }
  const ds = await AppDataSource.initialize();
  try {
    const ids = async (sql: string, params: unknown[] = []) =>
      ((await ds.query(sql, params)) as Array<{ id: number }>).map((row) =>
        Number(row.id),
      );
    const employees = await ids(
      `SELECT id FROM employees WHERE company_id = $1 AND employee_no LIKE 'UAT-PAY-%'`,
      [COMPANY_ID],
    );
    const users = await ids(
      `SELECT id FROM users WHERE email LIKE '%@hrms-uat.test'`,
    );
    const members = users.length
      ? await ids(`SELECT id FROM company_users WHERE user_id = ANY($1)`, [
          users,
        ])
      : [];
    const calendars = await ids(
      `SELECT id FROM payroll_calendars WHERE company_id = $1 AND code = 'UAT-TEST'`,
      [COMPANY_ID],
    );
    const groups = await ids(
      `SELECT id FROM payroll_groups WHERE company_id = $1 AND code = 'UAT-TEST'`,
      [COMPANY_ID],
    );
    const runs = await ids(
      `SELECT id FROM payroll_runs WHERE company_id = $1 AND (payroll_group_id = ANY($2)
         OR payroll_period_id IN (SELECT id FROM payroll_periods WHERE payroll_calendar_id = ANY($3)))`,
      [COMPANY_ID, groups, calendars],
    );
    const accounts = employees.length
      ? await ids(
          `SELECT id FROM employee_finance_accounts WHERE employee_id = ANY($1)`,
          [employees],
        )
      : [];
    const applications = employees.length
      ? await ids(
          `SELECT id FROM employee_finance_applications WHERE employee_id = ANY($1)`,
          [employees],
        )
      : [];
    console.log('[uat-undo] found', {
      employees: employees.length,
      users: users.length,
      memberships: members.length,
      calendars: calendars.length,
      groups: groups.length,
      runs: runs.length,
      loan_accounts: accounts.length,
      applications: applications.length,
    });
    if (!APPLY) return;

    await ds.transaction(async (m) => {
      const run = (sql: string, params: unknown[]) => m.query(sql, params);
      if (runs.length) {
        for (const table of [
          'payroll_payment_obligations',
          'payroll_run_approvals',
          'payroll_payment_import_lines',
          'payroll_payment_imports',
          'payroll_payment_reconciliations',
          'payroll_bank_batches',
          'payroll_journal_batches',
          'payroll_variance_results',
        ]) {
          if ((await m.query(`SELECT to_regclass($1) t`, [table]))[0].t) {
            await run(`DELETE FROM ${table} WHERE payroll_run_id = ANY($1)`, [
              runs,
            ]);
          }
        }
        await run(
          `DELETE FROM payslips WHERE employee_payroll_result_id IN (SELECT id FROM employee_payroll_results WHERE payroll_run_id = ANY($1))`,
          [runs],
        );
        await run(
          `DELETE FROM payroll_deduction_shortfalls WHERE employee_payroll_result_id IN (SELECT id FROM employee_payroll_results WHERE payroll_run_id = ANY($1))`,
          [runs],
        );
        await run(
          `DELETE FROM employee_payroll_line_items WHERE payroll_run_id = ANY($1)`,
          [runs],
        );
        await run(
          `DELETE FROM employee_payroll_results WHERE payroll_run_id = ANY($1)`,
          [runs],
        );
        await run(`DELETE FROM payroll_runs WHERE id = ANY($1)`, [runs]);
      }
      if (employees.length) {
        await run(
          `DELETE FROM payroll_overpayment_recovery_entries WHERE recovery_id IN (SELECT id FROM payroll_overpayment_recoveries WHERE employee_id = ANY($1))`,
          [employees],
        );
        await run(
          `DELETE FROM payroll_overpayment_recoveries WHERE employee_id = ANY($1)`,
          [employees],
        );
        await run(`DELETE FROM payroll_inputs WHERE employee_id = ANY($1)`, [
          employees,
        ]);
      }
      if (accounts.length) {
        for (const table of [
          'employee_finance_payroll_instructions',
          'employee_finance_ledger_entries',
          'employee_finance_installments',
          'employee_finance_disbursements',
          'employee_finance_repayments',
        ]) {
          await run(`DELETE FROM ${table} WHERE account_id = ANY($1)`, [
            accounts,
          ]);
        }
        await run(`DELETE FROM employee_finance_accounts WHERE id = ANY($1)`, [
          accounts,
        ]);
      }
      if (applications.length) {
        for (const table of [
          'employee_finance_application_documents',
          'employee_finance_application_guarantors',
          'employee_finance_sanction_letters',
          'employee_finance_application_approvals',
        ]) {
          await run(`DELETE FROM ${table} WHERE application_id = ANY($1)`, [
            applications,
          ]);
        }
        await run(
          `DELETE FROM employee_finance_applications WHERE id = ANY($1)`,
          [applications],
        );
      }
      if (employees.length) {
        await run(
          `DELETE FROM attendance_daily_summaries WHERE employee_id = ANY($1)`,
          [employees],
        );
        await run(
          `DELETE FROM payroll_group_assignments WHERE employee_id = ANY($1)`,
          [employees],
        );
        await run(
          `DELETE FROM employee_payroll_profiles WHERE employee_id = ANY($1)`,
          [employees],
        );
        await run(
          `DELETE FROM employee_compensation_versions WHERE employee_id = ANY($1)`,
          [employees],
        );
        await run(
          `DELETE FROM employee_bank_accounts WHERE employee_id = ANY($1)`,
          [employees],
        );
        await run(`DELETE FROM employees WHERE id = ANY($1)`, [employees]);
      }
      if (calendars.length)
        await run(
          `DELETE FROM payroll_periods WHERE payroll_calendar_id = ANY($1)`,
          [calendars],
        );
      if (groups.length)
        await run(`DELETE FROM payroll_groups WHERE id = ANY($1)`, [groups]);
      if (calendars.length)
        await run(`DELETE FROM payroll_calendars WHERE id = ANY($1)`, [
          calendars,
        ]);
      await run(
        `DELETE FROM cost_centers WHERE company_id = $1 AND code = 'UAT-TEST'`,
        [COMPANY_ID],
      );
      if (members.length) {
        await run(
          `DELETE FROM company_user_roles WHERE company_user_id = ANY($1)`,
          [members],
        );
        await run(`DELETE FROM company_users WHERE id = ANY($1)`, [members]);
      }
      if (users.length)
        await run(`DELETE FROM users WHERE id = ANY($1)`, [users]);
      if (process.argv.includes('--revert-rules')) {
        await run(
          `UPDATE statutory_rule_versions SET status = 'DRAFT', approved_by_company_user_id = NULL, approved_at = NULL
            WHERE company_id = $1 AND configuration ? 'uat_test_approval'`,
          [COMPANY_ID],
        );
      }
    });
    console.log('[uat-undo] removed');
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error(
    '[uat-undo] FAILED:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
