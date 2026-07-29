import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { hasOwnerRole } from './system-generated-rbac.util';

type ScopedRbacRecord = {
  company_id: number | null;
};

export function ensureCompanyScopedActor(
  actor?: AuthenticatedUser | null,
): AuthenticatedUser & {
  companyId: number;
  companyMembershipId: number;
} {
  if (
    !actor ||
    actor.scope !== 'company' ||
    !actor.companyId ||
    !actor.companyMembershipId
  ) {
    throw new ForbiddenException('Active company context is required');
  }

  return actor as AuthenticatedUser & {
    companyId: number;
    companyMembershipId: number;
  };
}

export function resolveScopedRbacCompanyId(
  actor: AuthenticatedUser | null | undefined,
  requestedCompanyId: number | undefined,
  resource: 'role' | 'permission',
): number | null {
  if (hasOwnerRole(actor)) {
    return requestedCompanyId ?? null;
  }

  const companyActor = ensureCompanyScopedActor(actor);

  if (
    typeof requestedCompanyId === 'number' &&
    requestedCompanyId !== companyActor.companyId
  ) {
    throw new ForbiddenException(
      `You can only create ${resource}s in your active company`,
    );
  }

  return companyActor.companyId;
}

export function assertCanManageScopedRbacRecord(
  actor: AuthenticatedUser | null | undefined,
  record: ScopedRbacRecord,
  resource: 'role' | 'permission',
): void {
  if (hasOwnerRole(actor)) {
    return;
  }

  const companyActor = ensureCompanyScopedActor(actor);

  if (record.company_id === null) {
    throw new ForbiddenException(
      `Platform-scoped ${resource}s can only be managed in platform context`,
    );
  }

  if (record.company_id !== companyActor.companyId) {
    throw new ForbiddenException(
      `You can only manage ${resource}s in your active company`,
    );
  }
}
