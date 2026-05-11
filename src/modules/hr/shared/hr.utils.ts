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
