import { AccessOrganizationsService } from './access-organizations.service';
import { AccessOrganizationEmployee } from '../../access-organization-employees/entity/access-organization-employee.entity';
import { AccessGroupEmployee } from '../../access-group-employees/entity/access-group-employee.entity';
import { AccessGroupDevice } from '../../access-group-devices/entity/access-group-device.entity';
import { AccessGroupDoor } from '../../access-group-doors/entity/access-group-door.entity';

function setup(fail = false) {
  const remove = jest.fn().mockResolvedValue(undefined);
  const execute = jest.fn().mockResolvedValue({ affected: 1 });
  const builder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([{ accessGroupId: 4 }]),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    execute,
    getCount: jest.fn().mockResolvedValue(0),
  };
  const memberRepo = { createQueryBuilder: jest.fn(() => builder) };
  const orgRepo = { findOne: jest.fn().mockResolvedValue({ id: 9 }), remove };
  const query = fail
    ? jest.fn().mockRejectedValue(new Error('record failed'))
    : jest.fn().mockResolvedValue([]);
  const repos = new Map<unknown, unknown>([
    [AccessOrganizationEmployee, orgRepo],
    [AccessGroupEmployee, memberRepo],
    [
      AccessGroupDevice,
      { find: jest.fn().mockResolvedValue([{ deviceId: 3 }]) },
    ],
    [AccessGroupDoor, { find: jest.fn().mockResolvedValue([]) }],
  ]);
  const manager = {
    getRepository: jest.fn((entity: unknown) => repos.get(entity)),
    query,
  };
  const service = Object.assign(
    Object.create(AccessOrganizationsService.prototype),
    {
      findOrFail: jest.fn().mockResolvedValue({ id: 2 }),
      organizationEmployeeRepository: {
        manager: {
          transaction: jest.fn((fn: (arg: unknown) => unknown) => fn(manager)),
        },
      },
      accessGroupEmployeeRepository: memberRepo,
      employeeStillHasGroupAccessOnDevice: jest.fn().mockResolvedValue(true),
    },
  ) as AccessOrganizationsService;
  return { service, query, remove, execute };
}

describe('organization removal reconciliation', () => {
  it('records affected groups and devices before membership deletion', async () => {
    const { service, query, remove, execute } = setup();
    await service.removeEmployee(1, 2, 8, 12);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO access_reconciliation_operations'),
      [1, 2, 8, 12],
    );
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
  });
  it('does not remove membership if recording fails', async () => {
    const { service, remove, execute } = setup(true);
    await expect(service.removeEmployee(1, 2, 8)).rejects.toThrow(
      'record failed',
    );
    expect(remove).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
