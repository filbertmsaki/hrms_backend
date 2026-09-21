import { EmployeeMovementSchedulerService } from './employee-movement-scheduler.service';
import { EmployeeMovementStatusEnum } from '../enums/employee-movement-status.enum';

const createQueryBuilderMock = (movements: unknown[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(movements),
});

describe('EmployeeMovementSchedulerService', () => {
  let movementRepository: { createQueryBuilder: jest.Mock };
  let employeeRepository: { findOne: jest.Mock };
  let configService: { get: jest.Mock };
  let actionItemsService: { upsertOpen: jest.Mock };
  let advisoryLockService: { runWithLock: jest.Mock };
  let employeeMovementsService: { applyScheduled: jest.Mock };
  let service: EmployeeMovementSchedulerService;

  beforeEach(() => {
    movementRepository = { createQueryBuilder: jest.fn() };
    employeeRepository = { findOne: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(3) };
    actionItemsService = { upsertOpen: jest.fn().mockResolvedValue(undefined) };
    advisoryLockService = {
      runWithLock: jest.fn(async (_key: string, cb: () => Promise<void>) => {
        await cb();
        return { acquired: true };
      }),
    };
    employeeMovementsService = {
      applyScheduled: jest.fn().mockResolvedValue(undefined),
    };

    service = new EmployeeMovementSchedulerService(
      movementRepository as never,
      employeeRepository as never,
      configService as never,
      actionItemsService as never,
      advisoryLockService as never,
      employeeMovementsService as never,
    );
  });

  describe('autoApplyDueMovements', () => {
    it('applies scheduled movements that are due', async () => {
      const dueMovement = {
        id: 1,
        companyId: 10,
        status: EmployeeMovementStatusEnum.SCHEDULED,
      };
      movementRepository.createQueryBuilder
        .mockReturnValueOnce(createQueryBuilderMock([dueMovement]))
        .mockReturnValueOnce(createQueryBuilderMock([]));

      await service.run();

      expect(employeeMovementsService.applyScheduled).toHaveBeenCalledWith(
        10,
        1,
      );
    });

    it('does not apply movements that are not yet due (query excludes them)', async () => {
      movementRepository.createQueryBuilder
        .mockReturnValueOnce(createQueryBuilderMock([]))
        .mockReturnValueOnce(createQueryBuilderMock([]));

      await service.run();

      expect(employeeMovementsService.applyScheduled).not.toHaveBeenCalled();
    });

    it('isolates per-movement errors so one failure does not block others', async () => {
      const movementA = { id: 1, companyId: 10 };
      const movementB = { id: 2, companyId: 10 };
      movementRepository.createQueryBuilder
        .mockReturnValueOnce(createQueryBuilderMock([movementA, movementB]))
        .mockReturnValueOnce(createQueryBuilderMock([]));

      employeeMovementsService.applyScheduled
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await service.run();

      expect(employeeMovementsService.applyScheduled).toHaveBeenCalledTimes(2);
      expect(employeeMovementsService.applyScheduled).toHaveBeenNthCalledWith(
        1,
        10,
        1,
      );
      expect(employeeMovementsService.applyScheduled).toHaveBeenNthCalledWith(
        2,
        10,
        2,
      );
    });
  });

  describe('sendApprovalReminders', () => {
    it('sends a reminder to the reporting manager for stale pending-approval movements', async () => {
      const movement = {
        id: 5,
        companyId: 10,
        movementNo: 'MOV-005',
        employee: { reports_to: 7 },
      };
      movementRepository.createQueryBuilder
        .mockReturnValueOnce(createQueryBuilderMock([]))
        .mockReturnValueOnce(createQueryBuilderMock([movement]));
      employeeRepository.findOne.mockResolvedValue({
        id: 7,
        company_user_id: 70,
      });

      await service.run();

      expect(actionItemsService.upsertOpen).toHaveBeenCalledTimes(1);
      expect(actionItemsService.upsertOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 10,
          assigneeCompanyUserId: 70,
          sourceEntityId: 5,
        }),
      );
    });

    it('dedups reminders via a stable per-day sourceKey (idempotent upsert)', async () => {
      const movement = {
        id: 5,
        companyId: 10,
        movementNo: 'MOV-005',
        employee: { reports_to: 7 },
      };
      let callCount = 0;
      movementRepository.createQueryBuilder.mockImplementation(() => {
        callCount += 1;
        return callCount % 2 === 1
          ? createQueryBuilderMock([])
          : createQueryBuilderMock([movement]);
      });
      employeeRepository.findOne.mockResolvedValue({
        id: 7,
        company_user_id: 70,
      });

      await service.run();
      await service.run();

      const sourceKeys = actionItemsService.upsertOpen.mock.calls.map(
        (call) => call[0].sourceKey,
      );
      expect(sourceKeys[0]).toEqual(sourceKeys[1]);
    });

    it('skips movements whose employee has no manager', async () => {
      const movement = {
        id: 6,
        companyId: 10,
        movementNo: 'MOV-006',
        employee: { reports_to: null },
      };
      movementRepository.createQueryBuilder
        .mockReturnValueOnce(createQueryBuilderMock([]))
        .mockReturnValueOnce(createQueryBuilderMock([movement]));

      await service.run();

      expect(actionItemsService.upsertOpen).not.toHaveBeenCalled();
    });
  });

  it('skips the run entirely when the advisory lock is not acquired', async () => {
    advisoryLockService.runWithLock.mockResolvedValueOnce({ acquired: false });

    await service.run();

    expect(movementRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
