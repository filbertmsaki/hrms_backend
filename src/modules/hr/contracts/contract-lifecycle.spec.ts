import { ConflictException } from '@nestjs/common';
import {
  allowedActions,
  assertTransition,
  ContractAction as A,
  deriveValidity,
  formatContractReference,
  isContentLocked,
  nextStatus,
} from './contract-lifecycle';
import { EmploymentContractStatus as S } from './entities/employment-contract.entity';

describe('contract lifecycle', () => {
  it.each([
    [S.DRAFT, A.SEND, S.PENDING_HR_SIGNATURE],
    [S.PENDING_HR_SIGNATURE, A.COMPANY_SIGN, S.PENDING_EMPLOYEE_SIGNATURE],
    [S.PENDING_EMPLOYEE_SIGNATURE, A.EMPLOYEE_SIGN, S.SIGNED],
    [S.PENDING_EMPLOYEE_SIGNATURE, A.EMPLOYEE_UPLOAD, S.PENDING_VERIFICATION],
    [S.PENDING_VERIFICATION, A.VERIFY_ACCEPT, S.SIGNED],
    [S.PENDING_VERIFICATION, A.VERIFY_REJECT, S.PENDING_EMPLOYEE_SIGNATURE],
    [S.PENDING_HR_SIGNATURE, A.CANCEL, S.CANCELLED],
    [S.SIGNED, A.SUPERSEDE, S.SUPERSEDED],
    [S.DRAFT, A.LEGACY_ATTACH, S.PENDING_HR_SIGNATURE],
    [S.ISSUED, A.EMPLOYEE_SIGN, S.SIGNED],
    [S.PENDING_EMPLOYEE_SIGNATURE, A.REPLACE_DOCUMENT, S.CANCELLED],
    [S.SIGNED, A.TERMINATE, S.TERMINATED],
  ])('%s --%s--> %s', (from, action, to) => {
    expect(assertTransition(from, action)).toBe(to);
  });

  it.each([
    [S.DRAFT, A.EMPLOYEE_SIGN],
    [S.DRAFT, A.COMPANY_SIGN],
    [S.PENDING_HR_SIGNATURE, A.EMPLOYEE_SIGN],
    [S.PENDING_HR_SIGNATURE, A.UPDATE_DRAFT],
    [S.PENDING_EMPLOYEE_SIGNATURE, A.UPDATE_DRAFT],
    [S.PENDING_EMPLOYEE_SIGNATURE, A.REASSIGN_SIGNATORY],
    [S.PENDING_VERIFICATION, A.EMPLOYEE_SIGN],
    [S.SIGNED, A.CANCEL],
    [S.SIGNED, A.EMPLOYEE_SIGN],
    [S.CANCELLED, A.SEND],
    [S.SUPERSEDED, A.CANCEL],
    // A sent file is locked: no in-place re-attach.
    [S.PENDING_EMPLOYEE_SIGNATURE, A.LEGACY_ATTACH],
    [S.SIGNED, A.REPLACE_DOCUMENT],
    [S.TERMINATED, A.CANCEL],
    [S.TERMINATED, A.EMPLOYEE_SIGN],
    [S.PENDING_HR_SIGNATURE, A.TERMINATE],
  ])('rejects %s --%s-->', (from, action) => {
    expect(nextStatus(from, action)).toBeNull();
    expect(() => assertTransition(from, action)).toThrow(ConflictException);
  });

  it('locks content once the contract leaves draft', () => {
    expect(isContentLocked(S.DRAFT)).toBe(false);
    for (const status of Object.values(S).filter((s) => s !== S.DRAFT)) {
      expect(isContentLocked(status)).toBe(true);
    }
  });

  it('lists only actions legal for the status and never exposes supersede', () => {
    expect(allowedActions(S.DRAFT)).toEqual(
      expect.arrayContaining([A.UPDATE_DRAFT, A.SEND, A.CANCEL]),
    );
    expect(allowedActions(S.SIGNED)).toEqual([]);
    expect(allowedActions(S.CANCELLED)).toEqual([]);
  });

  it('derives validity from signing status and dates', () => {
    const base = { startDate: '2026-01-01', endDate: '2026-12-31' };
    expect(deriveValidity({ ...base, status: S.DRAFT }, '2026-06-01')).toBe(
      'NOT_EFFECTIVE',
    );
    expect(deriveValidity({ ...base, status: S.SIGNED }, '2025-12-01')).toBe(
      'NOT_STARTED',
    );
    expect(deriveValidity({ ...base, status: S.SIGNED }, '2026-06-01')).toBe(
      'ACTIVE',
    );
    expect(deriveValidity({ ...base, status: S.SIGNED }, '2026-12-10')).toBe(
      'EXPIRING',
    );
    expect(deriveValidity({ ...base, status: S.SIGNED }, '2027-01-01')).toBe(
      'EXPIRED',
    );
    expect(
      deriveValidity(
        { ...base, endDate: null, status: S.SIGNED },
        '2030-01-01',
      ),
    ).toBe('ACTIVE');
    expect(
      deriveValidity({ ...base, status: S.SUPERSEDED }, '2026-06-01'),
    ).toBe('SUPERSEDED');
    expect(
      deriveValidity({ ...base, status: S.TERMINATED }, '2026-06-01'),
    ).toBe('TERMINATED');
  });

  it('formats references as EC-YYYY-NNNNN', () => {
    expect(formatContractReference(new Date('2026-03-04T00:00:00Z'), 42)).toBe(
      'EC-2026-00042',
    );
  });
});
