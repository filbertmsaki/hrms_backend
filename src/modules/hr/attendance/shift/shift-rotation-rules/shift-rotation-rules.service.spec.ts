import { ObjectLiteral, Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { ShiftRotationRulesService } from './shift-rotation-rules.service';
import { ShiftRotationRule } from './entities/shift-rotation-rule.entity';
import { ShiftRotationGroup } from '../shift-rotation-groups/entities/shift-rotation-group.entity';
import { Shift } from '../shifts/entities/shift.entity';

type MockRepo<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T extends ObjectLiteral>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  remove: jest.fn(async (value) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
  getManyAndCount: jest.fn(),
});

describe('ShiftRotationRulesService', () => {
  let service: ShiftRotationRulesService;
  let rotationRuleRepository: MockRepo<ShiftRotationRule>;
  let rotationGroupRepository: MockRepo<ShiftRotationGroup>;
  let shiftRepository: MockRepo<Shift>;

  beforeEach(() => {
    rotationRuleRepository = createRepositoryMock();
    rotationGroupRepository = createRepositoryMock();
    shiftRepository = createRepositoryMock();

    service = new ShiftRotationRulesService(
      rotationRuleRepository as unknown as Repository<ShiftRotationRule>,
      rotationGroupRepository as unknown as Repository<ShiftRotationGroup>,
      shiftRepository as unknown as Repository<Shift>,
    );
  });

  it('maps day_index to dayIndex when listing rotation rules', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    rotationRuleRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.findAll(10, {
      page: 1,
      limit: 20,
      sortBy: 'day_index',
      sortOrder: SortDirection.ASC,
    });

    expect(qb.orderBy).toHaveBeenCalledWith('rule.dayIndex', 'ASC');
    expect(qb.getManyAndCount).toHaveBeenCalled();
  });
});
