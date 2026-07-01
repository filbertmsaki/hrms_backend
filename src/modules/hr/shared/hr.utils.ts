import { CompanyUser } from '../../companies/entities/company-user.entity';

export function buildPaginationMeta(
  totalItems: number,
  itemCount: number,
  itemsPerPage: number,
  currentPage: number,
) {
  return {
    totalItems,
    itemCount,
    itemsPerPage,
    totalPages: Math.ceil(totalItems / itemsPerPage),
    currentPage,
    hasNextPage: currentPage * itemsPerPage < totalItems,
    hasPreviousPage: currentPage > 1,
  };
}

export function getMembershipRoles(
  membership?: Pick<CompanyUser, 'role_assignments'> | null,
): string[] {
  return (
    membership?.role_assignments?.map((assignment) => assignment.role?.name) ??
    []
  ).filter((name): name is string => Boolean(name));
}

export function getMembershipPermissions(
  membership?: Pick<
    CompanyUser,
    'permission_assignments' | 'role_assignments'
  > | null,
): string[] {
  const permissions = new Set<string>();

  membership?.permission_assignments?.forEach((assignment) => {
    if (assignment.permission?.name) {
      permissions.add(assignment.permission.name);
    }
  });

  membership?.role_assignments?.forEach((assignment) => {
    assignment.role?.permissions?.forEach((permission) => {
      if (permission?.name) {
        permissions.add(permission.name);
      }
    });
  });

  return Array.from(permissions);
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateOnly(value: Date): string {
  // Date-only values must be stable regardless of the Node process timezone.
  // Using UTC calendar parts prevents rebuilds from drifting a day backward
  // or forward when the server runs outside the attendance timezone.
  return [
    value.getUTCFullYear(),
    padDatePart(value.getUTCMonth() + 1),
    padDatePart(value.getUTCDate()),
  ].join('-');
}

export function normalizeDateInput(value: string, field: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const leadingDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (leadingDateMatch) {
    return leadingDateMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }

  return formatDateOnly(parsed);
}

export function buildDateOnlyRange(
  startDate: string,
  endDate: string,
): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(formatDateOnly(d));
  }

  return out;
}

export function addDaysToDateOnly(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return formatDateOnly(base);
}
