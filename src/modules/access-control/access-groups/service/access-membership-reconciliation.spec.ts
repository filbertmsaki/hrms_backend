import { AccessGroupsService } from './access-groups.service';
import { AccessGroup } from '../entity/access-group.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupDevice } from '../../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AttendanceDevice } from '../../attendance-devices/entities/attendance-device.entity';
import { AccessReconciliationOperation } from '../entity/access-reconciliation-operation.entity';

function setup(failOperation: boolean) {
  const remove = jest.fn().mockResolvedValue(undefined);
  const operationSave = failOperation
    ? jest.fn().mockRejectedValue(new Error('database unavailable'))
    : jest.fn().mockResolvedValue(undefined);
  const repositories = new Map<unknown, unknown>([
    [
      AccessGroup,
      { findOne: jest.fn().mockResolvedValue({ id: 4, companyId: 1 }) },
    ],
    [
      AccessGroupEmployee,
      { find: jest.fn().mockResolvedValue([{ id: 9 }]), remove },
    ],
    [
      AccessGroupDevice,
      { find: jest.fn().mockResolvedValue([{ deviceId: 3 }]) },
    ],
    [AccessGroupDoor, { find: jest.fn().mockResolvedValue([{ deviceId: 3 }]) }],
    [AttendanceDevice, { find: jest.fn().mockResolvedValue([{ id: 3 }]) }],
    [
      AccessReconciliationOperation,
      { create: jest.fn((value: unknown) => value), save: operationSave },
    ],
  ]);
  const manager = {
    getRepository: jest.fn((type: unknown) => repositories.get(type)),
  };
  const groupRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 4, companyId: 1 }),
    manager: {
      transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(manager),
      ),
    },
  };
  const service = Object.assign(Object.create(AccessGroupsService.prototype), {
    groupRepository,
  }) as AccessGroupsService;
  return { service, remove, operationSave };
}

describe('group membership reconciliation records', () => {
  it('records one pending operation per distinct device before removing membership', async () => {
    const { service, remove, operationSave } = setup(false);
    const result = await service.removeEmployee(1, 4, 8, 12);
    expect(operationSave).toHaveBeenCalledWith([
      expect.objectContaining({
        companyId: 1,
        employeeId: 8,
        deviceId: 3,
        sourceGroupId: 4,
        requestedByCompanyUserId: 12,
        status: 'PENDING_REVIEW',
      }),
    ]);
    expect(result.reconciliation_operations_created).toBe(1);
    expect(operationSave.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
  });
  it('does not remove membership when operation recording fails', async () => {
    const { service, remove } = setup(true);
    await expect(service.removeEmployee(1, 4, 8)).rejects.toThrow(
      'database unavailable',
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
