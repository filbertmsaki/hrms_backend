import { Repository } from 'typeorm';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { ResolvedAttendanceSchedule } from './entities/resolved-attendance-schedule.type';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  remove: jest.fn(async (value) => value),
  createQueryBuilder: jest.fn(),
});

const createChain = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  getRawOne: jest.fn(),
  getOne: jest.fn(),
});

const buildSchedule = (
  overrides: Partial<ResolvedAttendanceSchedule> = {},
): ResolvedAttendanceSchedule => ({
  employeeId: 1,
  scheduleDate: '2026-06-12',
  source: 'shift_assignment',
  timezone: 'Africa/Dar_es_Salaam',
  shiftId: 10,
  timetableId: null,
  branchId: 2,
  isOffDay: false,
  isHoliday: false,
  holidayId: null,
  scheduleStartAt: new Date('2026-06-12T08:00:00Z'),
  scheduleEndAt: new Date('2026-06-12T17:00:00Z'),
  lateAfterMinutes: 0,
  halfDayAfterMinutes: 0,
  absentAfterMinutes: 0,
  graceInMinutes: 0,
  graceOutMinutes: 0,
  earlyLeaveAfterMinutes: 0,
  allowEarlyCheckin: false,
  allowLateCheckout: false,
  autoAbsentIfNoCheckin: true,
  allowOvertime: false,
  overtimeStartAfterMinutes: 0,
  maxOvertimeMinutes: 0,
  requiresCheckout: true,
  ignoreMissingCheckoutIfHoursValid: false,
  ...overrides,
});

describe('AttendanceDailySummaryService', () => {
  let service: AttendanceDailySummaryService;
  let processedEventRepository: MockRepo<AttendanceProcessedEvent>;
  let dailySummaryRepository: MockRepo<AttendanceDailySummary>;
  let mobilePunchRepository: MockRepo<AttendanceMobilePunch>;
  let leaveRequestRepository: MockRepo<LeaveRequest>;
  let businessTripRepository: MockRepo<AttendanceBusinessTrip>;
  let employeeRepository: MockRepo<Employee>;
  let employeeTimetableRepository: MockRepo<EmployeeTimetable>;
  let shiftAssignmentRepository: MockRepo<ShiftAssignment>;
  let shiftScheduleRepository: MockRepo<ShiftSchedule>;
  let scheduleResolver: { resolveForDate: jest.Mock };
  let timezoneBuilder: ReturnType<typeof createChain>;
  let leaveBuilder: ReturnType<typeof createChain>;
  let tripBuilder: ReturnType<typeof createChain>;

  beforeEach(() => {
    processedEventRepository = createRepositoryMock();
    dailySummaryRepository = createRepositoryMock();
    mobilePunchRepository = createRepositoryMock();
    leaveRequestRepository = createRepositoryMock();
    businessTripRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    employeeTimetableRepository = createRepositoryMock();
    shiftAssignmentRepository = createRepositoryMock();
    shiftScheduleRepository = createRepositoryMock();
    scheduleResolver = {
      resolveForDate: jest.fn(),
    };

    timezoneBuilder = createChain();
    leaveBuilder = createChain();
    tripBuilder = createChain();

    processedEventRepository.createQueryBuilder!.mockReturnValue(timezoneBuilder);
    leaveRequestRepository.createQueryBuilder!.mockReturnValue(leaveBuilder);
    businessTripRepository.createQueryBuilder!.mockReturnValue(tripBuilder);

    service = new AttendanceDailySummaryService(
      processedEventRepository as Repository<AttendanceProcessedEvent>,
      dailySummaryRepository as Repository<AttendanceDailySummary>,
      mobilePunchRepository as Repository<AttendanceMobilePunch>,
      leaveRequestRepository as Repository<LeaveRequest>,
      businessTripRepository as Repository<AttendanceBusinessTrip>,
      employeeRepository as Repository<Employee>,
      employeeTimetableRepository as Repository<EmployeeTimetable>,
      shiftAssignmentRepository as Repository<ShiftAssignment>,
      shiftScheduleRepository as Repository<ShiftSchedule>,
      scheduleResolver as unknown as AttendanceScheduleResolverService,
    );
  });

  it('persists absences for scheduled no-show days', async () => {
    employeeRepository.findOne!
      .mockResolvedValueOnce({ id: 1, exit_date: null })
      .mockResolvedValueOnce({ id: 1, primary_branch_id: null });
    processedEventRepository.find!.mockResolvedValue([]);
    mobilePunchRepository.find!.mockResolvedValue([]);
    dailySummaryRepository.findOne!.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(buildSchedule());

    const result = await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(result).toBe(true);
    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.ABSENT,
        attendanceDate: '2026-06-12',
      }),
    );
  });

  it('treats approved mobile punches as attendance events', async () => {
    employeeRepository.findOne!
      .mockResolvedValueOnce({ id: 1, exit_date: null })
      .mockResolvedValueOnce({ id: 1, primary_branch_id: null });
    processedEventRepository.find!.mockResolvedValue([]);
    mobilePunchRepository.find!.mockResolvedValue([
      {
        id: 44,
        punchTime: new Date('2026-06-12T08:05:00Z'),
      },
    ]);
    dailySummaryRepository.findOne!.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({ requiresCheckout: false }),
    );

    const result = await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(result).toBe(true);
    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.PRESENT,
        checkInAt: new Date('2026-06-12T08:05:00Z'),
      }),
    );
  });

  it('removes summaries after an employee exit date', async () => {
    employeeRepository.findOne!.mockResolvedValue({
      id: 1,
      exit_date: '2026-06-10',
    });
    dailySummaryRepository.findOne!.mockResolvedValue({
      id: 99,
      companyId: 10,
      employeeId: 1,
      attendanceDate: '2026-06-12',
    });

    const result = await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(result).toBe(false);
    expect(dailySummaryRepository.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99 }),
    );
    expect(processedEventRepository.find).not.toHaveBeenCalled();
  });
});
