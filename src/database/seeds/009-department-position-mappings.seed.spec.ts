import { DataSource } from 'typeorm';
import DepartmentPositionMappingsSeeder from './009-department-position-mappings.seed';
import { Company } from '../../modules/companies/entities/company.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { DepartmentPosition } from '../../modules/hr/departments/entities/department-position.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import {
  ALLIANCE_DEPARTMENTS,
  ALLIANCE_POSITIONS,
} from './company-structure.constants';

type MockRepository = {
  findOne: jest.Mock;
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
};

function createRepositoryMock(): MockRepository {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value: unknown) => value),
  };
}

describe('DepartmentPositionMappingsSeeder', () => {
  let seeder: DepartmentPositionMappingsSeeder;
  let companyRepository: MockRepository;
  let departmentRepository: MockRepository;
  let positionRepository: MockRepository;
  let departmentPositionRepository: MockRepository;
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      getRepository: jest.Mock;
    };
  };

  beforeEach(() => {
    seeder = new DepartmentPositionMappingsSeeder();
    companyRepository = createRepositoryMock();
    departmentRepository = createRepositoryMock();
    positionRepository = createRepositoryMock();
    departmentPositionRepository = createRepositoryMock();

    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === Company) {
            return companyRepository;
          }
          if (entity === Department) {
            return departmentRepository;
          }
          if (entity === Position) {
            return positionRepository;
          }
          if (entity === DepartmentPosition) {
            return departmentPositionRepository;
          }
          throw new Error('Unexpected repository request');
        }),
      },
    };
  });

  it('adds missing standard position mappings for active departments', async () => {
    const company = {
      id: 1,
      name: 'Alliance Insurance Corporation Limited',
    };
    const departments = ALLIANCE_DEPARTMENTS.map((department, index) => ({
      id: index + 1,
      company_id: 1,
      code: department.code,
      name: department.name,
      status: 'active',
    }));
    const positions = ALLIANCE_POSITIONS.map((position, index) => ({
      id: index + 1,
      company_id: 1,
      code: position.code,
      name: position.name,
      status: 'active',
      is_active: true,
    }));

    companyRepository.findOne.mockResolvedValue(company);
    departmentRepository.find.mockResolvedValue(departments);
    positionRepository.find.mockResolvedValue(positions);
    departmentPositionRepository.find.mockResolvedValue([
      {
        company_id: 1,
        department_id: departments[0].id,
        position_id: positions.find((position) => position.code === 'MANAGER')!
          .id,
      },
    ]);
    departmentPositionRepository.save.mockImplementation((value: unknown) =>
      Promise.resolve(value),
    );

    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await seeder.run(
      {
        createQueryRunner: jest.fn(() => queryRunner),
      } as unknown as DataSource,
      {} as never,
    );

    const createdMappings = departmentPositionRepository.create.mock.calls.map(
      ([value]) => value as Record<string, number>,
    );
    const managerPositionId = positions.find(
      (position) => position.code === 'MANAGER',
    )!.id;
    const seniorManagerPositionId = positions.find(
      (position) => position.code === 'SENIOR_MANAGER',
    )!.id;
    const deputyManagerPositionId = positions.find(
      (position) => position.code === 'DEPUTY_MANAGER',
    )!.id;
    const claimsDepartmentId = departments.find(
      (department) => department.code === 'ARU_CLAIMS',
    )!.id;
    const accountsDepartmentId = departments.find(
      (department) => department.code === 'ARU_ACCOUNTS_FINANCE',
    )!.id;

    expect(createdMappings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          company_id: 1,
          department_id: claimsDepartmentId,
          position_id: seniorManagerPositionId,
        }),
        expect.objectContaining({
          company_id: 1,
          department_id: claimsDepartmentId,
          position_id: deputyManagerPositionId,
        }),
        expect.objectContaining({
          company_id: 1,
          department_id: accountsDepartmentId,
          position_id: seniorManagerPositionId,
        }),
      ]),
    );
    expect(createdMappings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          company_id: 1,
          department_id: departments[0].id,
          position_id: managerPositionId,
        }),
      ]),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('logs missing positions and continues processing remaining mappings', async () => {
    const company = {
      id: 1,
      name: 'Alliance Insurance Corporation Limited',
    };
    const departments = ALLIANCE_DEPARTMENTS.map((department, index) => ({
      id: index + 1,
      company_id: 1,
      code: department.code,
      name: department.name,
      status: 'active',
    }));
    const positions = ALLIANCE_POSITIONS.filter(
      (position) => position.code !== 'SENIOR_MANAGER',
    ).map((position, index) => ({
      id: index + 1,
      company_id: 1,
      code: position.code,
      name: position.name,
      status: 'active',
      is_active: true,
    }));

    companyRepository.findOne.mockResolvedValue(company);
    departmentRepository.find.mockResolvedValue(departments);
    positionRepository.find.mockResolvedValue(positions);
    departmentPositionRepository.find.mockResolvedValue([]);
    departmentPositionRepository.save.mockImplementation((value: unknown) =>
      Promise.resolve(value),
    );

    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await expect(
      seeder.run(
        {
          createQueryRunner: jest.fn(() => queryRunner),
        } as unknown as DataSource,
        {} as never,
      ),
    ).resolves.toBeUndefined();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing required existing positions'),
    );
    expect(departmentPositionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        department_id: departments.find(
          (department) => department.code === 'ARU_CLAIMS',
        )!.id,
        position_id: positions.find((position) => position.code === 'MANAGER')!
          .id,
      }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
