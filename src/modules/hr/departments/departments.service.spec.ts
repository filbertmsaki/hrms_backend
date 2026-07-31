import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Position } from '../positions/entities/position.entity';
import { CodeGeneratorService } from '../shared/code-generator.service';
import { HrAccessService } from '../shared/hr-access.service';
import { DepartmentsService } from './departments.service';
import { Department } from './entities/department.entity';
import { DepartmentPosition } from './entities/department-position.entity';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
  remove: jest.fn(),
});

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  let departmentRepository: MockRepo;
  let departmentPositionRepository: MockRepo;
  let positionRepository: MockRepo;
  let employeeRepository: MockRepo;
  const companyId = 1;
  const actor = { companyId } as never;

  beforeEach(async () => {
    departmentRepository = createRepositoryMock();
    departmentPositionRepository = createRepositoryMock();
    positionRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        {
          provide: getRepositoryToken(Department),
          useValue: departmentRepository,
        },
        {
          provide: getRepositoryToken(Branch),
          useValue: createRepositoryMock(),
        },
        {
          provide: getRepositoryToken(DepartmentPosition),
          useValue: departmentPositionRepository,
        },
        { provide: getRepositoryToken(Position), useValue: positionRepository },
        { provide: getRepositoryToken(Employee), useValue: employeeRepository },
        {
          provide: HrAccessService,
          useValue: { assertCanAccessBranch: jest.fn() },
        },
        {
          provide: CodeGeneratorService,
          useValue: {
            resolveCode: jest.fn().mockResolvedValue('DEP-0001'),
            validateCodeUnique: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DepartmentsService);
  });

  describe('remove', () => {
    it('blocks deletion when employees are currently assigned to the department', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 7,
        company_id: companyId,
        branch_id: null,
      });
      employeeRepository.count.mockResolvedValue(4);

      await expect(service.remove(companyId, 7, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(departmentRepository.remove).not.toHaveBeenCalled();
    });

    it('blocks deletion when the department has child departments', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 7,
        company_id: companyId,
        branch_id: null,
      });
      employeeRepository.count.mockResolvedValue(0);
      departmentRepository.count.mockResolvedValue(1);

      await expect(service.remove(companyId, 7, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(departmentRepository.remove).not.toHaveBeenCalled();
    });

    it('deletes the department when unused and childless', async () => {
      const department = { id: 7, company_id: companyId, branch_id: null };
      departmentRepository.findOne.mockResolvedValue(department);
      employeeRepository.count.mockResolvedValue(0);
      departmentRepository.count.mockResolvedValue(0);

      const result = await service.remove(companyId, 7, actor);

      expect(departmentRepository.remove).toHaveBeenCalledWith(department);
      expect(result).toEqual({ message: 'Department deleted successfully' });
    });
  });

  describe('removePosition', () => {
    it('blocks removal when employees use this department-position combination', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 7,
        company_id: companyId,
        branch_id: null,
      });
      departmentPositionRepository.findOne.mockResolvedValue({
        id: 1,
        company_id: companyId,
        department_id: 7,
        position_id: 3,
      });
      employeeRepository.count.mockResolvedValue(2);

      await expect(
        service.removePosition(companyId, 7, 3, actor),
      ).rejects.toThrow(BadRequestException);
      expect(departmentPositionRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('create with position_ids', () => {
    it('creates the department and assigns the requested existing positions', async () => {
      positionRepository.find.mockResolvedValue([
        { id: 3, company_id: companyId, is_active: true, status: 'active' },
        { id: 4, company_id: companyId, is_active: true, status: 'active' },
      ]);
      departmentPositionRepository.find.mockResolvedValue([]);
      const savedDepartment = { id: 7, company_id: companyId, branch_id: null };
      departmentRepository.save.mockResolvedValue(savedDepartment);
      departmentRepository.findOne.mockResolvedValue(savedDepartment);

      await service.create(
        companyId,
        { name: 'Claims', position_ids: [3, 4] } as never,
        actor,
      );

      expect(departmentPositionRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({ department_id: 7, position_id: 3 }),
        expect.objectContaining({ department_id: 7, position_id: 4 }),
      ]);
    });

    it('rejects creation when a requested position is inactive', async () => {
      positionRepository.find.mockResolvedValue([
        {
          id: 3,
          company_id: companyId,
          is_active: false,
          status: 'inactive',
          name: 'Old Role',
        },
      ]);

      await expect(
        service.create(
          companyId,
          { name: 'Claims', position_ids: [3] } as never,
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(departmentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('update with position_ids', () => {
    it('blocks unassigning a position still used by employees', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 7,
        company_id: companyId,
        branch_id: null,
      });
      positionRepository.find.mockResolvedValue([]);
      departmentPositionRepository.find.mockResolvedValue([
        { company_id: companyId, department_id: 7, position_id: 3 },
      ]);
      employeeRepository.count.mockResolvedValue(1);

      await expect(
        service.update(companyId, 7, { position_ids: [] } as never, actor),
      ).rejects.toThrow(BadRequestException);
      expect(departmentPositionRepository.remove).not.toHaveBeenCalled();
    });

    it('leaves assignments untouched when position_ids is omitted', async () => {
      departmentRepository.findOne.mockResolvedValue({
        id: 7,
        company_id: companyId,
        branch_id: null,
      });
      const saved = { id: 7, company_id: companyId, branch_id: null };
      departmentRepository.save.mockResolvedValue(saved);

      await service.update(companyId, 7, { name: 'Claims' } as never, actor);

      expect(positionRepository.find).not.toHaveBeenCalled();
      expect(departmentPositionRepository.find).not.toHaveBeenCalled();
    });
  });
});
