const PERMISSION_ALIASES: Record<string, string[]> = {
  'leave-balances.view': ['leave_balances:read'],
  'leave-balances.view-own': ['leave_balances:read'],
  'leave-balances.manage': ['leave_balances:read', 'leave_balances:adjust'],
  'leave-balances.adjust': ['leave_balances:adjust'],
  'leave-balances.generate': ['leave_balances:adjust'],
  'leave-balances.carry-forward': ['leave_balances:adjust'],
  'users:enable-2fa': ['users:manage-2fa'],
  'users:disable-2fa': ['users:manage-2fa'],
};

export function expandPermissionAliases(permission: string): string[] {
  return Array.from(
    new Set([permission, ...(PERMISSION_ALIASES[permission] ?? [])]),
  );
}

export function hasPermission(
  userPermissions: string[] | undefined,
  permission: string,
): boolean {
  if (!Array.isArray(userPermissions) || !userPermissions.length) {
    return false;
  }

  const permissionSet = new Set(userPermissions);
  return expandPermissionAliases(permission).some((item) =>
    permissionSet.has(item),
  );
}

export function hasAnyPermission(
  userPermissions: string[] | undefined,
  permissions: string[],
): boolean {
  return permissions.some((permission) =>
    hasPermission(userPermissions, permission),
  );
}
