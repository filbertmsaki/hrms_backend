import { EntityManager } from 'typeorm';
import { PayrollPeriodStatusEnum } from '../../payroll/payroll.enums';

// Periods that no longer accept input: their attendance has been (or is
// being) paid on and must not be rewritten.
export const CLOSED_PAYROLL_PERIOD_STATUSES: readonly PayrollPeriodStatusEnum[] =
  [
    PayrollPeriodStatusEnum.INPUT_CLOSED,
    PayrollPeriodStatusEnum.PROCESSING,
    PayrollPeriodStatusEnum.REVIEW,
    PayrollPeriodStatusEnum.APPROVED,
    PayrollPeriodStatusEnum.LOCKED,
    PayrollPeriodStatusEnum.PAID,
    PayrollPeriodStatusEnum.CLOSED,
  ];

/**
 * End date of the latest closed payroll period for the employee's payroll
 * calendar on `asOfDate`: the calendar of their active payroll group, else
 * the company default calendar, else any company calendar.
 */
export async function findPayrollLockedThroughDate(
  manager: EntityManager,
  companyId: number,
  employeeId: number,
  asOfDate: string,
): Promise<string | null> {
  const rows: Array<{ locked_through: string | null }> = await manager.query(
    `
    SELECT TO_CHAR(MAX(period.end_date), 'YYYY-MM-DD') AS locked_through
    FROM payroll_periods period
    WHERE period.company_id = $1
      AND period.status::text = ANY($4::text[])
      AND period.payroll_calendar_id = COALESCE(
        (
          SELECT payroll_group.payroll_calendar_id
          FROM payroll_group_assignments assignment
          JOIN payroll_groups payroll_group
            ON payroll_group.id = assignment.payroll_group_id
          WHERE assignment.company_id = $1
            AND assignment.employee_id = $2
            AND assignment.status = 'ACTIVE'
            AND assignment.effective_from <= $3::date
            AND (assignment.effective_to IS NULL OR assignment.effective_to >= $3::date)
            AND payroll_group.payroll_calendar_id IS NOT NULL
          ORDER BY assignment.effective_from DESC
          LIMIT 1
        ),
        (
          SELECT calendar.id
          FROM payroll_calendars calendar
          WHERE calendar.company_id = $1 AND calendar.is_default = true
          ORDER BY calendar.id
          LIMIT 1
        ),
        period.payroll_calendar_id
      )
    `,
    [companyId, employeeId, asOfDate, CLOSED_PAYROLL_PERIOD_STATUSES],
  );

  return rows[0]?.locked_through ?? null;
}
