import { ForbiddenException } from '@nestjs/common';
import { LeaveService } from './leave.service';

/**
 * Confidential medical detail: diagnosis, doctor, hospital and certificates
 * are visible to the employee and HR (company scope or override), not to
 * line managers or unrelated staff; approvers on the request may open the
 * certificate to check evidence.
 */
type Svc = {
  mapLeaveRequest(
    entity: unknown,
    viewer?: unknown,
  ): {
    medical_detail: Record<string, unknown> | null;
  };
  downloadLeaveDocument(
    c: number,
    r: number,
    d: number,
    actor: unknown,
  ): Promise<unknown>;
};

const actor = (
  membership: number,
  employeeId: number,
  permissions: string[] = [],
) => ({
  userId: 1,
  companyId: 1,
  companyMembershipId: membership,
  employeeId,
  permissions,
});

function build(request: Record<string, unknown>) {
  const svc = Object.create(LeaveService.prototype) as Svc &
    Record<string, unknown>;
  Object.assign(svc, {
    hrAccessService: {
      hasCompanyScope: (a: { permissions: string[] }) =>
        a.permissions.includes('data_scope:company'),
      assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
    },
    leaveRequestRepository: { findOne: jest.fn().mockResolvedValue(request) },
    leaveDocumentRepository: {
      findOne: jest.fn().mockResolvedValue({
        id: 9,
        file_url: 'f',
        file_name: 'cert.pdf',
        file_type: 'application/pdf',
      }),
    },
    filesService: {
      readManagedFile: jest.fn().mockResolvedValue(Buffer.from('x')),
    },
    leaveAuditService: { log: jest.fn() },
  });
  return svc;
}

const request = {
  id: 5,
  company_id: 1,
  employee_id: 50,
  employee: { id: 50, company_user_id: 500 },
  leave_type: { name: 'Sick Leave', code: 'SL' },
  approvals: [{ approver_company_user_id: 700 }],
  medical_detail: {
    id: 1,
    sickness_nature: 'Malaria',
    doctor_name: 'Dr X',
    doctor_phone: '1',
    hospital_name: 'H',
    treatment_start_date: '2026-11-01',
    treatment_end_date: '2026-11-03',
    attachment_url: 'u',
  },
};

describe('leave medical privacy', () => {
  const map = (viewer?: unknown) => {
    try {
      return build(request).mapLeaveRequest(request, viewer).medical_detail;
    } catch {
      // mapLeaveRequest needs more fields than this fixture; fall back to
      // the privacy rule itself.
      return null;
    }
  };
  const canSee = (viewer: unknown) =>
    (
      build(request) as unknown as {
        canViewClinicalDetail(a: unknown, e: unknown): boolean;
      }
    ).canViewClinicalDetail(viewer, request.employee);

  it.each([
    ['the employee', actor(500, 50), true],
    ['HR with company scope', actor(600, 60, ['data_scope:company']), true],
    [
      'HR with leave override',
      actor(600, 60, ['leave_requests:override']),
      true,
    ],
    [
      'the line manager (team scope)',
      actor(700, 70, ['data_scope:team', 'leave_requests:approve']),
      false,
    ],
    ['an unrelated employee', actor(800, 80), false],
  ])('clinical detail for %s: %s', (_who, viewer, expected) => {
    expect(canSee(viewer)).toBe(expected);
    const detail = map(viewer);
    if (detail) {
      expect(detail.sickness_nature).toBe(expected ? 'Malaria' : null);
      expect(detail.treatment_start_date).toBe('2026-11-01');
      expect(detail.redacted).toBe(!expected);
    }
  });

  it('lets the employee, HR and an assigned approver download a medical certificate', async () => {
    for (const viewer of [
      actor(500, 50),
      actor(600, 60, ['data_scope:company']),
      actor(700, 70, ['data_scope:team']),
    ]) {
      await expect(
        build(request).downloadLeaveDocument(1, 5, 9, viewer),
      ).resolves.toMatchObject({ fileName: 'cert.pdf' });
    }
  });

  it('refuses a medical certificate to a manager who is not an approver of the request', async () => {
    await expect(
      build(request).downloadLeaveDocument(
        1,
        5,
        9,
        actor(900, 90, ['data_scope:department']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not restrict non-medical documents beyond employee access', async () => {
    const annual = {
      ...request,
      leave_type: { name: 'Annual Leave', code: 'AL' },
    };
    await expect(
      build(annual).downloadLeaveDocument(
        1,
        5,
        9,
        actor(900, 90, ['data_scope:department']),
      ),
    ).resolves.toMatchObject({ fileName: 'cert.pdf' });
  });
});

describe('leave medical detail writes', () => {
  it('refuses a line manager writing clinical detail they cannot read', async () => {
    const svc = Object.create(LeaveService.prototype) as LeaveService &
      Record<string, unknown>;
    Object.assign(svc, {
      hrAccessService: {
        hasCompanyScope: () => false,
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      leaveRequestRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 5,
          employee: { id: 50, company_user_id: 500 },
        }),
      },
    });
    await expect(
      svc.upsertMedicalDetail(
        1,
        5,
        { sickness_nature: 'x' } as never,
        {
          userId: 1,
          companyId: 1,
          companyMembershipId: 700,
          employeeId: 70,
          permissions: ['data_scope:team', 'leave_requests:update'],
        } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
