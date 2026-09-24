import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { AttendanceHoliday } from '../../holidays/entities/holiday.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftSchedule } from './entities/shift-schedule.entity';
import { ShiftSchedulesService } from './shift-schedules.service';

type MockRepo<T extends ObjectLiteral> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createRepositoryMock = <T extends ObjectLiteral>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn((value: unknown) => value),
  create: jest.fn((value: unknown) => value),
  remove: jest.fn((value: unknown) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

describe('ShiftSchedulesService date restrictions', () => {
  let service: ShiftSchedulesService;
  let scheduleRepository: MockRepo<ShiftSchedule>;
  let shiftRepository: MockRepo<Shift>;
  let employeeRepository: MockRepo<Employee>;
  let holidayRepository: MockRepo<AttendanceHoliday>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-24T08:00:00.000Z'));
    process.env.APP_TIMEZONE = 'Africa/Dar_es_Salaam';

    scheduleRepository = createRepositoryMock();
    shiftRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    holidayRepository = createRepositoryMock();

    service = new ShiftSchedulesService(
      scheduleRepository as unknown as Repository<ShiftSchedule>,
      shiftRepository as unknown as Repository<Shift>,
      employeeRepository as unknown as Repository<Employee>,
      holidayRepository as unknown as Repository<AttendanceHoliday>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.APP_TIMEZONE;
  });

  it('rejects a new schedule for a previous day', async () => {
    await expect(
      service.create(10, {
        employee_id: 7,
        schedule_date: '2026-09-23',
        is_off_day: true,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(employeeRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('allows a new schedule for the current day', async () => {
    const employeeBuilder = createQueryBuilderMock();
    const overlapBuilder = createQueryBuilderMock();
    employeeBuilder.getOne.mockResolvedValue({ id: 7 });
    overlapBuilder.getOne.mockResolvedValue(null);
    employeeRepository.createQueryBuilder!.mockReturnValue(employeeBuilder);
    scheduleRepository.createQueryBuilder!.mockReturnValue(overlapBuilder);

    await expect(
      service.create(10, {
        employee_id: 7,
        schedule_date: '2026-09-24',
        is_off_day: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        employeeId: 7,
        scheduleDate: '2026-09-24',
        isOffDay: true,
      }),
    );
  });

  it('does not remove a schedule once its day has been reached', async () => {
    scheduleRepository.findOne!.mockResolvedValue({
      id: 3,
      companyId: 10,
      scheduleDate: '2026-09-24',
      effectiveFrom: '2026-09-24',
    });

    await expect(service.remove(10, 3)).rejects.toThrow(BadRequestException);
    expect(scheduleRepository.remove).not.toHaveBeenCalled();
  });

  it('removes a future schedule that has not started', async () => {
    const schedule = {
      id: 4,
      companyId: 10,
      scheduleDate: '2026-09-25',
      effectiveFrom: '2026-09-25',
    };
    scheduleRepository.findOne!.mockResolvedValue(schedule);

    await expect(service.remove(10, 4)).resolves.toEqual({
      message: 'Shift schedule deleted successfully',
    });
    expect(scheduleRepository.remove).toHaveBeenCalledWith(schedule);
  });
});
