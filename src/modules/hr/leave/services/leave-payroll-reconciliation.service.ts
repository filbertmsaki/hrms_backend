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
}
