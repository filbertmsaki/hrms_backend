import { Repository } from 'typeorm';
import { ActionItemsService } from './action-items.service';
import { ActionItemStatusEnum } from './enums/action-item-status.enum';
import { ActionItemTypeEnum } from './enums/action-item-type.enum';
import { ActionItem } from './entities/action-item.entity';

describe('ActionItemsService', () => {
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  let service: ActionItemsService;

  const baseInput = {
    companyId: 10,
    assigneeCompanyUserId: 90,
    actionType: ActionItemTypeEnum.APPROVAL,
    sourceModule: 'leave',
    sourceEntityType: 'LEAVE_REQUEST',
    sourceEntityId: 55,
    sourceKey: 'leave:approval:55:90',
    title: 'Leave approval required',
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((value: unknown) => value),
      create: jest.fn((value: unknown) => value),
      update: jest.fn(),
      count: jest.fn(),
    };
    service = new ActionItemsService(
      repository as unknown as Repository<ActionItem>,
    );
  });

  it('creates a new action item when none exists for the source key', async () => {
    repository.findOne.mockResolvedValue(null);

    await service.upsertOpen(baseInput);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: 'leave:approval:55:90',
        status: ActionItemStatusEnum.OPEN,
      }),
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('does not create a duplicate action item on a repeated upsert (idempotency)', async () => {
    const existing = {
      id: 1,
      status: ActionItemStatusEnum.OPEN,
      title: 'stale title',
    };
    repository.findOne.mockResolvedValue(existing);

    await service.upsertOpen(baseInput);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, title: baseInput.title }),
    );
  });

  it('reopens a completed action item instead of leaving it closed', async () => {
    const existing = {
      id: 2,
      status: ActionItemStatusEnum.COMPLETED,
      completedAt: new Date('2026-01-01'),
    };
    repository.findOne.mockResolvedValue(existing);

    const result = await service.upsertOpen(baseInput);

    expect(result.status).toBe(ActionItemStatusEnum.OPEN);
    expect(result.completedAt).toBeNull();
  });

  it('completes all open items for a source entity regardless of assignee', async () => {
    await service.completeAllOpenForEntity(10, 'leave', 'LEAVE_REQUEST', 55);

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 10,
        sourceModule: 'leave',
        sourceEntityType: 'LEAVE_REQUEST',
        sourceEntityId: '55',
        status: ActionItemStatusEnum.OPEN,
      }),
      expect.objectContaining({ status: ActionItemStatusEnum.COMPLETED }),
    );
  });
});
