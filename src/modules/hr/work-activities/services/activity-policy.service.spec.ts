import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityPolicyService } from './activity-policy.service';
import { ActivityCategory } from '../entities/activity-config.entities';

describe('ActivityPolicyService category applicability', () => {
  const categoryRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => value),
  };
  const departmentRepository = { findOne: jest.fn() };
  const positionRepository = { findOne: jest.fn() };
  const gradeRepository = { findOne: jest.fn() };
  const hrAccessService = { ensureActorCompanyId: jest.fn(() => 41) };
  const service = new ActivityPolicyService(
    { get: jest.fn() } as never,
    hrAccessService as never,
    categoryRepository as never,
    {} as never,
    departmentRepository as never,
    positionRepository as never,
    gradeRepository as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('only offers active categories whose configured scopes match the employee', async () => {
    categoryRepository.find.mockResolvedValue([
      {
        id: 1,
        companyId: 41,
        status: 'ACTIVE',
        departmentId: null,
        positionId: null,
        gradeId: null,
      },
      {
        id: 2,
        companyId: 41,
        status: 'ACTIVE',
        departmentId: 7,
        positionId: null,
        gradeId: null,
      },
      {
        id: 3,
        companyId: 41,
        status: 'ACTIVE',
        departmentId: 8,
        positionId: null,
        gradeId: null,
      },
      {
        id: 4,
        companyId: 41,
        status: 'INACTIVE',
        departmentId: null,
        positionId: null,
        gradeId: null,
      },
      {
        id: 5,
        companyId: 41,
        status: 'ACTIVE',
        departmentId: null,
        positionId: 3,
        gradeId: 2,
      },
      {
        id: 6,
        companyId: 41,
        status: 'ACTIVE',
        departmentId: null,
        positionId: 4,
        gradeId: null,
      },
      {
        id: 7,
        companyId: 41,
        status: 'ACTIVE',
        departmentId: null,
        positionId: null,
        gradeId: 5,
      },
    ]);

    const rows = await service.listSelectableCategories(41, {
      primary_department_id: 7,
      primary_position_id: 3,
      grade_id: 2,
    } as never);

    expect(rows.map((row) => row.id)).toEqual([1, 2, 5]);
    expect(categoryRepository.find).toHaveBeenCalledWith({
      where: { companyId: 41, status: 'ACTIVE' },
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  });

  it('does not resolve a category belonging to another company', async () => {
    categoryRepository.findOne.mockResolvedValue(null);
    await expect(
      service.getCategoryForEmployeeOrFail(41, 12, {
        primary_department_id: 7,
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(categoryRepository.findOne).toHaveBeenCalledWith({
      where: { id: 12, companyId: 41 },
    });
  });

  it('rejects a category whose scope does not match the employee', async () => {
    categoryRepository.findOne.mockResolvedValue({
      id: 12,
      companyId: 41,
      status: 'ACTIVE',
      departmentId: 8,
      positionId: null,
      gradeId: null,
    } as ActivityCategory);
    await expect(
      service.getCategoryForEmployeeOrFail(41, 12, {
        primary_department_id: 7,
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a category scope reference from another company', async () => {
    departmentRepository.findOne.mockResolvedValue(null);
    await expect(
      service.createCategory({ companyId: 41 } as never, {
        code: 'SCOPED',
        name: 'Scoped',
        department_id: 999,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(departmentRepository.findOne).toHaveBeenCalledWith({
      where: { id: 999, company_id: 41 },
    });
    expect(categoryRepository.save).not.toHaveBeenCalled();
  });

  it('keeps canonical category codes stable', async () => {
    categoryRepository.findOne.mockResolvedValue({
      id: 15,
      companyId: 41,
      code: 'SALES_VISIT',
      name: 'Sales visit',
      departmentId: null,
      positionId: null,
      gradeId: null,
    });

    await expect(
      service.updateCategory({ companyId: 41 } as never, 15, {
        code: 'RENAMED_SALES',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(categoryRepository.save).not.toHaveBeenCalled();
  });
});
