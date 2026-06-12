import { ObjectLiteral, Repository } from 'typeorm';
import { TimetableAttendanceRulesService } from './timetable-attendance-rules.service';
import { TimetableAttendanceRule } from './entities/timetable-attendance-rule.entity';
import { Timetable } from '../timetables/entities/timetable.entity';
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

describe('TimetableAttendanceRulesService', () => {
  let service: TimetableAttendanceRulesService;
  let attendanceRuleRepository: MockRepo<TimetableAttendanceRule>;
  let timetableRepository: MockRepo<Timetable>;
  let generatedScheduleInvalidationService: { invalidate: jest.Mock };

  beforeEach(() => {
    attendanceRuleRepository = createRepositoryMock();
    timetableRepository = createRepositoryMock();
    generatedScheduleInvalidationService = {
      invalidate: jest.fn(),
    };

    service = new TimetableAttendanceRulesService(
      attendanceRuleRepository as unknown as Repository<TimetableAttendanceRule>,
      timetableRepository as unknown as Repository<Timetable>,
      generatedScheduleInvalidationService as unknown as TimetableGeneratedScheduleInvalidationService,
    );
  });

  it('maps created_at to createdAt when listing attendance rules', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    attendanceRuleRepository.createQueryBuilder!.mockReturnValue(qb);

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
