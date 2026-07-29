import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionScope } from '../../modules/permissions/enums/permission-scope.enum';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { hasOwnerRole } from './system-generated-rbac.util';

type ScopedPermission = {
  name: string;
  scope: PermissionScope;
};

type ScopedRole = {
  company_id: number | null;
  name: string;
};

export function getAllowedPermissionScopesForRole(
  roleCompanyId: number | null,
): PermissionScope[] {
  return roleCompanyId === null
    ? [PermissionScope.PLATFORM, PermissionScope.SHARED]
    : [PermissionScope.COMPANY, PermissionScope.SHARED];
}

export function assertPermissionsMatchRoleScope(
  permissions: ScopedPermission[],
  role: ScopedRole,
): void {
  const allowedScopes = new Set(
    getAllowedPermissionScopesForRole(role.company_id),
  );
  const invalidPermissions = permissions.filter(
    (permission) => !allowedScopes.has(permission.scope),
  );

  if (!invalidPermissions.length) {
    return;
  }

  const roleScopeLabel =
    role.company_id === null ? 'platform role' : 'company role';

  throw new BadRequestException(
    `The following permissions do not belong on this ${roleScopeLabel}: ${invalidPermissions
      .map((permission) => permission.name)
      .join(', ')}`,
  );
}

export function assertCompanyScopedRoleAssignment(role: ScopedRole): void {
  if (role.company_id === null) {
    throw new BadRequestException(
      `Platform role "${role.name}" cannot be assigned through company membership`,
    );
  }
}

export function assertCompanyScopedPermissionAssignment(
  permission: ScopedPermission,
): void {
  if (permission.scope === PermissionScope.PLATFORM) {
    throw new BadRequestException(
      `Platform permission "${permission.name}" cannot be assigned in company scope`,
    );
  }
}

export function assertActorCanAccessPermission(
  actor: AuthenticatedUser | null | undefined,
  permission: ScopedPermission,
): void {
  if (hasOwnerRole(actor)) {
    return;
  }

  if (permission.scope === PermissionScope.PLATFORM) {
    throw new ForbiddenException('Platform permissions are not available here');
  }
}
