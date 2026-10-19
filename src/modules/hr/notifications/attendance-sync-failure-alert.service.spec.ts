import { AttendanceSyncFailureAlertService } from './attendance-sync-failure-alert.service';
import { HikvisionSyncLogStatusEnum } from '../../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';

describe('AttendanceSyncFailureAlertService', () => {
  const failedRun = {
    id: 42,
    companyId: 7,
    deviceId: 11,
    status: HikvisionSyncLogStatusEnum.FAILED,
    startedAt: new Date('2026-10-19T07:00:00.000Z'),
  };

  const makeQueryBuilder = <T>(result: T) => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return queryBuilder;
  };

  it('sends a deduplicated in-app alert to active device-sync operators', async () => {
    const syncQuery = makeQueryBuilder([failedRun]);
    const recipientQuery = makeQueryBuilder([{ id: 91 }]);
    const syncLogRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(syncQuery),
    };
    const companyUserRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(recipientQuery),
    };
    const notificationsService = {
      createAndPush: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AttendanceSyncFailureAlertService(
      syncLogRepository as never,
      companyUserRepository as never,
      notificationsService as never,
    );

    await service.scanRecentFailures(new Date('2026-10-19T08:00:00.000Z'));

    expect(syncQuery.andWhere).toHaveBeenCalledWith(
      'syncLog.status IN (:...statuses)',
      { statuses: ['FAILED', 'PARTIAL'] },
    );
    expect(recipientQuery.andWhere).toHaveBeenCalledWith(
      '(directPermission.name = :permissionName OR rolePermission.name = :permissionName)',
      { permissionName: 'access_control_sync:execute' },
    );
    expect(notificationsService.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 7,
        receiver_company_user_id: 91,
        title: 'Hikvision attendance sync needs attention',
        entity_id: 42,
        dedupe_key: 'attendance:sync-failure:42:91',
        channels: ['IN_APP'],
      }),
    );
  });

  it('does not send alerts when there are no recent failed syncs', async () => {
    const syncQuery = makeQueryBuilder([]);
    const syncLogRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(syncQuery),
    };
    const companyUserRepository = { createQueryBuilder: jest.fn() };
    const notificationsService = { createAndPush: jest.fn() };
    const service = new AttendanceSyncFailureAlertService(
      syncLogRepository as never,
      companyUserRepository as never,
      notificationsService as never,
    );

    await service.scanRecentFailures(new Date('2026-10-19T08:00:00.000Z'));

    expect(companyUserRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(notificationsService.createAndPush).not.toHaveBeenCalled();
  });

  it('reports alert readiness and queues a controlled test only to active operators', async () => {
    const recipient = { id: 91 };
    const recipientQuery = makeQueryBuilder([recipient]);
    const companyUserRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(recipientQuery),
    };
    const notificationsService = {
      createAndPush: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AttendanceSyncFailureAlertService(
      {} as never,
      companyUserRepository as never,
      notificationsService as never,
    );

    await expect(service.getReadiness(7)).resolves.toEqual({
      ready: true,
      recipient_count: 1,
      required_permission: 'access_control_sync:execute',
      delivery_channel: 'IN_APP',
    });
    await expect(service.sendTestAlert(7)).resolves.toMatchObject({
      ready: true,
      recipient_count: 1,
      queued_count: 1,
      failed_count: 0,
    });
    expect(notificationsService.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: recipient.id,
        entity_type: 'ATTENDANCE_SYNC_ALERT_TEST',
        channels: ['IN_APP'],
      }),
    );
  });

  it('reports missing recipients without attempting to queue a test alert', async () => {
    const recipientQuery = makeQueryBuilder([]);
    const companyUserRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(recipientQuery),
    };
    const notificationsService = { createAndPush: jest.fn() };
    const service = new AttendanceSyncFailureAlertService(
      {} as never,
      companyUserRepository as never,
      notificationsService as never,
    );

    await expect(service.sendTestAlert(7)).resolves.toEqual({
      ready: false,
      recipient_count: 0,
      queued_count: 0,
      failed_count: 0,
    });
    expect(notificationsService.createAndPush).not.toHaveBeenCalled();
  });
});
