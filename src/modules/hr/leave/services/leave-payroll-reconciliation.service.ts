import { DataSource } from 'typeorm';
import { leaveDaysInWindow } from '../utils/leave-period-allocation.util';

/**
 * FRS-11.4.08 monthly leave-to-payroll reconciliation.
 *
 * For each payroll period, compares what payroll recorded
 * (employee_payroll_results.calculation_snapshot.monthly_leave_summary of the
 * latest non-reversed run) with what the leave module says today: which
 * approved requests fall in the period and how many leave days each
 * contributes. An optional `summarize` hook recomputes paid/unpaid
 * equivalents with the payroll engine itself so pay-band drift is caught.
 *
 * Differences are expected after a cancellation, a late approval, or an
 * allocation backfill on an already-calculated period: they mean "payroll
 * must be rerun or adjusted", not that either side is wrong.
 */
export interface ReconciliationRow {
  period_code: string;
  period_start: string;
  period_end: string;
  employee_id: number;
  payroll_result_id: number | null;
  payroll_run_status: string | null;
  recorded_request_ids: number[];
  expected_request_ids: number[];
  recorded_days: number;
  expected_days: number;
  recorded_unpaid_equivalent_days: number | null;
  expected_unpaid_equivalent_days: number | null;
  status: 'MATCH' | 'DIFF' | 'MISSING_PAYROLL_RESULT' | 'NOT_IN_LEAVE';
  notes: string;
}

export type LeaveSummarizer = (
  companyId: number,
  employeeId: number,
  period: { startDate: string; endDate: string },
) => Promise<{
  paidDays: number;
  unpaidDays: number;
  unpaidEquivalentDays: number;
}>;

const round = (n: number) => Math.round(n * 10000) / 10000;

