import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LetterStatusEnum } from './letter-catalogue';
import {
  allocateLetterReference,
  amountInWords,
  assertLetterTransition,
  assertNotSubmitter,
  computeLetterCan,
  formatLetterDate,
  formatLetterMoney,
  formatLetterReference,
  yearsOfService,
} from './letter-rules';

const S = LetterStatusEnum;
const ALL = [
  'employee_letters:read',
  'employee_letters:create',
  'employee_letters:approve',
  'employee_letters:issue',
  'employee_letters:cancel',
];

describe('letter state machine', () => {
  it.each([
    [S.DRAFT, 'submit'],
    [S.REJECTED, 'submit'],
    [S.DRAFT, 'edit'],
    [S.REJECTED, 'edit'],
    [S.PENDING_APPROVAL, 'approve'],
    [S.PENDING_APPROVAL, 'reject'],
    [S.APPROVED, 'issue'],
    [S.ISSUED, 'cancel'],
    [S.APPROVED, 'revise'],
    [S.ISSUED, 'revise'],
    [S.ISSUED, 'download'],
  ] as const)('allows %s -> %s', (status, action) => {
    expect(() => assertLetterTransition(status, action)).not.toThrow();
  });

  it.each([
    [S.DRAFT, 'approve'],
    [S.DRAFT, 'issue'],
    [S.PENDING_APPROVAL, 'issue'],
    [S.PENDING_APPROVAL, 'submit'],
    [S.CANCELLED, 'cancel'],
    [S.SUPERSEDED, 'revise'],
    [S.APPROVED, 'download'],
    [S.DRAFT, 'revise'],
  ] as const)('refuses %s -> %s with 409', (status, action) => {
    expect(() => assertLetterTransition(status, action)).toThrow(
      ConflictException,
    );
  });

  it('keeps approved and issued letters immutable', () => {
    expect(() => assertLetterTransition(S.ISSUED, 'edit')).toThrow(
      'Issued letters cannot be edited',
    );
    expect(() => assertLetterTransition(S.APPROVED, 'edit')).toThrow(
      'Approved letters cannot be edited',
    );
  });

  it('stops the submitter from approving their own letter', () => {
    expect(() => assertNotSubmitter({ companyMembershipId: 5 }, 5)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertNotSubmitter({ companyMembershipId: 6 }, 5),
    ).not.toThrow();
  });

  it('computes actions from status, permissions and separation of duties', () => {
    const pending = {
      status: S.PENDING_APPROVAL,
      submitted_by_company_user_id: 5,
    };
    expect(
      computeLetterCan(pending, { permissions: ALL, companyMembershipId: 6 }),
    ).toMatchObject({
      approve: true,
      reject: true,
      edit: false,
      issue: false,
      cancel: true,
    });
    expect(
      computeLetterCan(pending, { permissions: ALL, companyMembershipId: 5 }),
    ).toMatchObject({
      approve: false,
      reject: false,
    });
    expect(
      computeLetterCan(
        { status: S.APPROVED, submitted_by_company_user_id: 5 },
        {
          permissions: ['employee_letters:read', 'employee_letters:create'],
          companyMembershipId: 6,
        },
      ),
    ).toMatchObject({
      issue: false,
      revise: true,
      download: false,
      edit: false,
    });
    expect(
      computeLetterCan(
        { status: S.ISSUED, submitted_by_company_user_id: 5 },
        { permissions: ALL, companyMembershipId: 6 },
      ),
    ).toMatchObject({
      download: true,
      cancel: true,
      revise: true,
      edit: false,
    });
  });
});

describe('letter references', () => {
  it('formats LTR-YYYY-00001', () => {
    expect(formatLetterReference(2026, 1)).toBe('LTR-2026-00001');
    expect(formatLetterReference(2026, 123456)).toBe('LTR-2026-123456');
  });

  it('allocates through a locking upsert on the company/year sequence', async () => {
    let next = 1;
    const manager = {
      query: jest.fn((sql: string, params: unknown[]) => {
        expect(sql).toContain('ON CONFLICT ("company_id", "year")');
        expect(sql).toContain('RETURNING');
        expect(params).toEqual([9, 2026]);
        return Promise.resolve([{ value: next++ }]);
      }),
    };
    await expect(allocateLetterReference(manager, 9, 2026)).resolves.toBe(
      'LTR-2026-00001',
    );
    await expect(allocateLetterReference(manager, 9, 2026)).resolves.toBe(
      'LTR-2026-00002',
    );
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('fails loudly when no number comes back', async () => {
    await expect(
      allocateLetterReference({ query: () => Promise.resolve([]) }, 1, 2026),
    ).rejects.toThrow('Could not allocate a letter reference');
  });
});

describe('letter formatting', () => {
  it('formats dates and money for letters', () => {
    expect(formatLetterDate('2026-11-27')).toBe('27 November 2026');
    expect(
      formatLetterDate(
        new Date('2026-11-26T22:30:00Z'),
        'Africa/Dar_es_Salaam',
      ),
    ).toBe('27 November 2026');
    expect(formatLetterMoney('1250000.00', 'TZS')).toBe('TZS 1,250,000');
    expect(formatLetterMoney('1250.5', 'usd')).toBe('USD 1,250.50');
    expect(formatLetterMoney('', 'TZS')).toBe('');
  });

  it('writes amounts in words and years of service', () => {
    expect(amountInWords('2500000')).toBe('two million five hundred thousand');
    expect(amountInWords(1021)).toBe('one thousand twenty-one');
    expect(yearsOfService('2019-03-01', '2026-02-28')).toBe('6 years');
    expect(yearsOfService('2026-03-01', '2026-11-27')).toBe(
      'Less than one year',
    );
  });
});
