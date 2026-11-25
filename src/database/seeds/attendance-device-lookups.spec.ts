import { DataSource } from 'typeorm';
import { SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { AccessOrganization } from '../../modules/access-control/access-organizations/entity/access-organization.entity';
import { AccessGroup } from '../../modules/access-control/access-groups/entity/access-group.entity';
import { AccessGroupDevice } from '../../modules/access-control/access-group-devices/entity/access-group-device.entity';
import AttendanceDevicesSeeder from './021-attendance-devices.seed';
import AccessGroupsSeeder from './023-access-groups.seed';

describe('attendance device seeder lookups', () => {
  const findDevice = jest.fn(async (options: { select?: { id: boolean } }) => {
    if (!options.select?.id || Object.keys(options.select).length !== 1) {
      throw new Error('Device lookup must not load encrypted credentials');
    }
    return { id: 42 };
  });

  beforeEach(() => findDevice.mockClear());

  function source(repositories: Map<unknown, unknown>) {
    const runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: { getRepository: (entity: unknown) => repositories.get(entity) },
    };
    return {
      dataSource: { createQueryRunner: () => runner } as unknown as DataSource,
      runner,
    };
  }

  it('leaves an existing device unchanged without loading its password', async () => {
    const save = jest.fn();
    const { dataSource, runner } = source(
      new Map<unknown, unknown>([
        [
          Company,
          { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Alliance' }) },
        ],
        [Branch, { find: jest.fn().mockResolvedValue([]) }],
        [AttendanceDevice, { findOne: findDevice, save }],
      ]),
    );
    await new AttendanceDevicesSeeder().run(
      dataSource,
      {} as SeederFactoryManager,
    );
    expect(findDevice).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(runner.commitTransaction).toHaveBeenCalled();
  });

  it('links an existing access group without loading the device password', async () => {
    const { dataSource, runner } = source(
      new Map<unknown, unknown>([
        [
          Company,
          { findOne: jest.fn().mockResolvedValue({ id: 1, name: 'Alliance' }) },
        ],
        [AttendanceDevice, { findOne: findDevice }],
        [
          AccessOrganization,
          { findOne: jest.fn().mockResolvedValue({ id: 2 }) },
        ],
        [AccessGroup, { findOne: jest.fn().mockResolvedValue({ id: 3 }) }],
        [
          AccessGroupDevice,
          { findOne: jest.fn().mockResolvedValue({ id: 4 }) },
        ],
      ]),
    );
    await new AccessGroupsSeeder().run(dataSource, {} as SeederFactoryManager);
    expect(findDevice).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).toHaveBeenCalled();
  });
});
