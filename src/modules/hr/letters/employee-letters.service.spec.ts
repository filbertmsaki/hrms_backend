import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeeLettersService } from './employee-letters.service';
import { EmployeeLetter } from './entities/employee-letter.entity';
import { LetterStatusEnum } from './letter-catalogue';
import { LetterPlaceholdersService } from './letter-placeholders.service';

const context = {
  companyId: 1,
  companyName: 'Alliance',
  timezone: 'Africa/Dar_es_Salaam',
  logoUrl: null,
  address: null,
  phone: null,
  email: null,
  website: null,
};

function actor(
  membershipId: number,
  permissions: string[] = [],
): AuthenticatedUser {
  return {
    id: membershipId * 10,
    email: 'x@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 1,
    companyMembershipId: membershipId,
    roles: [],
    permissions,
  };
}

function letter(overrides: Partial<EmployeeLetter> = {}): EmployeeLetter {
  return {
    id: 11,
    company_id: 1,
    reference_no: 'LTR-2026-00011',
    letter_type: 'PROMOTION',
    template_id: 3,
    template_version: 1,
    employee_id: 7,
    candidate_id: null,
    recipient_name: 'Asha Mwinyi',
    recipient_address: null,
    subject: 'Promotion to {{new_position}}',
    salutation: 'Dear {{employee_first_name}},',
    body: 'You are promoted to {{new_position}} from {{effective_date}}.',
    closing: 'Yours sincerely,',
    extra_values: { new_position: 'Manager', effective_date: '2026-12-01' },
    values: null,
    signatory_name: 'Neema',
    signatory_title: 'HR',
    requires_approval: true,
    include_acknowledgement: false,
    status: LetterStatusEnum.DRAFT,
    submitted_by_company_user_id: null,
    submitted_at: null,
    approved_by_company_user_id: null,
    approved_at: null,
    rejected_by_company_user_id: null,
    rejected_at: null,
    rejection_reason: null,
    issued_by_company_user_id: null,
    issued_at: null,
    cancelled_by_company_user_id: null,
    cancelled_at: null,
    cancellation_reason: null,
    revision_of_letter_id: null,
    superseded_by_letter_id: null,
    document_id: null,
    verification_token: null,
    verification_revoked_at: null,
    emailed_at: null,
    created_by_company_user_id: 5,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function setup(row: EmployeeLetter) {
  const events: string[] = [];
  const saved: EmployeeLetter[] = [];
  const repo = {
    findOneBy: jest.fn().mockResolvedValue(row),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((value: EmployeeLetter) => {
      saved.push({ ...value });
      return Promise.resolve(value);
    }),
    insert: jest.fn((value: { action: string }) => {
      events.push(value.action);
      return Promise.resolve();
    }),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => {
      const qb = {
        where: () => qb,
        setLock: () => qb,
        getOne: () => Promise.resolve({ ...row }),
      };
      return qb;
    }),
  };
  const em = {
    getRepository: () => repo,
    query: jest.fn().mockResolvedValue([]),
  };
  const dataSource = {
    getRepository: () => repo,
    manager: em,
    transaction: (cb: (m: typeof em) => unknown) => cb(em),
  };
  const hrAccess = {
    ensureActorCompanyId: () => 1,
    ensureActorMembershipId: (a: AuthenticatedUser) => a.companyMembershipId,
    getAccessibleEmployeeIds: jest.fn().mockResolvedValue(null),
    assertCanAccessEmployee: jest.fn(),
  };
  const placeholders = new LetterPlaceholdersService({} as never);
  jest.spyOn(placeholders, 'companyContext').mockResolvedValue(context);
  jest.spyOn(placeholders, 'resolveRecipient').mockResolvedValue({
    kind: 'employee',
    id: 7,
    name: 'Asha Mwinyi',
    employeeNo: 'AIC-0042',
    email: null,
    address: null,
    companyUserId: null,
    employee: null,
    values: { employee_first_name: 'Asha', employee_name: 'Asha Mwinyi' },
    currency: 'TZS',
  });
  const securityEvents = { logBestEffort: jest.fn() };
  const service = new EmployeeLettersService(
    dataSource as never,
    hrAccess as never,
    {} as never,
    placeholders,
    {} as never,
    {} as never,
    {} as never,
    securityEvents as never,
  );
  return { service, events, saved, securityEvents };
}

const ALL = [
  'employee_letters:read',
  'employee_letters:create',
  'employee_letters:approve',
  'employee_letters:issue',
  'employee_letters:cancel',
];

describe('EmployeeLettersService state machine', () => {
  it('submits a complete letter, snapshots values and waits for approval', async () => {
    const { service, events, saved, securityEvents } = setup(letter());
    const result = await service.submit(actor(5, ALL), 11);
    expect(result.status).toBe(LetterStatusEnum.PENDING_APPROVAL);
    const last = saved[saved.length - 1];
    expect(last.values).toMatchObject({
      new_position: 'Manager',
      effective_date: '1 December 2026',
      employee_first_name: 'Asha',
    });
    expect(last.submitted_by_company_user_id).toBe(5);
    expect(events).toEqual(['SUBMITTED']);
    expect(securityEvents.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'EMPLOYEE_LETTER_SUBMITTED' }),
    );
    expect(result.can.approve).toBe(false); // submitter cannot approve
  });

  it('goes straight to APPROVED when the template needs no approval', async () => {
    const { service, events } = setup(letter({ requires_approval: false }));
    const result = await service.submit(actor(5, ALL), 11);
    expect(result.status).toBe(LetterStatusEnum.APPROVED);
    expect(events).toEqual(['SUBMITTED', 'APPROVED']);
    expect(result.can.issue).toBe(true);
  });

  it('refuses to submit with unresolved placeholders and lists them', async () => {
    const { service } = setup(letter({ extra_values: {} }));
    const error = await service
      .submit(actor(5, ALL), 11)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      missing_placeholders: ['new_position', 'effective_date'],
    });
  });

  it('keeps issued and approved letters immutable (409)', async () => {
    for (const status of [LetterStatusEnum.ISSUED, LetterStatusEnum.APPROVED]) {
      const { service } = setup(letter({ status }));
      await expect(
        service.update(actor(5, ALL), 11, { body: 'changed' }),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('does not let the submitter approve or reject', async () => {
    const pending = letter({
      status: LetterStatusEnum.PENDING_APPROVAL,
      submitted_by_company_user_id: 5,
    });
    const { service } = setup(pending);
    await expect(service.approve(actor(5, ALL), 11)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.reject(actor(5, ALL), 11, 'no'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets another approver approve a pending letter', async () => {
    const pending = letter({
      status: LetterStatusEnum.PENDING_APPROVAL,
      submitted_by_company_user_id: 5,
    });
    const { service, events } = setup(pending);
    const result = await service.approve(actor(6, ALL), 11, 'ok');
    expect(result.status).toBe(LetterStatusEnum.APPROVED);
    expect(result.approved_at).toBeInstanceOf(Date);
    expect(events).toEqual(['APPROVED']);
  });

  it('cannot issue before approval', async () => {
    const { service } = setup(
      letter({ status: LetterStatusEnum.PENDING_APPROVAL }),
    );
    await expect(service.issue(actor(6, ALL), 11)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('revokes verification when an issued letter is cancelled', async () => {
    const { service, events, saved } = setup(
      letter({ status: LetterStatusEnum.ISSUED }),
    );
    const result = await service.cancel(actor(6, ALL), 11, 'Issued in error');
    expect(result.status).toBe(LetterStatusEnum.CANCELLED);
    expect(saved[saved.length - 1].verification_revoked_at).toBeInstanceOf(
      Date,
    );
    expect(events).toEqual(['CANCELLED', 'VERIFICATION_REVOKED']);
  });

  it('hides letters of employees outside the actor scope', async () => {
    const { service } = setup(letter());
    (
      service as unknown as {
        hrAccess: { getAccessibleEmployeeIds: jest.Mock };
      }
    ).hrAccess.getAccessibleEmployeeIds.mockResolvedValue([99]);
    await expect(service.get(actor(5, ALL), 11)).rejects.toThrow(
      'Letter not found',
    );
  });
});
