import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveAuditLog } from '../entities/leave-audit-log.entity';
import { openingPreviewFingerprint } from '../utils/leave-opening-preview.util';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveOpeningReviewService } from './leave-opening-review.service';

describe('legacy opening preview review', () => {
  const actor = {
    id: 2,
    companyId: 1,
    companyMembershipId: 3,
  } as AuthenticatedUser;
  const balance = {
    id: 4,
    company_id: 1,
    employee_id: 5,
    leave_type_id: 6,
    fiscal_year: '2026',
    version: 1,
    opening_balance_days: '0',
    carried_forward_days: '0',
    accrued_days: '10',
    entitlement_days: '28',
    allocated_days: '28',
    adjusted_days: '0',
    used_days: '2',
    expired_days: '0',
    attendance_deduction_days: '0',
    pending_days: '1',
    approved_future_days: '0',
  } as LeaveBalance;
  const employee = { id: 5, company_id: 1 } as Employee;
  let audit: { log: jest.Mock };
  let access: { assertCanAccessEmployee: jest.Mock };
  let service: LeaveOpeningReviewService;
  let manager: { getRepository: jest.Mock };
  let findReviews: jest.Mock;

  beforeEach(() => {
    findReviews = jest.fn().mockResolvedValue([]);
    manager = {
      getRepository: jest.fn((entity: unknown) => ({
        findOne: jest
          .fn()
          .mockResolvedValue(entity === LeaveBalance ? balance : employee),
      })),
    };
    const dataSource = {
      getRepository: jest.fn((entity: unknown) =>
        entity === LeaveAuditLog
          ? { find: findReviews }
          : {
              findOne: jest
                .fn()
                .mockResolvedValue(
                  entity === LeaveBalance ? balance : employee,
                ),
            },
      ),
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    access = {
      assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
    };
    service = new LeaveOpeningReviewService(
      dataSource as unknown as DataSource,
      access as unknown as HrAccessService,
      audit as unknown as LeaveAuditService,
    );
  });

  it('records the exact reviewed snapshot in the existing audit log without signing off or posting', async () => {
    const result = await service.recordPreviewReview(1, actor, {
      balanceId: 4,
      fingerprint: openingPreviewFingerprint(balance),
      reason: 'Reviewed against source',
    });
    expect(result.is_cutover_signoff).toBe(false);
    expect(result.preview.can_post).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        entity_id: 4,
        action: 'leave_opening_preview.reviewed',
        payload: expect.objectContaining({
          reason: 'Reviewed against source',
          fingerprint: result.fingerprint,
          is_cutover_signoff: false,
        }),
      }),
      manager,
    );
  });

  it('rejects a stale preview without writing an audit review', async () => {
    await expect(
      service.recordPreviewReview(1, actor, {
        balanceId: 4,
        fingerprint: 'stale',
        reason: 'Review',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('enforces employee scope before recording the review', async () => {
    access.assertCanAccessEmployee.mockRejectedValue(new ForbiddenException());
    await expect(
      service.recordPreviewReview(1, actor, {
        balanceId: 4,
        fingerprint: openingPreviewFingerprint(balance),
        reason: 'Review',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('lists only the company and balance review records after checking employee scope', async () => {
    await service.listPreviewReviews(1, actor, 4);
    expect(access.assertCanAccessEmployee).toHaveBeenCalledWith(
      actor,
      employee,
    );
    expect(findReviews).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          company_id: 1,
          entity_name: 'leave_balance',
          entity_id: 4,
          action: 'leave_opening_preview.reviewed',
        },
        take: 100,
      }),
    );
  });

  it('does not record reviews of a balance from another company', async () => {
    await expect(
      service.recordPreviewReview(9, actor, {
        balanceId: 4,
        fingerprint: openingPreviewFingerprint(balance),
        reason: 'Review',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
