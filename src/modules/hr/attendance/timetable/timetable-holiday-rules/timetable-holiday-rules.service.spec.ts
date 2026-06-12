import { ObjectLiteral, Repository } from 'typeorm';
import { TimetableHolidayRulesService } from './timetable-holiday-rules.service';
import { TimetableHolidayRule } from './entities/timetable-holiday-rule.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { HolidayGroup } from '../../holidays/entities/holiday-group.entity';
import { TimetableGeneratedScheduleInvalidationService } from '../timetable-generated-schedules/timetable-generated-schedule-invalidation.service';
import { SortDirection } from '../../../../../common/dto/pagination.dto';

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

describe('TimetableHolidayRulesService', () => {
  let service: TimetableHolidayRulesService;
  let holidayRuleRepository: MockRepo<TimetableHolidayRule>;
  let timetableRepository: MockRepo<Timetable>;
  let holidayGroupRepository: MockRepo<HolidayGroup>;
  let generatedScheduleInvalidationService: { invalidate: jest.Mock };

  beforeEach(() => {
    holidayRuleRepository = createRepositoryMock();
    timetableRepository = createRepositoryMock();
    holidayGroupRepository = createRepositoryMock();
    generatedScheduleInvalidationService = {
      invalidate: jest.fn(),
    };

    service = new TimetableHolidayRulesService(
      holidayRuleRepository as unknown as Repository<TimetableHolidayRule>,
      timetableRepository as unknown as Repository<Timetable>,
      holidayGroupRepository as unknown as Repository<HolidayGroup>,
      generatedScheduleInvalidationService as unknown as TimetableGeneratedScheduleInvalidationService,
    );
  });

  it('maps created_at to createdAt when listing rules', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    holidayRuleRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.findAll(10, {
      page: 1,
      limit: 20,
      sortBy: 'created_at',
      sortOrder: SortDirection.DESC,
    });

    expect(qb.orderBy).toHaveBeenCalledWith('rule.createdAt', 'DESC');
    expect(qb.getManyAndCount).toHaveBeenCalled();
  });
});
