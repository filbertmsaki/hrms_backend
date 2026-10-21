import { ConflictException } from '@nestjs/common';
import { FieldMobileSyncService } from './field-mobile-sync.service';
import { FieldMobileSyncOperationEnum } from '../enums/work-activity.enums';

describe('FieldMobileSyncService', () => {
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
