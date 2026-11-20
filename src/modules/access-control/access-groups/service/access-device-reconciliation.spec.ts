import { AccessGroupsService } from './access-groups.service';
import { AccessGroup } from '../entity/access-group.entity';
import { AccessGroupDevice } from '../../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessReconciliationOperation } from '../entity/access-reconciliation-operation.entity';

function setup(fail = false) {
  const remove = jest.fn().mockResolvedValue(undefined);
  const save = fail
    ? jest.fn().mockRejectedValue(new Error('recording failed'))
    : jest.fn().mockResolvedValue(undefined);
  const links = {
    findOne: jest.fn().mockResolvedValue({ accessGroupId: 4, deviceId: 3 }),
    create: jest.fn((value: unknown) => value),
    save: jest.fn().mockResolvedValue(undefined),
    remove,
    find: jest.fn().mockResolvedValue([{ deviceId: 3 }]),
  };
  const repos = new Map<unknown, unknown>([
    [
      AccessGroup,
      {
        findOne: jest.fn().mockResolvedValue({ id: 4, companyId: 1 }),
        remove: jest.fn().mockResolvedValue(undefined),
      },
    ],
    [AccessGroupDevice, links],
    [
      AccessGroupDoor,
      {
        count: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue([{ deviceId: 3 }, { deviceId: 3 }]),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((value: unknown) => value),
        save: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      },
    ],
    [
      AccessGroupEmployee,
      {
        find: jest
          .fn()
          .mockResolvedValue([{ employeeId: 8 }, { employeeId: 8 }]),
      },
    ],
    [
      AccessReconciliationOperation,
      { create: jest.fn((value: unknown) => value), save },
    ],
  ]);
  const manager = {
    getRepository: jest.fn((type: unknown) => repos.get(type)),
  };
  const service = Object.assign(Object.create(AccessGroupsService.prototype), {
    groupRepository: {
      findOne: jest.fn().mockResolvedValue({ id: 4, companyId: 1 }),
      manager: {
        transaction: jest.fn((callback: (arg: unknown) => unknown) =>
          callback(manager),
        ),
      },
    },
    attendanceDeviceRepository: {
      find: jest.fn().mockResolvedValue([{ id: 3 }]),
      findOne: jest.fn().mockResolvedValue({ id: 3 }),
    },
    accessDoorRepository: {
      find: jest.fn().mockResolvedValue([{ id: 22 }]),
      findOne: jest.fn().mockResolvedValue({ id: 22, deviceId: 3, doorNo: 1 }),
    },
    scheduleTemplateRepository: {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 9, deviceId: 3, hikvisionTemplateNo: '1' }),
    },
  }) as AccessGroupsService;
  return {
    service,
    save,
    remove,
    links,
    memberRepo: repos.get(AccessGroupEmployee) as { find: jest.Mock },
  };
}

describe('group device reconciliation', () => {
  it('records affected employees when a device is assigned', async () => {
    const { service, save, links } = setup();
    links.findOne.mockResolvedValueOnce(null);
    const result = await service.assignDevices(1, 4, { device_ids: [3, 3] });
    expect(result.created).toBe(1);
    expect(result.reconciliation_operations_created).toBe(1);
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        employeeId: 8,
        deviceId: 3,
        reason: 'DEVICE_ADDED',
      }),
    ]);
  });

  it('does not record a repeated device assignment', async () => {
    const { service, save, links } = setup();
    const result = await service.assignDevices(1, 4, { device_ids: [3] });
    expect(result.created).toBe(0);
    expect(result.reconciliation_operations_created).toBe(0);
    expect(links.save).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('retains the device employee number when no HR employee is linked', async () => {
    const { service, save, memberRepo } = setup();
    memberRepo.find.mockResolvedValueOnce([
      { employeeId: null, employeeNo: 'device-77' },
    ]);
    await service.removeDevice(1, 4, 3);
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        employeeId: null,
        unresolvedEmployeeNo: 'device-77',
        deviceId: 3,
      }),
    ]);
  });

  it('records each affected employee before removing a device', async () => {
    const { service, save, remove } = setup();
    const result = await service.removeDevice(1, 4, 3, 12);
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        companyId: 1,
        employeeId: 8,
        deviceId: 3,
        sourceGroupId: 4,
        requestedByCompanyUserId: 12,
        reason: 'DEVICE_REMOVED',
        status: 'PENDING_REVIEW',
      }),
    ]);
    expect(result.reconciliation_operations_created).toBe(1);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
  });

  it('does not remove a device when recording fails', async () => {
    const { service, remove } = setup(true);
    await expect(service.removeDevice(1, 4, 3)).rejects.toThrow(
      'recording failed',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('records affected users once per device before a door is removed', async () => {
    const { service, save } = setup();
    const result = await service.removeDoor(1, 4, 22, 12);
    expect(result.reconciliation_operations_created).toBe(1);
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        employeeId: 8,
        deviceId: 3,
        reason: 'DOOR_CHANGED',
        requestedByCompanyUserId: 12,
      }),
    ]);
  });

  it('records affected users when a door is assigned', async () => {
    const { service, save } = setup();
    const result = await service.assignDoors(
      1,
      4,
      { items: [{ door_id: 22, schedule_template_id: 9 }] },
      12,
    );
    expect(result.created).toBe(1);
    expect(result.reconciliation_operations_created).toBe(1);
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        employeeId: 8,
        deviceId: 3,
        reason: 'DOOR_CHANGED',
        requestedByCompanyUserId: 12,
      }),
    ]);
  });

  it('records affected users before a group is deleted', async () => {
    const { service, save } = setup();
    await service.remove(1, 4, 12);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        employeeId: 8,
        deviceId: 3,
        reason: 'GROUP_REMOVED',
        requestedByCompanyUserId: 12,
      }),
    ]);
  });
});
