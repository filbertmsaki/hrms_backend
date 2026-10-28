import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasAnyPermission } from '../../../common/utils/permission.util';

export type DashboardSensitiveAccessReason =
  | 'INSUFFICIENT_PERMISSION'
  | 'COMPANY_SCOPE_REQUIRED'
  | 'FILTER_NOT_SUPPORTED';

export type DashboardSensitiveAccess =
  | { allowed: true }
  | { allowed: false; reason: DashboardSensitiveAccessReason };

/**
 * Payroll and employee-finance dashboard services return company-wide totals.
 * Do not expose those totals to narrower scopes or alongside employee filters
 * that the source services cannot apply.
 */
export function resolveCompanyAggregateAccess(
  actor: AuthenticatedUser,
  query: {
    branch_id?: number;
    department_id?: number;
    employee_id?: number;
  },
  requiredPermissions: string[],
): DashboardSensitiveAccess {
  if (!hasAnyPermission(actor.permissions, requiredPermissions)) {
    return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' };
  }

  if (!hasAnyPermission(actor.permissions, ['data_scope:company'])) {
    return { allowed: false, reason: 'COMPANY_SCOPE_REQUIRED' };
  }

  if (query.branch_id || query.department_id || query.employee_id) {
    return { allowed: false, reason: 'FILTER_NOT_SUPPORTED' };
  }

  return { allowed: true };
}
