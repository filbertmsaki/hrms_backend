import { ConflictException } from '@nestjs/common';
import { EmploymentContractStatus as S } from './entities/employment-contract.entity';

export enum ContractAction {
  UPDATE_DRAFT = 'UPDATE_DRAFT',
  SEND = 'SEND',
  COMPANY_SIGN = 'COMPANY_SIGN',
  /** Pre-workflow HR PDF attach; treated as a company-signed upload. */
  LEGACY_ATTACH = 'LEGACY_ATTACH',
  REASSIGN_SIGNATORY = 'REASSIGN_SIGNATORY',
  EMPLOYEE_SIGN = 'EMPLOYEE_SIGN',
  EMPLOYEE_UPLOAD = 'EMPLOYEE_UPLOAD',
  VERIFY_ACCEPT = 'VERIFY_ACCEPT',
  VERIFY_REJECT = 'VERIFY_REJECT',
  CANCEL = 'CANCEL',
  SUPERSEDE = 'SUPERSEDE',
}

/** The only legal moves. Anything else is a 409. */
const TRANSITIONS: Record<ContractAction, Partial<Record<S, S>>> = {
  [ContractAction.UPDATE_DRAFT]: { [S.DRAFT]: S.DRAFT },
  [ContractAction.SEND]: { [S.DRAFT]: S.PENDING_HR_SIGNATURE },
  [ContractAction.COMPANY_SIGN]: {
    [S.PENDING_HR_SIGNATURE]: S.PENDING_EMPLOYEE_SIGNATURE,
  },
  [ContractAction.LEGACY_ATTACH]: {
    [S.DRAFT]: S.PENDING_EMPLOYEE_SIGNATURE,
    [S.PENDING_EMPLOYEE_SIGNATURE]: S.PENDING_EMPLOYEE_SIGNATURE,
  },
  [ContractAction.REASSIGN_SIGNATORY]: {
    [S.DRAFT]: S.DRAFT,
    [S.PENDING_HR_SIGNATURE]: S.PENDING_HR_SIGNATURE,
  },
  [ContractAction.EMPLOYEE_SIGN]: {
    [S.PENDING_EMPLOYEE_SIGNATURE]: S.SIGNED,
    // Legacy rows created before the workflow.
    [S.ISSUED]: S.SIGNED,
  },
  [ContractAction.EMPLOYEE_UPLOAD]: {
    [S.PENDING_EMPLOYEE_SIGNATURE]: S.PENDING_VERIFICATION,
  },
  [ContractAction.VERIFY_ACCEPT]: { [S.PENDING_VERIFICATION]: S.SIGNED },
  [ContractAction.VERIFY_REJECT]: {
    [S.PENDING_VERIFICATION]: S.PENDING_EMPLOYEE_SIGNATURE,
  },
  [ContractAction.CANCEL]: {
    [S.DRAFT]: S.CANCELLED,
    [S.PENDING_HR_SIGNATURE]: S.CANCELLED,
    [S.PENDING_EMPLOYEE_SIGNATURE]: S.CANCELLED,
    [S.PENDING_VERIFICATION]: S.CANCELLED,
    [S.ISSUED]: S.CANCELLED,
  },
  [ContractAction.SUPERSEDE]: { [S.SIGNED]: S.SUPERSEDED },
};

export function nextStatus(from: S, action: ContractAction): S | null {
  return TRANSITIONS[action][from] ?? null;
}

export function assertTransition(from: S, action: ContractAction): S {
  const to = nextStatus(from, action);
  if (!to) {
    throw new ConflictException(
      `Action ${action} is not allowed while the contract is ${from}`,
    );
  }
  return to;
}

export function allowedActions(from: S): ContractAction[] {
  return (Object.keys(TRANSITIONS) as ContractAction[]).filter(
    (action) => action !== ContractAction.SUPERSEDE && nextStatus(from, action),
  );
}

/** Content (clauses, terms, parties) is editable only before sending. */
export function isContentLocked(status: S): boolean {
  return status !== S.DRAFT;
}

export type ContractValidity =
  | 'NOT_EFFECTIVE'
  | 'NOT_STARTED'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'SUPERSEDED';

/** Employment validity is derived from signing status + dates; never stored. */
export function deriveValidity(
  contract: { status: S; startDate: string; endDate: string | null },
  today: string,
  expiringWindowDays = 30,
): ContractValidity {
  if (contract.status === S.SUPERSEDED) return 'SUPERSEDED';
  if (contract.status !== S.SIGNED) return 'NOT_EFFECTIVE';
  if (contract.startDate > today) return 'NOT_STARTED';
  if (!contract.endDate) return 'ACTIVE';
  if (contract.endDate < today) return 'EXPIRED';
  const days =
    (Date.parse(`${contract.endDate}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
    86_400_000;
  return days <= expiringWindowDays ? 'EXPIRING' : 'ACTIVE';
}

export function formatContractReference(createdAt: Date, id: number): string {
  return `EC-${createdAt.getUTCFullYear()}-${String(id).padStart(5, '0')}`;
}
