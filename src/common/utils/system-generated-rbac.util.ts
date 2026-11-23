import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

type OwnerAwareUser = Pick<AuthenticatedUser, 'scope' | 'userType'>;
type ProtectedRbacRecord = {
  name: string;
  is_system_generated: boolean;
  company_id?: number | null;
};

export function hasOwnerRole(
  actor?: OwnerAwareUser | null,
): actor is OwnerAwareUser & { scope: 'platform'; userType: 'OWNER' } {
  return actor?.scope === 'platform' && actor.userType === 'OWNER';
}

export function assertCanCreateSystemGeneratedRbacRecord(
  actor: OwnerAwareUser | null | undefined,
  isSystemGenerated: boolean | undefined,
  resource: 'role' | 'permission',
): void {
  if (isSystemGenerated && !hasOwnerRole(actor)) {
    throw new ForbiddenException(
      `Only platform-scoped users can create system-generated ${resource}s`,
    );
  }
}

export function assertCanMutateSystemGeneratedRbacRecord(
  actor: OwnerAwareUser | null | undefined,
  record: ProtectedRbacRecord,
  resource: 'role' | 'permission',
): void {
  if (!record.is_system_generated || hasOwnerRole(actor)) return;
  // Company-scoped built-in roles are templates the company may tailor.
  // Tenant/permission checks (assertCanManageScopedRbacRecord, route
  // permissions) still restrict this to admins of that company.
  if (
    resource === 'role' &&
    record.company_id !== null &&
    record.company_id !== undefined
  ) {
    return;
  }
  throw new ForbiddenException(
    `This system-generated ${resource} is read-only`,
  );
}