export class LeavePayrollReconciliationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly summarize?: LeaveSummarizer,
  ) {}

  async reconcile(
    companyId: number,
    from: string,
    to: string,
  ): Promise<ReconciliationRow[]> {
    const periods: Array<{
      id: number;
      period_code: string;
      start_date: string;
      end_date: string;
    }> = await this.dataSource.query(
      `SELECT id, period_code, start_date::text AS start_date, end_date::text AS end_date
         FROM payroll_periods
        WHERE company_id = $1 AND end_date >= $2 AND start_date <= $3
        ORDER BY start_date, id`,
      [companyId, from, to],
    );
    const rows: ReconciliationRow[] = [];
    for (const period of periods) {
      const results: Array<{
        id: number;
        employee_id: number;
        run_status: string;
        summary: {
          approved_leave_request_ids?: number[];
          paid_days?: number;
          unpaid_days?: number;
          unpaid_equivalent_days?: number;
        } | null;
      }> = await this.dataSource.query(
        `SELECT DISTINCT ON (r.employee_id) r.id, r.employee_id,
                run.status::text AS run_status,
                r.calculation_snapshot->'monthly_leave_summary' AS summary
           FROM employee_payroll_results r
           JOIN payroll_runs run ON run.id = r.payroll_run_id
          WHERE r.company_id = $1 AND r.payroll_period_id = $2
            AND run.status::text <> 'REVERSED'
          ORDER BY r.employee_id, r.payroll_run_id DESC, r.id DESC`,
        [companyId, period.id],
      );
      const leaves: Array<{
        id: number;
        employee_id: number;
        start_date: string;
        end_date: string;
        total_days: string;
        requested_minutes: number | null;
        duration_type: string;
        calculation_snapshot: Record<string, unknown> | null;
      }> = await this.dataSource.query(
        `SELECT id, employee_id, start_date::text AS start_date, end_date::text AS end_date,
                total_days, requested_minutes, duration_type::text AS duration_type,
                calculation_snapshot
           FROM leave_requests
          WHERE company_id = $1 AND status = 'approved'
            AND start_date <= $3 AND end_date >= $2`,
        [companyId, period.start_date, period.end_date],
      );
      const expected = new Map<number, { ids: number[]; days: number }>();
      for (const leave of leaves) {
        const days = leaveDaysInWindow(
          leave,
          leave.start_date > period.start_date
            ? leave.start_date
            : period.start_date,
          leave.end_date < period.end_date ? leave.end_date : period.end_date,
        );
        const entry = expected.get(leave.employee_id) ?? { ids: [], days: 0 };
        // Mirrors payroll: an overlapping request is listed even when it
        // contributes 0 days (e.g. a legacy request kept in its start month).
        entry.ids.push(leave.id);
        entry.days += days;
        expected.set(leave.employee_id, entry);
      }
      const seen = new Set<number>();
      for (const result of results) {
        seen.add(result.employee_id);
        const exp = expected.get(result.employee_id) ?? { ids: [], days: 0 };
        const recIds = [...(result.summary?.approved_leave_request_ids ?? [])]
          .map(Number)
          .sort((a, b) => a - b);
        const expIds = [...exp.ids].sort((a, b) => a - b);
        const recordedDays = round(
          Number(result.summary?.paid_days ?? 0) +
            Number(result.summary?.unpaid_days ?? 0),
        );
        const recordedUnpaid =
          result.summary?.unpaid_equivalent_days === undefined
            ? null
            : round(Number(result.summary.unpaid_equivalent_days));
        let expectedUnpaid: number | null = null;
        if (this.summarize) {
          const s = await this.summarize(companyId, result.employee_id, {
            startDate: period.start_date,
            endDate: period.end_date,
          });
          expectedUnpaid = round(s.unpaidEquivalentDays);
        }
        const notes: string[] = [];
        if (recIds.join(',') !== expIds.join(','))
          notes.push('request set differs');
        if (recordedDays !== round(exp.days)) notes.push('leave days differ');
        if (
          expectedUnpaid !== null &&
          recordedUnpaid !== null &&
          expectedUnpaid !== recordedUnpaid
        ) {
          notes.push('unpaid equivalent differs');
        }
        if (!result.summary) notes.push('payroll result has no leave summary');
        rows.push({
          period_code: period.period_code,
          period_start: period.start_date,
          period_end: period.end_date,
          employee_id: result.employee_id,
          payroll_result_id: result.id,
          payroll_run_status: result.run_status,
          recorded_request_ids: recIds,
          expected_request_ids: expIds,
          recorded_days: recordedDays,
          expected_days: round(exp.days),
          recorded_unpaid_equivalent_days: recordedUnpaid,
          expected_unpaid_equivalent_days: expectedUnpaid,
          status: notes.length ? 'DIFF' : 'MATCH',
          notes: notes.join('; '),
        });
      }
      for (const [employeeId, exp] of expected) {
        if (seen.has(employeeId) || exp.days === 0) continue;
        rows.push({
          period_code: period.period_code,
          period_start: period.start_date,
          period_end: period.end_date,
          employee_id: employeeId,
          payroll_result_id: null,
          payroll_run_status: null,
          recorded_request_ids: [],
          expected_request_ids: exp.ids.sort((a, b) => a - b),
          recorded_days: 0,
          expected_days: round(exp.days),
          recorded_unpaid_equivalent_days: null,
          expected_unpaid_equivalent_days: null,
          status: 'MISSING_PAYROLL_RESULT',
          notes: 'approved leave in period but no payroll result',
        });
      }
    }
    return rows;
  }

  static toCsv(rows: ReconciliationRow[]): string {
    const header = [
      'period_code',
      'period_start',
      'period_end',
      'employee_id',
      'payroll_result_id',
      'payroll_run_status',
      'recorded_request_ids',
      'expected_request_ids',
      'recorded_days',
      'expected_days',
      'recorded_unpaid_equivalent_days',
      'expected_unpaid_equivalent_days',
      'status',
      'notes',
    ] as const;
    const cell = (v: unknown) => {
      const s = Array.isArray(v)
        ? v.join(' ')
        : v === null || v === undefined
          ? ''
          : String(v as string | number | boolean);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      header.join(','),
      ...rows.map((r) => header.map((h) => cell(r[h])).join(',')),
    ].join('\n');
  }

  /**
   * Encashments against payroll: what leave approved, what was submitted
   * to payroll (payroll_inputs), what payroll accepted and what it paid.
   * MISMATCH flags amounts or states that disagree between the two sides.
   */
  async reconcileEncashments(
    companyId: number,
    from: string,
    to: string,
  ): Promise<EncashmentReconciliationRow[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT e.id, e.employee_id, e.source, e.status, e.payment_status,
              e.approved_days::float AS approved_days,
              e.payable_amount::float AS payable_amount, e.currency,
              e.payroll_input_id, e.payroll_period_code, e.paid_at,
              e.payroll_run_id, e.reversed_at,
              e.calculation ->> 'auto_handoff_last_error' AS handoff_error,
              i.status::text AS input_status, i.amount::float AS input_amount,
              r.status::text AS run_status
         FROM leave_encashment_requests e
         LEFT JOIN payroll_inputs i ON i.id = e.payroll_input_id AND i.company_id = e.company_id
         LEFT JOIN payroll_runs r ON r.id = e.payroll_run_id AND r.company_id = e.company_id
        WHERE e.company_id = $1
          AND COALESCE(e.reviewed_at, e.created_at)::date BETWEEN $2 AND $3
        ORDER BY e.id`,
      [companyId, from, to],
    );
    return rows.map((r) => {
      const notes: string[] = [];
      let status: EncashmentReconciliationRow['status'];
      const amount = r.payable_amount as number | null;
      if (r.status === 'pending') status = 'AWAITING_APPROVAL';
      else if (r.status !== 'approved') status = 'NOT_PAYABLE';
      else if (r.payment_status === 'REVERSED') status = 'REVERSED';
      else if (r.payment_status === 'FAILED') status = 'FAILED';
      else if (r.payment_status === 'PAID') status = 'PAID';
      else if (!r.payroll_input_id) status = 'NOT_SUBMITTED';
      else if (r.input_status === 'DRAFT') status = 'SUBMITTED';
      else if (r.input_status === 'REJECTED') status = 'FAILED';
      else status = 'ACCEPTED';
      if (r.payroll_input_id && r.input_status == null) {
        status = 'MISMATCH';
        notes.push(
          'Payroll input referenced by the encashment no longer exists.',
        );
      }
      if (
        r.input_amount != null &&
        amount != null &&
        Math.abs((r.input_amount as number) - amount) > 0.009
      ) {
        status = 'MISMATCH';
        notes.push(
          `Payroll input amount ${Number(r.input_amount)} differs from the encashment amount ${String(amount)}.`,
        );
      }
      if (
        r.payment_status === 'PAID' &&
        !r.payroll_run_id &&
        r.payroll_input_id
      )
        notes.push(
          'Marked paid without a linked payroll run (manual payment record).',
        );
      if (r.input_status === 'REJECTED')
        notes.push('Payroll rejected the input; reverse or hand off again.');
      if (r.handoff_error && status === 'NOT_SUBMITTED')
        notes.push(`Automatic handoff: ${r.handoff_error as string}`);
      return {
        encashment_id: r.id as number,
        employee_id: r.employee_id as number,
        source: r.source as string,
        approved_days: (r.approved_days as number | null) ?? null,
        payable_amount: amount,
        currency: (r.currency as string | null) ?? null,
        payroll_input_id: (r.payroll_input_id as number | null) ?? null,
        payroll_input_status: (r.input_status as string | null) ?? null,
        payroll_input_amount: (r.input_amount as number | null) ?? null,
        payroll_period_code: (r.payroll_period_code as string | null) ?? null,
        payroll_run_id: (r.payroll_run_id as number | null) ?? null,
        payroll_run_status: (r.run_status as string | null) ?? null,
        payment_status: r.payment_status as string,
        paid_at: (r.paid_at as string | null) ?? null,
        status,
        notes: notes.join(' '),
      };
    });
  }

  /**
   * Exit leave settlements against the offboarding final settlement that
   * payroll pays (offboarding_settlement_items of type leave_encashment).
   */
  async reconcileExitSettlements(
    companyId: number,
    from: string,
    to: string,
  ): Promise<ExitSettlementReconciliationRow[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT s.id, s.employee_id, s.leave_type_id, s.offboarding_request_id,
              s.exit_date::text AS exit_date, s.settlement_days::float AS settlement_days,
              s.status, i.id AS item_id, i.status::text AS item_status,
              i.amount::float AS item_amount, i.paid_at AS item_paid_at
         FROM leave_exit_settlements s
         LEFT JOIN offboarding_settlement_items i
           ON i.company_id = s.company_id
          AND i.offboarding_request_id = s.offboarding_request_id
          AND i.item_type = 'leave_encashment'
          AND (i.calculation_snapshot ->> 'leave_type_id')::int = s.leave_type_id
        WHERE s.company_id = $1 AND s.exit_date BETWEEN $2 AND $3
        ORDER BY s.exit_date, s.id`,
      [companyId, from, to],
    );
    return rows.map((r) => {
      const notes: string[] = [];
      const itemPaid = Boolean(r.item_paid_at) || r.item_status === 'paid';
      let status: ExitSettlementReconciliationRow['status'] =
        (
          {
            draft: 'DRAFT',
            approved: 'APPROVED',
            pending_payroll: 'AWAITING_FINAL_SETTLEMENT',
            final_settlement: 'IN_FINAL_SETTLEMENT',
            paid: 'PAID',
            void: 'VOID',
          } as const
        )[r.status as string] ?? 'MISMATCH';
      if (r.status === 'paid' && !itemPaid) {
        status = 'MISMATCH';
        notes.push(
          'Leave shows paid but the final settlement item is not paid.',
        );
      }
      if (itemPaid && r.status !== 'paid' && r.status !== 'void') {
        status = 'MISMATCH';
        notes.push(
          'Payroll paid the final settlement but the leave settlement is not marked paid.',
        );
      }
      if (r.status === 'final_settlement' && !r.item_id) {
        status = 'MISMATCH';
        notes.push('No leave encashment item found in the final settlement.');
      }
      if (Number(r.settlement_days) > 0 && r.status === 'pending_payroll')
        notes.push('Approved days to pay but no final-settlement item yet.');
      return {
        settlement_id: r.id as number,
        employee_id: r.employee_id as number,
        leave_type_id: r.leave_type_id as number,
        offboarding_request_id:
          (r.offboarding_request_id as number | null) ?? null,
        exit_date: r.exit_date as string,
        settlement_days: r.settlement_days as number,
        leave_status: r.status as string,
        final_settlement_item_id: (r.item_id as number | null) ?? null,
        final_settlement_item_status: (r.item_status as string | null) ?? null,
        final_settlement_amount: (r.item_amount as number | null) ?? null,
        status,
        notes: notes.join(' '),
      };
    });
  }
}

