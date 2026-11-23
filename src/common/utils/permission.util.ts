/** Public permission keys have one module and one action. */
export const permissionKeyPattern = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;

// These are distinct assignable capabilities. Only the broader grant includes
// its listed operations. A read grant never includes a write operation.
const includedOperations: Readonly<Record<string, readonly string[]>> = {
  'leave_balances:read': ['leave_balances:list', 'leave_balances:read-own'],
  'leave_balances:adjust': [
    'leave_balances:adjust-manually',
    'leave_balances:manage',
    'leave_balances:generate',
    'leave_balances:carry-forward',
  ],
  'users:manage-2fa': ['users:enable-2fa', 'users:disable-2fa'],
};

export function effectivePermissions(assigned: Iterable<string>): string[] {
  const effective = new Set<string>();
  for (const key of assigned) {
    if (!permissionKeyPattern.test(key)) continue;
    effective.add(key);
    for (const operation of includedOperations[key] ?? [])
      effective.add(operation);
  }
  return Array.from(effective);
}

export function hasPermission(
  assigned: string[] | undefined,
  required: string,
): boolean {
  return (
    permissionKeyPattern.test(required) &&
    !!assigned?.some(
      (key) => key === required || includedOperations[key]?.includes(required),
    )
  );
}

export function hasAnyPermission(
  assigned: string[] | undefined,
  required: string[],
): boolean {
  return required.some((key) => hasPermission(assigned, key));
}
