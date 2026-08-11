import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Position } from '../positions/entities/position.entity';
import { PositionAvailabilityService } from './position-availability.service';

describe('PositionAvailabilityService', () => {
  let service: PositionAvailabilityService;
  let findOne: jest.Mock;
  let count: jest.Mock;
  let createQueryBuilder: jest.Mock;

  beforeEach(async () => {
    findOne = jest.fn();
    count = jest.fn();
    createQueryBuilder = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionAvailabilityService,
        {
          provide: getRepositoryToken(DepartmentPosition),
          useValue: { findOne, count, createQueryBuilder },
        },
      ],
    }).compile();

    service = moduleRef.get(PositionAvailabilityService);
  });

  const makePosition = (overrides: Partial<Position> = {}): Position =>
    ({ id: 1, department_id: null, branch_id: null, ...overrides }) as Position;

  describe('isPositionAvailableForDepartment', () => {
    it('is available when the department matches the legacy department_id', async () => {
      const position = makePosition({ department_id: 10 });
      const result = await service.isPositionAvailableForDepartment(
        1,
        position,
        10,
      );
      expect(result).toBe(true);
      expect(findOne).not.toHaveBeenCalled();
    });

    it('is available via a pivot mapping even when department_id points elsewhere', async () => {
      const position = makePosition({ department_id: 10 });
      findOne.mockResolvedValue({
        company_id: 1,
        department_id: 20,
        position_id: 1,
      });

      const result = await service.isPositionAvailableForDepartment(
        1,
        position,
        20,
      );

      expect(result).toBe(true);
    });

    it('is unavailable when department_id is set to a different department and no mapping exists', async () => {
      const position = makePosition({ department_id: 10 });
      findOne.mockResolvedValue(null);

      const result = await service.isPositionAvailableForDepartment(
        1,
        position,
        20,
      );

      expect(result).toBe(false);
    });

    it('is available for any department when the position is fully unscoped', async () => {
      const position = makePosition();
      findOne.mockResolvedValue(null);
      count.mockResolvedValue(0);

      const result = await service.isPositionAvailableForDepartment(
        1,
        position,
        20,
      );

      expect(result).toBe(true);
    });

    it('is unavailable for an unmapped department when the position has other mappings', async () => {
      const position = makePosition();
      findOne.mockResolvedValue(null);
      count.mockResolvedValue(2);

      const result = await service.isPositionAvailableForDepartment(
        1,
        position,
        20,
      );

      expect(result).toBe(false);
    });
  });

  describe('isPositionAvailableForBranch', () => {
    const buildQueryBuilder = (result: unknown) => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
    });

    it('is available via a pivot mapping even when branch_id points elsewhere', async () => {
      const position = makePosition({ branch_id: 5 });
      createQueryBuilder.mockReturnValue(buildQueryBuilder({ id: 1 }));

      const result = await service.isPositionAvailableForBranch(1, position, 9);

      expect(result).toBe(true);
    });

    it('is unavailable when branch_id is set to a different branch and no mapping exists', async () => {
      const position = makePosition({ branch_id: 5 });
      createQueryBuilder.mockReturnValue(buildQueryBuilder(null));

      const result = await service.isPositionAvailableForBranch(1, position, 9);

      expect(result).toBe(false);
    });
  });
});
