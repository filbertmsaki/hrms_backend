import { AccessibleEmployeeSqlScope } from '../shared/hr-access.service';

export type DashboardEmployeeSubquery = {
  sql: string;
  params: Record<string, unknown>;
};

/**
 * Build a company-constrained employee subquery from the server-resolved
 * access descriptor. Requested branch/department filters remain conjunctive
 * and retain the dashboard's primary-assignment semantics.
 */
export function buildDashboardEmployeeSubquery(
  companyId: number,
  query: {
    branch_id?: number;
    department_id?: number;
    employee_id?: number;
  },
  scope: AccessibleEmployeeSqlScope,
): DashboardEmployeeSubquery {
  const params: Record<string, unknown> = { scopeCompanyId: companyId };
  const access: string[] = [];
  if (!scope.companyWide) {
    if (scope.actorEmployeeId !== null) {
      access.push('employee_scope.id = :scopeActorEmployeeId');
      params.scopeActorEmployeeId = scope.actorEmployeeId;
    }
    if (scope.branchIds.length) {
      access.push(`(
        employee_scope.primary_branch_id IN (:...scopeBranchIds)
        OR EXISTS (
          SELECT 1
          FROM employee_departments scope_branch_assignment
          JOIN departments scope_branch_department
            ON scope_branch_department.id = scope_branch_assignment.department_id
          WHERE scope_branch_assignment.employee_id = employee_scope.id
            AND scope_branch_department.company_id = :scopeCompanyId
            AND scope_branch_department.branch_id IN (:...scopeBranchIds)
        )
      )`);
      params.scopeBranchIds = scope.branchIds;
    }
    if (scope.departmentIds.length) {
      access.push(`(
        employee_scope.primary_department_id IN (:...scopeDepartmentIds)
        OR EXISTS (
          SELECT 1
          FROM employee_departments scope_department_assignment
          WHERE scope_department_assignment.employee_id = employee_scope.id
            AND scope_department_assignment.department_id IN (:...scopeDepartmentIds)
        )
      )`);
      params.scopeDepartmentIds = scope.departmentIds;
    }
    if (scope.managerEmployeeId !== null) {
      access.push(`EXISTS (
        WITH RECURSIVE accessible_reports(id) AS (
          SELECT report.id FROM employees report
          WHERE report.company_id = :scopeCompanyId
            AND report.reports_to = :scopeManagerEmployeeId
          UNION
          SELECT child.id FROM employees child
          JOIN accessible_reports parent ON child.reports_to = parent.id
          WHERE child.company_id = :scopeCompanyId
        )
        SELECT 1 FROM accessible_reports
        WHERE accessible_reports.id = employee_scope.id
      )`);
      params.scopeManagerEmployeeId = scope.managerEmployeeId;
    }
  }

  const conditions = ['employee_scope.company_id = :scopeCompanyId'];
  if (!scope.companyWide) {
    conditions.push(access.length ? `(${access.join(' OR ')})` : 'FALSE');
  }
  if (query.branch_id) {
    conditions.push('employee_scope.primary_branch_id = :filterBranchId');
    params.filterBranchId = query.branch_id;
  }
  if (query.department_id) {
    conditions.push(
      'employee_scope.primary_department_id = :filterDepartmentId',
    );
    params.filterDepartmentId = query.department_id;
  }
  if (query.employee_id) {
    conditions.push('employee_scope.id = :filterEmployeeId');
    params.filterEmployeeId = query.employee_id;
  }

  return {
    sql: `SELECT employee_scope.id FROM employees employee_scope WHERE ${conditions.join(' AND ')}`,
    params,
  };
}
