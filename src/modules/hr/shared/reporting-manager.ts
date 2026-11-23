import { EntityManager } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';

/**
 * Prefer the employee's primary department, then branch, then company.
 * A tie at the closest level leaves the workflow's existing escalation in place.
 * Aliases are internal query-builder aliases, never request input.
 */
export function reportingManagerSql(
  alias: 'employee' | 'scopeEmployee' | 'filterEmployee',
) {
  const employee = '"' + alias + '"';
  const proximity = `CASE WHEN candidate.primary_department_id = ${employee}.primary_department_id THEN 0
    WHEN candidate.primary_branch_id = ${employee}.primary_branch_id THEN 1 ELSE 2 END`;
  return `COALESCE(NULLIF(${employee}.reports_to,${employee}.id), (
    SELECT CASE WHEN COUNT(*) = 1 THEN MIN(candidate.id) END
    FROM positions held
    JOIN positions parent ON parent.id = held.reports_to_position_id AND parent.company_id = held.company_id AND parent.is_active AND parent.status = 'active'
    JOIN employees candidate ON candidate.primary_position_id = parent.id AND candidate.company_id = held.company_id
    JOIN company_users membership ON membership.id = candidate.company_user_id AND membership.company_id = held.company_id AND membership.status = 'active'
    WHERE held.id = ${employee}.primary_position_id AND held.company_id = ${employee}.company_id AND held.is_active AND held.status = 'active'
      AND parent.id <> held.id AND candidate.id <> ${employee}.id AND candidate.employment_status = 'active'
    GROUP BY ${proximity} ORDER BY ${proximity} LIMIT 1))`;
}

export async function resolveReportingManager(
  manager: EntityManager,
  employee: Pick<
    Employee,
    'id' | 'company_id' | 'reports_to' | 'primary_position_id'
  >,
) {
  if (employee.reports_to && employee.reports_to !== employee.id)
    return employee.reports_to;
  if (!employee.primary_position_id) return null;
  const [row] = await manager.query<Array<{ manager_id: number | null }>>(
    `SELECT ${reportingManagerSql('employee')} AS manager_id FROM employees employee WHERE employee.company_id=$1 AND employee.id=$2`,
    [employee.company_id, employee.id],
  );
  return row?.manager_id ?? null;
}
