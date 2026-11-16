import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { FilesService } from '../../../files/files.service';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveVerificationService } from './leave-verification.service';

const TOKEN = 'a'.repeat(43);

function buildLeave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 7,
    leave_no: 'LV-2026-000005',
    status: LeaveStatusEnum.APPROVED,
    start_date: '2026-11-20',
    end_date: '2026-11-25',
    total_days: '4.00',
    approved_at: new Date('2026-11-15T09:00:00Z'),
    reason: 'Family matter — confidential',
    rejection_reason: 'internal note',
    company: { name: 'Alliance', metadata: {} },
    leave_type: { name: 'Annual Leave' },
    employee: {
      first_name: 'Inocent',
      middle_name: null,
      last_name: 'Ditrick',
      employee_no: 'EMP-001',
      phone: '+255700000000',
      email: 'secret@example.com',
      primary_department: { name: 'Finance' },
    },
    ...overrides,
  } as unknown as LeaveRequest;
}

describe('LeaveVerificationService', () => {
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let service: LeaveVerificationService;
  const now = new Date('2026-11-16T08:00:00Z');

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new LeaveVerificationService(
      repo as unknown as Repository<LeaveRequest>,
      { get: () => 'https://hrms.example.com/' } as unknown as ConfigService,
      {
        readManagedFile: jest.fn().mockResolvedValue(null),
      } as unknown as FilesService,
    );
  });

  it('rejects malformed tokens without touching the database', async () => {
    for (const bad of [
      '',
      '123',
      'a'.repeat(42),
      `${'a'.repeat(42)}!`,
      '1 OR 1=1',
    ]) {
      await expect(service.lookup(bad, now)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('gives unknown tokens the same 404 as malformed ones', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.lookup(TOKEN, now)).rejects.toThrow(
      'This verification code is not recognised.',
    );
  });

  it('returns only the public fields for an approved, current leave', async () => {
    repo.findOne.mockResolvedValue(buildLeave());
    const result = await service.lookup(TOKEN, now);
    expect(result).toEqual({
      verification_status: 'valid',
      company: { name: 'Alliance', logo_data_url: null },
      employee_name: 'Inocent Ditrick',
      employee_no: 'EMP-001',
      department_name: 'Finance',
      leave_no: 'LV-2026-000005',
      leave_type_name: 'Annual Leave',
      start_date: '2026-11-20',
      end_date: '2026-11-25',
      total_days: '4.00',
      approval_status: 'approved',
      approved_at: '2026-11-15T09:00:00.000Z',
      checked_at: now.toISOString(),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('confidential');
    expect(serialized).not.toContain('internal note');
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('+255');
  });

  it.each([
    [{ status: LeaveStatusEnum.APPROVED, end_date: '2026-11-10' }, 'expired'],
    [{ status: LeaveStatusEnum.APPROVED, end_date: '2026-11-16' }, 'valid'],
    [{ status: LeaveStatusEnum.PENDING_HR, approved_at: null }, 'pending'],
    [
      { status: LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER, approved_at: null },
      'pending',
    ],
    [
      { status: LeaveStatusEnum.RETURNED_FOR_CORRECTION, approved_at: null },
      'returned',
    ],
    [{ status: LeaveStatusEnum.REJECTED, approved_at: null }, 'rejected'],
    [{ status: LeaveStatusEnum.CANCELLED, approved_at: null }, 'cancelled'],
    [{ status: LeaveStatusEnum.CANCELLED }, 'revoked'],
  ] as const)('maps %o to %s', (overrides, expected) => {
    expect(
      service.resolveStatus(
        buildLeave(overrides as Partial<LeaveRequest>),
        '2026-11-16',
      ),
    ).toBe(expected);
  });

  it('builds the public URL from APP_FRONTEND_URL', () => {
    expect(service.buildVerificationUrl(TOKEN)).toBe(
      `https://hrms.example.com/verify/leave/${TOKEN}`,
    );
  });

  it('issues a 43-char token only when none exists', async () => {
    let stored: string | null = null;
    repo.createQueryBuilder.mockImplementation(() => ({
      addSelect: () => ({
        where: () => ({
          getOne: () => Promise.resolve({ verification_token: stored }),
        }),
      }),
    }));
    repo.update.mockImplementation(
      (_where, set: { verification_token: string }) => {
        stored = set.verification_token;
        return Promise.resolve({ affected: 1 });
      },
    );

    const first = await service.ensureToken(7);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const second = await service.ensureToken(7);
    expect(second).toBe(first);
    expect(repo.update).toHaveBeenCalledTimes(1);
  });
});
