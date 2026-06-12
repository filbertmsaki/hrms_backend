import { ObjectLiteral, Repository } from 'typeorm';
import { TimetableDaysService } from './timetable-days.service';
import { TimetableDay } from './entities/timetable-day.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
import { Shift } from '../../shift/shifts/entities/shift.entity';
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

describe('TimetableDaysService', () => {
  let service: TimetableDaysService;
  let timetableDayRepository: MockRepo<TimetableDay>;
  let timetableRepository: MockRepo<Timetable>;
  let shiftRepository: MockRepo<Shift>;
  let generatedScheduleInvalidationService: { invalidate: jest.Mock };

  beforeEach(() => {
    timetableDayRepository = createRepositoryMock();
    timetableRepository = createRepositoryMock();
    shiftRepository = createRepositoryMock();
    generatedScheduleInvalidationService = {
      invalidate: jest.fn(),
    };

    service = new TimetableDaysService(
      timetableDayRepository as unknown as Repository<TimetableDay>,
      timetableRepository as unknown as Repository<Timetable>,
      shiftRepository as unknown as Repository<Shift>,
      generatedScheduleInvalidationService as unknown as TimetableGeneratedScheduleInvalidationService,
    );
  });

  it('maps day_of_week to dayOfWeek when listing timetable days', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    timetableDayRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.findAll(10, {
      page: 1,
      limit: 20,
      sortBy: 'day_of_week',
      sortOrder: SortDirection.ASC,
    });

    expect(qb.orderBy).toHaveBeenCalledWith('day.dayOfWeek', 'ASC');
    expect(qb.getManyAndCount).toHaveBeenCalled();
  });
});
