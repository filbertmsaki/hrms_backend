import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LeaveEvidenceCronService } from './leave-evidence-cron.service';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';

describe('leave evidence reminders', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const cutoff = new Date(now.getTime() - 3 * 86400000);
  let request: LeaveRequest;
  const repo = { findOne: jest.fn(), update: jest.fn() };
  const notifications = { createAndPush: jest.fn() };
  const service = new LeaveEvidenceCronService(
    repo as unknown as Repository<LeaveRequest>,
    notifications as unknown as NotificationsService,
    {} as PostgresAdvisoryLockService,
    { get: () => 'https://hr.example' } as unknown as ConfigService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    request = {
      id: 77,
      company_id: 10,
      leave_no: 'LV77',
      approval_cycle: 2,
      employee: { company_user_id: 5 },
      status: LeaveStatusEnum.APPROVED,
      evidence_required: true,
      evidence_due_at: new Date('2026-10-16T12:00:00Z'),
      evidence_received_at: null,
      evidence_last_reminder_at: null,
      documents: [],
    } as unknown as LeaveRequest;
    repo.findOne.mockImplementation(() => Promise.resolve(request));
    notifications.createAndPush.mockResolvedValue({ id: 1 });
  });
  it('reminds the employee even after approval with a stable dedupe key and both channels', async () => {
    await service.notify(request, now, cutoff);
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: 5,
        company_id: 10,
        channels: ['IN_APP', 'EMAIL'],
        action_url:
          'https://hr.example/dashboard/me/leave/requests?highlight=77',
        dedupe_key: 'leave:evidence:77:2026-10-16T12:00:00.000Z:1',
      }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        evidence_due_at: request.evidence_due_at,
        evidence_received_at: expect.anything(),
      }),
      { evidence_last_reminder_at: now },
    );
  });
  it.each([
    LeaveStatusEnum.CANCELLED,
    LeaveStatusEnum.REJECTED,
    LeaveStatusEnum.RETURNED_FOR_CORRECTION,
  ])('does not remind %s requests', async (status) => {
    request.status = status;
    await service.notify(request, now, cutoff);
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
  it('stops after an upload, even if the timestamp update failed', async () => {
    request.documents = [{ id: 9 }] as LeaveRequest['documents'];
    await service.notify(request, now, cutoff);
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
  it('respects extensions and the three-day repeat interval', async () => {
    request.evidence_due_at = new Date(now.getTime() + 86400000);
    await service.notify(request, now, cutoff);
    request.evidence_due_at = cutoff;
    request.evidence_last_reminder_at = new Date(now.getTime() - 86400000);
    await service.notify(request, now, cutoff);
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
  it('does not advance reminder time on notification failure', async () => {
    notifications.createAndPush.mockRejectedValue(
      new Error('outbox unavailable'),
    );
    await expect(service.notify(request, now, cutoff)).rejects.toThrow(
      'outbox unavailable',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('alerts only current-cycle HR reviewers about routing, without an approval notification', async () => {
    request.evidence_required = false;
    request.routing_required = true;
    request.approvals = [
      { approval_level: 2, approval_cycle: 1, approver_company_user_id: 8 },
      { approval_level: 2, approval_cycle: 2, approver_company_user_id: 9 },
    ] as LeaveRequest['approvals'];
    await service.notify(request, now, cutoff);
    expect(notifications.createAndPush).toHaveBeenCalledTimes(1);
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: 9,
        type: 'LEAVE_ROUTING_REQUIRED',
      }),
    );
  });
  it('uses the latest reminder timestamp rather than an old scheduler snapshot', async () => {
    const stale = { ...request };
    repo.findOne.mockResolvedValue({
      ...request,
      evidence_last_reminder_at: now,
    });
    await service.notify(stale, now, cutoff);
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
  it('does not notify old HR recipients after routing has been corrected', async () => {
    const stale = {
      ...request,
      routing_required: true,
      evidence_required: false,
    };
    repo.findOne.mockResolvedValue({ ...stale, routing_required: false });
    await service.notify(stale, now, cutoff);
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
});
