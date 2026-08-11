import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CodeGeneratorService } from '../shared/code-generator.service';
import { HrAccessService } from '../shared/hr-access.service';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { Position } from './entities/position.entity';
import { PositionsService } from './positions.service';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
  remove: jest.fn(),
});

describe('PositionsService', () => {
  let service: PositionsService;
  let positionRepository: MockRepo;
  let departmentPositionRepository: MockRepo;
  let employeeRepository: MockRepo;
  const companyId = 1;
  const actor = { companyId } as never;

  beforeEach(async () => {
    positionRepository = createRepositoryMock();
    departmentPositionRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: getRepositoryToken(Position), useValue: positionRepository },
        {
          provide: getRepositoryToken(Branch),
          useValue: createRepositoryMock(),
        },
        {
          provide: getRepositoryToken(Department),
          useValue: createRepositoryMock(),
        },
        {
          provide: getRepositoryToken(DepartmentPosition),
          useValue: departmentPositionRepository,
        },
        { provide: getRepositoryToken(Employee), useValue: employeeRepository },
        {
          provide: HrAccessService,
          useValue: { assertCanAccessBranch: jest.fn() },
        },
        { provide: CodeGeneratorService, useValue: {} },
        {
          provide: PositionAvailabilityService,
          useValue: {
            positionHasMappings: jest.fn(),
            positionHasAccessibleMappings: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PositionsService);
  });

  describe('remove', () => {
    it('blocks deletion when employees are currently assigned to the position', async () => {
      positionRepository.findOne.mockResolvedValue({
        id: 5,
        company_id: companyId,
        branch_id: null,
      });
      employeeRepository.count.mockResolvedValue(3);

      await expect(service.remove(companyId, 5, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(positionRepository.remove).not.toHaveBeenCalled();
    });

    it('blocks deletion when the position is still mapped to departments', async () => {
      positionRepository.findOne.mockResolvedValue({
        id: 5,
        company_id: companyId,
        branch_id: null,
      });
      employeeRepository.count.mockResolvedValue(0);
      departmentPositionRepository.count.mockResolvedValue(2);

      await expect(service.remove(companyId, 5, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(positionRepository.remove).not.toHaveBeenCalled();
    });

    it('deletes the position when unused and unmapped', async () => {
      const position = { id: 5, company_id: companyId, branch_id: null };
      positionRepository.findOne.mockResolvedValue(position);
      employeeRepository.count.mockResolvedValue(0);
      departmentPositionRepository.count.mockResolvedValue(0);

      const result = await service.remove(companyId, 5, actor);

      expect(positionRepository.remove).toHaveBeenCalledWith(position);
      expect(result).toEqual({ message: 'Position deleted successfully' });
    });
  });
});
