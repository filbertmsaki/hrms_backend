import { AppDataSource } from '../database/data-source';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type QueryRow = Record<string, unknown>;

async function queryRows<T extends QueryRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return await AppDataSource.query(sql, params);
}

function cents(value: unknown): bigint {
  const amount =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '0';
  const match = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(amount);
  if (!match)
    throw new Error(`Invalid monetary amount in payroll data: ${amount}`);
  const sign = match[1] === '-' ? -1n : 1n;
  return (
    sign *
    (BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0'))
  );
}

async function run() {
  const companyId = Number(process.env.PAYROLL_DEMO_COMPANY_ID);
  const periodCode = process.env.PAYROLL_DEMO_PERIOD_CODE?.trim();
  if (!Number.isSafeInteger(companyId) || companyId < 1 || !periodCode) {
    throw new Error(
      'Set PAYROLL_DEMO_COMPANY_ID and PAYROLL_DEMO_PERIOD_CODE.',
    );
  }
  await AppDataSource.initialize();
  try {
    const [company] = await queryRows<{
      id: number;
      metadata: Record<string, unknown> | null;
    }>('SELECT id, metadata FROM companies WHERE id = $1', [companyId]);
    const isDemo =
      company?.metadata?.demo === true &&
      company.metadata?.demo_module === 'payroll';
    if (
      !company ||
      (!isDemo && process.env.PAYROLL_RECONCILE_ALLOW_NONDEMO !== 'YES')
    ) {
      throw new Error(
        'Company reconciliation requires an explicitly marked payroll demo tenant. For an authorized company run, set PAYROLL_RECONCILE_ALLOW_NONDEMO=YES.',
      );
    }
    const [period] = await queryRows<{
      id: number;
      start_date: string;
      end_date: string;
    }>(
      `SELECT id, start_date, end_date FROM payroll_periods WHERE company_id = $1 AND period_code = $2`,
      [companyId, periodCode],
    );
    if (!period) throw new Error(`Payroll period ${periodCode} was not found.`);
    const runs = await queryRows<{
      id: number;
      run_no: string;
      status: string;
      employee_count: number;
      gross_total: string;
      deduction_total: string;
      net_pay_total: string;
      employer_contribution_total: string;
      total_employer_cost: string;
    }>(
      `SELECT id, run_no, status, employee_count, gross_total, deduction_total, net_pay_total,
              employer_contribution_total, total_employer_cost
         FROM payroll_runs WHERE company_id = $1 AND payroll_period_id = $2 ORDER BY id`,
      [companyId, period.id],
    );
    const results: unknown[] = [];
    for (const run of runs) {
      const [employeeTotals] = await queryRows<{
        count: number;
        gross: string;
        deductions: string;
        net: string;
        employer_contributions: string;
        employer_cost: string;
      }>(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(gross_pay),0)::numeric(20,2) AS gross,
                COALESCE(SUM(employee_deductions),0)::numeric(20,2) AS deductions,
                COALESCE(SUM(net_pay),0)::numeric(20,2) AS net,
                COALESCE(SUM(employer_contributions),0)::numeric(20,2) AS employer_contributions,
                COALESCE(SUM(employer_cost),0)::numeric(20,2) AS employer_cost
           FROM employee_payroll_results WHERE company_id = $1 AND payroll_run_id = $2`,
        [companyId, run.id],
      );
      const [journal] = await queryRows<{ debit: string; credit: string }>(
        `SELECT COALESCE(SUM(debit_total),0)::numeric(20,2) AS debit,
                COALESCE(SUM(credit_total),0)::numeric(20,2) AS credit
           FROM payroll_journal_batches WHERE company_id = $1 AND payroll_run_id = $2`,
        [companyId, run.id],
      );
      const [bank] = await queryRows<{
        batch_total: string;
        batch_count: number;
      }>(
        `SELECT COALESCE(SUM(total_amount),0)::numeric(20,2) AS batch_total,
                COUNT(*)::int AS batch_count
           FROM payroll_bank_batches WHERE company_id = $1 AND payroll_run_id = $2`,
        [companyId, run.id],
      );
      const [payments] = await queryRows<{
        paid: string;
        expected: string;
        variance: string;
        failed_count: number;
        unmatched_count: number;
      }>(
        `SELECT COALESCE(SUM(paid_amount),0)::numeric(20,2) AS paid,
                COALESCE(SUM(expected_amount),0)::numeric(20,2) AS expected,
                COALESCE(SUM(variance_amount),0)::numeric(20,2) AS variance,
                COALESCE(SUM(failed_count),0)::int AS failed_count,
                COALESCE(SUM(unmatched_count),0)::int AS unmatched_count
           FROM payroll_payment_imports WHERE company_id = $1 AND payroll_run_id = $2`,
        [companyId, run.id],
      );
      const checks = {
        result_count_matches:
          Number(run.employee_count) === Number(employeeTotals.count),
        gross_matches: cents(run.gross_total) === cents(employeeTotals.gross),
        deductions_match:
          cents(run.deduction_total) === cents(employeeTotals.deductions),
        net_matches: cents(run.net_pay_total) === cents(employeeTotals.net),
        employer_contributions_match:
          cents(run.employer_contribution_total) ===
          cents(employeeTotals.employer_contributions),
        employer_cost_matches:
          cents(run.total_employer_cost) ===
          cents(employeeTotals.employer_cost),
        journal_balanced: cents(journal.debit) === cents(journal.credit),
        bank_batch_matches_net:
          Number(bank.batch_count) === 0 ||
          cents(bank.batch_total) === cents(run.net_pay_total),
        payments_have_no_failed_or_unmatched:
          Number(payments.failed_count) === 0 &&
          Number(payments.unmatched_count) === 0,
        payment_variance_zero: cents(payments.variance) === 0n,
      };
      results.push({
        run_id: run.id,
        run_no: run.run_no,
        status: run.status,
        checks,
        totals: {
          run_net: run.net_pay_total,
          employee_net: employeeTotals.net,
          bank_batch_total: bank.batch_total,
          paid: payments.paid,
          payment_expected: payments.expected,
          payment_variance: payments.variance,
          journal_debit: journal.debit,
          journal_credit: journal.credit,
        },
        passed: Object.values(checks).every(Boolean),
      });
    }
    const settlements = await queryRows<{
      id: number;
      employee_id: number;
      offboarding_request_id: number;
      payroll_run_id: number | null;
      gross_settlement: string;
      deduction_total: string;
      net_settlement: string;
      status: string;
      snapshot: Record<string, unknown> | null;
    }>(
      `SELECT settlement.id, settlement.employee_id,
              settlement.offboarding_request_id, settlement.payroll_run_id,
              settlement.gross_settlement, settlement.deduction_total,
              settlement.net_settlement, settlement.status, settlement.snapshot
         FROM payroll_final_settlements settlement
         JOIN offboarding_requests request
           ON request.id = settlement.offboarding_request_id
          AND request.company_id = settlement.company_id
        WHERE settlement.company_id = $1
          AND request.last_working_date BETWEEN $2::date AND $3::date
        ORDER BY settlement.id`,
      [companyId, period.start_date, period.end_date],
    );
    const settlementReport = settlements.map((settlement) => {
      const snapshot = settlement.snapshot ?? {};
      const history = Array.isArray(snapshot.workflow_history)
        ? (snapshot.workflow_history as Array<Record<string, unknown>>)
        : [];
      const payment = [...history]
        .reverse()
        .find(
          (item) => item.action === 'PAYMENT' && item.outcome === 'SUCCESS',
        );
      const paymentAmount = payment?.amount ?? payment?.paid_amount;
      return {
        id: settlement.id,
        employee_id: settlement.employee_id,
        status: settlement.status,
        totals_balance:
          cents(settlement.gross_settlement) +
            cents(settlement.deduction_total) ===
          cents(settlement.net_settlement),
        successful_payment_matches:
          !['PAID', 'RECONCILED', 'CLOSED'].includes(
            String(settlement.status),
          ) ||
          Boolean(
            payment &&
            paymentAmount !== undefined &&
            cents(paymentAmount) === cents(settlement.net_settlement),
          ),
      };
    });
    const settlementSources = await queryRows<{
      settlement_id: number;
      settlement_item_id: number;
      employee_id: number;
      source_type: string;
      source_reference: string;
      settlement_amount: string;
      payroll_run_id: number;
      payroll_amount: string;
    }>(
      `SELECT settlement.id AS settlement_id, item.id AS settlement_item_id,
              settlement.employee_id, item.source_type::text AS source_type,
              item.source_reference, item.amount AS settlement_amount,
              run.id AS payroll_run_id, line.amount AS payroll_amount
         FROM payroll_final_settlements settlement
         JOIN offboarding_requests request
           ON request.id = settlement.offboarding_request_id
          AND request.company_id = settlement.company_id
         JOIN offboarding_settlement_items item
           ON item.offboarding_request_id = request.id
          AND item.company_id = request.company_id
         JOIN employee_payroll_line_items line
           ON line.company_id = settlement.company_id
          AND line.employee_id = settlement.employee_id
          AND line.source_reference = item.source_reference
          AND UPPER(line.source_type) = UPPER(item.source_type::text)
         JOIN payroll_runs run
           ON run.id = line.payroll_run_id AND run.company_id = line.company_id
         JOIN payroll_periods source_period
           ON source_period.id = run.payroll_period_id
          AND source_period.company_id = run.company_id
        WHERE settlement.company_id = $1
          AND request.last_working_date BETWEEN $2::date AND $3::date
          AND item.status = 'completed'
          AND NULLIF(BTRIM(item.source_reference), '') IS NOT NULL
          AND run.offboarding_request_id IS NULL
          AND run.run_type = 'REGULAR'
          AND run.status IN ('PAID', 'CLOSED')
          AND source_period.start_date <= $3::date
          AND source_period.end_date >= $2::date
        ORDER BY settlement.id, item.id, run.id`,
      [companyId, period.start_date, period.end_date],
    );
    const sourceChecks = settlementSources.map((source) => ({
      ...source,
      amounts_match:
        cents(source.settlement_amount) === cents(source.payroll_amount),
      duplicate_payment_risk: true,
    }));
    const sourceAmountsMatch = sourceChecks.every(
      (source) => source.amounts_match,
    );
    const passed =
      runs.length > 0 &&
      results.every((item: { passed: boolean }) => item.passed) &&
      settlementReport.every(
        (item: {
          totals_balance: boolean;
          successful_payment_matches: boolean;
        }) => item.totals_balance && item.successful_payment_matches,
      ) &&
      sourceChecks.length === 0;
    const report = {
      company_id: companyId,
      company_is_demo: isDemo,
      period_code: periodCode,
      period_start: period.start_date,
      period_end: period.end_date,
      read_only: true,
      passed,
      reconciliation_basis_present: runs.length > 0,
      runs: results,
      settlements: settlementReport,
      settlement_source_overlaps: sourceChecks,
      settlement_source_amounts_match: sourceAmountsMatch,
    };
    const serialized = JSON.stringify(report, null, 2);
    const outputFile = process.env.PAYROLL_RECONCILE_OUTPUT?.trim();
    if (outputFile) {
      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${serialized}\n`, 'utf8');
    }
    console.log(serialized);
    if (!passed) process.exitCode = 2;
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[PayrollDemoReconcile] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
