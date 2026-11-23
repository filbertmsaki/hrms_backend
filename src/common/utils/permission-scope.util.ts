import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionScope } from '../../modules/permissions/enums/permission-scope.enum';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { hasOwnerRole } from './system-generated-rbac.util';
import { effectivePermissions } from './permission.util';

import type { User } from '../../modules/users/entities/user.entity';

export function platformAccess(user: Pick<User, 'roles' | 'permissions'>) {
  const roles = (user.roles ?? []).filter((role) => role.company_id === null);
  const grants = [
    ...(user.permissions ?? []),
    ...roles.flatMap((role) => role.permissions ?? []),
  ];
  return {
    roles: roles.map((role) => role.name),
    permissions: effectivePermissions(
      grants
        .filter(
          (permission) =>
            permission.scope === PermissionScope.PLATFORM ||
            permission.scope === PermissionScope.SHARED,
        )
        .map((permission) => permission.name),
    ),
  };
}

type ScopedPermission = {
  name: string;
  scope: PermissionScope;
};

type ScopedRole = {
  company_id: number | null;
  name: string;
};

/** An administrator may delegate only operations already available in that context. */
export function assertCanDelegatePermissions(
  actor: AuthenticatedUser | undefined,
  permissions: Array<{ name: string }>,
  companyId: number | null,
) {
  if (!actor)
    throw new ForbiddenException(
      'An authorized actor is required to delegate access',
    );
  if (hasOwnerRole(actor) && actor.roles.includes('SUPER_ADMIN')) return;
  if (
    !hasOwnerRole(actor) &&
    (actor.scope !== 'company' ||
      actor.companyId !== companyId ||
      !actor.companyMembershipId)
  ) {
    throw new ForbiddenException(
      'Role administration requires the active tenant',
    );
  }
  const owned = new Set(effectivePermissions(actor.permissions));
  for (const { name } of permissions) {
    if (owned.has(name)) continue;
    if (name.startsWith('data_scope:') && owned.has('data_scope:company'))
      continue;
    throw new ForbiddenException(
      'You may only delegate permissions available to you',
    );
  }
}

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
