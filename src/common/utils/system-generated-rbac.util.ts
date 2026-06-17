import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

type OwnerAwareUser = Pick<AuthenticatedUser, 'roles' | 'userType'>;
type ProtectedRbacRecord = {
  name: string;
  is_system_generated: boolean;
};

export function hasOwnerRole(
  actor?: OwnerAwareUser | null,
): actor is OwnerAwareUser {
  return (
    actor?.userType === 'OWNER' || actor?.roles?.includes('OWNER') === true
  );
}

export function assertCanCreateSystemGeneratedRbacRecord(
  actor: OwnerAwareUser | null | undefined,
  isSystemGenerated: boolean | undefined,
  resource: 'role' | 'permission',
): void {
  if (isSystemGenerated && !hasOwnerRole(actor)) {
    throw new ForbiddenException(
      `Only users with the OWNER role can create system-generated ${resource}s`,
    );
  }
}

export function assertCanMutateSystemGeneratedRbacRecord(
  actor: OwnerAwareUser | null | undefined,
  record: ProtectedRbacRecord,
  resource: 'role' | 'permission',
): void {
  if (record.is_system_generated && !hasOwnerRole(actor)) {
    throw new ForbiddenException('This resource can not be modified');
  }
}