export interface EncashmentReconciliationRow {
  encashment_id: number;
  employee_id: number;
  source: string;
  approved_days: number | null;
  payable_amount: number | null;
  currency: string | null;
  payroll_input_id: number | null;
  payroll_input_status: string | null;
  payroll_input_amount: number | null;
  payroll_period_code: string | null;
  payroll_run_id: number | null;
  payroll_run_status: string | null;
  payment_status: string;
  paid_at: string | null;
  status:
    | 'AWAITING_APPROVAL'
    | 'NOT_PAYABLE'
    | 'NOT_SUBMITTED'
    | 'SUBMITTED'
    | 'ACCEPTED'
    | 'PAID'
    | 'FAILED'
    | 'REVERSED'
    | 'MISMATCH';
  notes: string;
}

export interface ExitSettlementReconciliationRow {
  settlement_id: number;
  employee_id: number;
  leave_type_id: number;
  offboarding_request_id: number | null;
  exit_date: string;
  settlement_days: number;
  leave_status: string;
  final_settlement_item_id: number | null;
  final_settlement_item_status: string | null;
  final_settlement_amount: number | null;
  status:
    | 'DRAFT'
    | 'APPROVED'
    | 'AWAITING_FINAL_SETTLEMENT'
    | 'IN_FINAL_SETTLEMENT'
    | 'PAID'
    | 'VOID'
    | 'MISMATCH';
  notes: string;
}
