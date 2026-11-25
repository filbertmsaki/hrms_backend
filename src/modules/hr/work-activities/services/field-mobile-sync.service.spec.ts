import { ConflictException } from '@nestjs/common';
import { FieldMobileSyncService } from './field-mobile-sync.service';
import { FieldMobileSyncOperationEnum } from '../enums/work-activity.enums';

describe('FieldMobileSyncService', () => {
  it('preserves the device and offline marker for a queued visit check-in', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const fieldVisits = {
      checkIn: jest
        .fn()
        .mockResolvedValue({ id: 42, attendance: { status: 'LINKED' } }),
    };
    const service = new FieldMobileSyncService(
      { ensureActorCompanyId: () => 7 } as never,
      {} as never,
      fieldVisits as never,
      repository as never,
    );
    const actor = { employeeId: 12 } as never;
    const result = await service.sync(actor, {
      sync_request_id: '00000000-0000-4000-8000-000000000011',
      device_identifier: 'native-device',
      items: [
        {
          client_request_id: '00000000-0000-4000-8000-000000000012',
          operation: FieldMobileSyncOperationEnum.VISIT_CHECK_IN,
          payload: {
            visit_id: 42,
            offline_queued: true,
            latitude: -6.8,
            longitude: 39.2,
            captured_at: '2026-11-25T08:00:00Z',
          },
        },
      ],
    } as never);
    expect(fieldVisits.checkIn).toHaveBeenCalledWith(
      actor,
      42,
      expect.objectContaining({
        offline_queued: true,
        device_identifier: 'native-device',
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        status: 'COMPLETED',
        attendance: { status: 'LINKED' },
      }),
    );
  });

  it('rejects invalid queued coordinates before calling the field service', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const fieldVisits = { checkIn: jest.fn() };
    const service = new FieldMobileSyncService(
      { ensureActorCompanyId: () => 7 } as never,
      {} as never,
      fieldVisits as never,
      repository as never,
    );
    const result = await service.sync(
      { employeeId: 12 } as never,
      {
        sync_request_id: '00000000-0000-4000-8000-000000000021',
        device_identifier: 'native-device',
        items: [
          {
            client_request_id: '00000000-0000-4000-8000-000000000022',
            operation: FieldMobileSyncOperationEnum.VISIT_CHECK_IN,
            payload: {
              visit_id: 42,
              latitude: 999,
              longitude: 39.2,
              captured_at: '2026-11-25T08:00:00Z',
            },
          },
        ],
      } as never,
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(fieldVisits.checkIn).not.toHaveBeenCalled();
  });
  it('creates a queued self task once and returns the stored response on replay', async () => {
    const saved = new Map<string, Record<string, unknown>>();
    const repository = {
      findOne: jest.fn(
        async ({ where }: { where: { syncRequestId: string } }) =>
          saved.get(where.syncRequestId) ?? null,
      ),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        saved.set(String(value.syncRequestId), value);
        return value;
      }),
    };
    const dailyActivityService = {
      createMyTask: jest.fn().mockResolvedValue({ id: 55 }),
    };
    const service = new FieldMobileSyncService(
      { ensureActorCompanyId: jest.fn(() => 7) } as never,
      dailyActivityService as never,
      {} as never,
      repository as never,
    );
    const actor = { employeeId: 12 } as never;
    const dto = {
      sync_request_id: '00000000-0000-4000-8000-000000000011',
      device_identifier: 'test-device',
      items: [
        {
          client_request_id: '00000000-0000-4000-8000-000000000012',
          operation: FieldMobileSyncOperationEnum.UPSERT_SELF_TASK,
          payload: {
            activity_date: '2026-10-21',
            title: 'Prepare report',
            description: 'Collect field results',
          },
        },
      ],
    };

    const first = await service.sync(actor, dto as never);
    const replay = await service.sync(actor, dto as never);
    expect(replay).toEqual(first);
    expect(dailyActivityService.createMyTask).toHaveBeenCalledTimes(1);
    expect(dailyActivityService.createMyTask).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        client_request_id: dto.items[0].client_request_id,
        title: 'Prepare report',
      }),
    );
  });

  it('returns the stored result for an identical request and rejects a reused ID with a changed payload', async () => {
    const saved = new Map<string, Record<string, unknown>>();
    const repository = {
      findOne: jest.fn(
        async ({ where }: { where: { syncRequestId: string } }) =>
          saved.get(where.syncRequestId) ?? null,
      ),
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        saved.set(String(value.syncRequestId), value);
        return value;
      }),
    };
    const fieldVisitService = {
      createUnplannedVisit: jest.fn().mockResolvedValue({ id: 42 }),
    };
    const service = new FieldMobileSyncService(
      { ensureActorCompanyId: jest.fn(() => 7) } as never,
      {} as never,
      fieldVisitService as never,
      repository as never,
    );
    const actor = { employeeId: 12 } as never;
    const dto = {
      sync_request_id: '00000000-0000-4000-8000-000000000001',
      device_identifier: 'test-device',
      items: [
        {
          client_request_id: '00000000-0000-4000-8000-000000000002',
          operation: FieldMobileSyncOperationEnum.UPSERT_VISIT,
          payload: { purpose: 'Scheduled client visit' },
        },
      ],
    };

    const first = await service.sync(actor, dto as never);
    const replay = await service.sync(actor, dto as never);
    expect(replay).toEqual(first);
    expect(fieldVisitService.createUnplannedVisit).toHaveBeenCalledTimes(1);

    const changed = {
      ...dto,
      items: [{ ...dto.items[0], payload: { purpose: 'Changed payload' } }],
    };
    await expect(service.sync(actor, changed as never)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fieldVisitService.createUnplannedVisit).toHaveBeenCalledTimes(1);
  });
});
