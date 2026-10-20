import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';

type Args = {
  companyId: number;
  from: string;
  to: string;
  limit: number;
};

function readArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (const value of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(value);
    if (match) values.set(match[1], match[2]);
  }

  const companyId = Number(values.get('company-id'));
  const from = values.get('from') ?? '';
  const to = values.get('to') ?? '';
  const limit = Number(values.get('limit') ?? 100);
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new Error('Provide --company-id=<positive integer>.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('Provide --from=YYYY-MM-DD and --to=YYYY-MM-DD.');
  }
  if (from > to) throw new Error('--from must be on or before --to.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('--limit must be between 1 and 1000.');
  }
  return { companyId, from, to, limit };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  await AppDataSource.initialize();
  try {
    const requests: Record<string, unknown>[] = await AppDataSource.query(
      `
        SELECT request.id AS request_id, request.leave_no, request.employee_id,
          request.leave_type_id, request.status, request.duration_type,
          request.start_date, request.end_date, request.total_days,
          request.approval_cycle,
          COUNT(DISTINCT approval.id)::int AS approval_actions,
          COALESCE((
            SELECT SUM(tx.used_delta_days)
            FROM leave_balance_transactions tx
            WHERE tx.leave_request_id = request.id
              AND tx.company_id = request.company_id
          ), 0)::numeric AS ledger_used_days,
          COALESCE((
            SELECT COUNT(*)
            FROM leave_request_approvals approval_row
            WHERE approval_row.leave_request_id = request.id
              AND approval_row.approval_cycle = request.approval_cycle
              AND approval_row.status = 'pending'
          ), 0)::int AS pending_approval_steps
        FROM leave_requests request
        LEFT JOIN leave_request_approvals approval
          ON approval.leave_request_id = request.id
          AND approval.approval_cycle = request.approval_cycle
        WHERE request.company_id = $1
          AND request.start_date BETWEEN $2::date AND $3::date
        GROUP BY request.id
        ORDER BY request.start_date, request.id
        LIMIT $4
      `,
      [args.companyId, args.from, args.to, args.limit],
    );

    const balances: Record<string, unknown>[] = await AppDataSource.query(
      `
        SELECT balance.id AS balance_id, balance.employee_id, balance.leave_type_id,
          balance.fiscal_year, balance.last_transaction_id,
          balance.opening_balance_days, balance.entitlement_days,
          balance.allocated_days, balance.carried_forward_days,
          balance.adjusted_days, balance.used_days, balance.pending_days,
          balance.approved_future_days, balance.expired_days,
          balance.attendance_deduction_days,
          ROUND((
            (CASE WHEN balance.opening_balance_days::numeric <> 0
              THEN balance.opening_balance_days::numeric
              ELSE balance.carried_forward_days::numeric END)
            + (CASE WHEN balance.entitlement_days::numeric <> 0
              THEN balance.entitlement_days::numeric
              ELSE balance.allocated_days::numeric END)
            + balance.adjusted_days::numeric - balance.used_days::numeric
            - balance.pending_days::numeric - balance.approved_future_days::numeric
            - balance.expired_days::numeric - balance.attendance_deduction_days::numeric
          ), 2) AS calculated_available_days,
          tx.new_balance_days AS last_ledger_available_days,
          tx.new_used_days AS last_ledger_used_days,
          tx.new_pending_days AS last_ledger_pending_days
        FROM leave_balances balance
        LEFT JOIN leave_balance_transactions tx
          ON tx.id = balance.last_transaction_id
          AND tx.company_id = $1
        WHERE balance.company_id = $1
          AND balance.fiscal_year BETWEEN LEFT($2, 4) AND LEFT($3, 4)
        ORDER BY balance.employee_id, balance.leave_type_id, balance.fiscal_year
        LIMIT $4
      `,
      [args.companyId, args.from, args.to, args.limit],
    );

    const encashments: Record<string, unknown>[] = await AppDataSource.query(
      `
        SELECT encashment.id AS encashment_request_id, encashment.employee_id,
          encashment.leave_type_id, encashment.fiscal_year, encashment.status,
          encashment.requested_days, encashment.approved_days,
          encashment.ledger_transaction_id,
          tx.amount_days AS ledger_amount_days,
          encashment.payroll_handoff_reference,
          encashment.payroll_handed_off_at
        FROM leave_encashment_requests encashment
        LEFT JOIN leave_balance_transactions tx
          ON tx.id = encashment.ledger_transaction_id
          AND tx.company_id = encashment.company_id
        WHERE encashment.company_id = $1
          AND encashment.created_at::date BETWEEN $2::date AND $3::date
        ORDER BY encashment.id
        LIMIT $4
      `,
      [args.companyId, args.from, args.to, args.limit],
    );

    const ledgerRollup: Record<string, unknown>[] = await AppDataSource.query(
      `
        SELECT tx.leave_year, tx.transaction_type,
          COUNT(*)::int AS transaction_count,
          ROUND(SUM(tx.amount_days::numeric), 2) AS amount_days,
          ROUND(SUM(tx.used_delta_days::numeric), 2) AS used_delta_days,
          ROUND(SUM(tx.pending_delta_days::numeric), 2) AS pending_delta_days
        FROM leave_balance_transactions tx
        WHERE tx.company_id = $1
          AND tx.effective_date BETWEEN $2::date AND $3::date
        GROUP BY tx.leave_year, tx.transaction_type
        ORDER BY tx.leave_year, tx.transaction_type
      `,
      [args.companyId, args.from, args.to],
    );

    const discrepancies: Array<Record<string, unknown>> = [];
    for (const request of requests) {
      const totalDays = Number(request.total_days);
      const ledgerUsed = Number(request.ledger_used_days);
      if (
        request.status === 'approved' &&
        Math.abs(totalDays - ledgerUsed) > 0.01
      ) {
        discrepancies.push({
          kind: 'approved_request_ledger_days',
          request_id: request.request_id,
          expected_days: totalDays,
          ledger_days: ledgerUsed,
        });
      }
      if (
        request.status === 'approved' &&
        Number(request.pending_approval_steps) > 0
      ) {
        discrepancies.push({
          kind: 'approved_request_has_pending_step',
          request_id: request.request_id,
          pending_steps: request.pending_approval_steps,
        });
      }
    }
    for (const balance of balances) {
      if (balance.last_transaction_id == null) continue;
      const available = Number(balance.calculated_available_days);
      const ledgerAvailable = Number(balance.last_ledger_available_days);
      if (
        Number.isFinite(ledgerAvailable) &&
        Math.abs(available - ledgerAvailable) > 0.01
      ) {
        discrepancies.push({
          kind: 'balance_available_vs_last_ledger',
          balance_id: balance.balance_id,
          calculated_available_days: available,
          last_ledger_available_days: ledgerAvailable,
        });
      }
      const used = Number(balance.used_days);
      const ledgerUsed = Number(balance.last_ledger_used_days);
      if (Number.isFinite(ledgerUsed) && Math.abs(used - ledgerUsed) > 0.01) {
        discrepancies.push({
          kind: 'balance_used_vs_last_ledger',
          balance_id: balance.balance_id,
          used_days: used,
          last_ledger_used_days: ledgerUsed,
        });
      }
      const pending = Number(balance.pending_days);
      const ledgerPending = Number(balance.last_ledger_pending_days);
      if (
        Number.isFinite(ledgerPending) &&
        Math.abs(pending - ledgerPending) > 0.01
      ) {
        discrepancies.push({
          kind: 'balance_pending_vs_last_ledger',
          balance_id: balance.balance_id,
          pending_days: pending,
          last_ledger_pending_days: ledgerPending,
        });
      }
    }
    for (const encashment of encashments) {
      if (encashment.status !== 'approved') continue;
      const expectedAmount = -Number(encashment.approved_days);
      const actualAmount = Number(encashment.ledger_amount_days);
      if (
        encashment.ledger_transaction_id == null ||
        !Number.isFinite(actualAmount) ||
        Math.abs(expectedAmount - actualAmount) > 0.01
      ) {
        discrepancies.push({
          kind: 'approved_encashment_ledger_deduction',
          encashment_request_id: encashment.encashment_request_id,
          expected_ledger_days: expectedAmount,
          actual_ledger_days: encashment.ledger_amount_days ?? null,
        });
      }
      if (!encashment.payroll_handoff_reference) {
        discrepancies.push({
          kind: 'approved_encashment_missing_payroll_handoff',
          encashment_request_id: encashment.encashment_request_id,
        });
      }
    }

    const report = {
      generated_at: new Date().toISOString(),
      company_id: args.companyId,
      date_range: { from: args.from, to: args.to },
      sample_limit: args.limit,
      sampled: {
        requests: requests.length,
        balances: balances.length,
        encashments: encashments.length,
      },
      requests,
      balances,
      encashments,
      accrual_carry_forward_and_ledger_rollup: ledgerRollup,
      discrepancies,
      result:
        discrepancies.length === 0
          ? 'NO_AUTOMATED_DISCREPANCIES'
          : 'REVIEW_REQUIRED',
    };
    console.log(JSON.stringify(report, null, 2));
    if (discrepancies.length > 0) process.exitCode = 2;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Leave reconciliation failed.',
  );
  process.exitCode = 1;
});
