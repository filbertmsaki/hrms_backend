import { EntityManager, Repository } from 'typeorm';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveType } from '../../leave/entities/leave-type.entity';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftBreak } from '../shift/shift-breaks/entities/shift-break.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { AttendanceDailySummaryAdjustment } from './entities/attendance-daily-summary-adjustment.entity';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { ResolvedAttendanceSchedule } from './entities/resolved-attendance-schedule.type';
import { AttendanceDailyRemarkEnum } from './enums/attendance-daily-remark.enum';
import { AttendanceRoundingModeEnum } from '../policies/enums/attendance-rounding-mode.enum';
import { AttendanceHolidayPolicyModeEnum } from '../policies/enums/attendance-holiday-policy-mode.enum';
import { LeaveBalanceService } from '../../leave/services/leave-balance.service';
import { HrAccessService } from '../../shared/hr-access.service';

type MockRepo<T = unknown> = Record<string, jest.Mock> & { __entity?: T };

const createRepositoryMock = <T>(): MockRepo<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn((value: unknown) => value),
  create: jest.fn((value: unknown) => value),
  remove: jest.fn((value: unknown) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  setParameters: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getRawOne: jest.fn(),
  getRawMany: jest.fn(),
  getOne: jest.fn(),
  getMany: jest.fn(),
  getManyAndCount: jest.fn(),
});

const buildSchedule = (
  overrides: Partial<ResolvedAttendanceSchedule> = {},
): ResolvedAttendanceSchedule => ({
  employeeId: 1,
  scheduleDate: '2026-06-12',
  source: 'SHIFT_ASSIGNMENT',
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
  maxOvertimeMinutesPerMonth: 0,
  overtimeRequiresApproval: false,
  requiresCheckout: true,
  ignoreMissingCheckoutIfHoursValid: false,
  roundingMode: AttendanceRoundingModeEnum.NEAREST,
  maxMissingPunchAllowed: 0,
  holidayPolicyMode: AttendanceHolidayPolicyModeEnum.OFF,
  ...overrides,
});

describe('AttendanceDailySummaryService', () => {
  let service: AttendanceDailySummaryService;
  let processedEventRepository: MockRepo<AttendanceProcessedEvent>;
  let dailySummaryRepository: MockRepo<AttendanceDailySummary>;
  let adjustmentRepository: MockRepo<AttendanceDailySummaryAdjustment>;
  let mobilePunchRepository: MockRepo<AttendanceMobilePunch>;
  let leaveRequestRepository: MockRepo<LeaveRequest>;
  let leaveTypeRepository: MockRepo<LeaveType>;
  let businessTripRepository: MockRepo<AttendanceBusinessTrip>;
  let employeeRepository: MockRepo<Employee>;
  let employeeDeviceAssignmentRepository: MockRepo<EmployeeDeviceAssignment>;
  let employeeTimetableRepository: MockRepo<EmployeeTimetable>;
  let timetableRepository: MockRepo<Timetable>;
  let shiftAssignmentRepository: MockRepo<ShiftAssignment>;
  let shiftScheduleRepository: MockRepo<ShiftSchedule>;
  let shiftBreakRepository: MockRepo<ShiftBreak>;
  let timetableDayRepository: MockRepo<TimetableDay>;
  let scheduleResolver: { resolveForDate: jest.Mock };
  let exceptionService: { replaceForEmployeeDate: jest.Mock };
  let leaveBalanceService: {
    getFiscalYearFromDate: jest.Mock;
    synchronizeAttendanceImpactForEmployeeYear: jest.Mock;
  };
  let hrAccessService: { getAccessibleEmployeeIds: jest.Mock };
  let timezoneBuilder: ReturnType<typeof createQueryBuilderMock>;
  let processedEventBuilder: ReturnType<typeof createQueryBuilderMock>;
  let mobilePunchBuilder: ReturnType<typeof createQueryBuilderMock>;
  let leaveBuilder: ReturnType<typeof createQueryBuilderMock>;
  let tripBuilder: ReturnType<typeof createQueryBuilderMock>;
  let employeeFilterBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftScheduleExpectationBuilder: ReturnType<
    typeof createQueryBuilderMock
  >;
  let shiftExpectationBuilder: ReturnType<typeof createQueryBuilderMock>;
  let timetableExpectationBuilder: ReturnType<typeof createQueryBuilderMock>;

  beforeEach(() => {
    processedEventRepository = createRepositoryMock();
    dailySummaryRepository = createRepositoryMock();
    adjustmentRepository = createRepositoryMock();
    mobilePunchRepository = createRepositoryMock();
    leaveRequestRepository = createRepositoryMock();
    leaveTypeRepository = createRepositoryMock();
    businessTripRepository = createRepositoryMock();
    employeeRepository = createRepositoryMock();
    employeeDeviceAssignmentRepository = createRepositoryMock();
    employeeTimetableRepository = createRepositoryMock();
    timetableRepository = createRepositoryMock();
    shiftAssignmentRepository = createRepositoryMock();
    shiftScheduleRepository = createRepositoryMock();
    shiftBreakRepository = createRepositoryMock();
    timetableDayRepository = createRepositoryMock();
    scheduleResolver = {
      resolveForDate: jest.fn(),
    };
    exceptionService = {
      replaceForEmployeeDate: jest.fn(() => Promise.resolve([])),
    };
    leaveBalanceService = {
      getFiscalYearFromDate: jest.fn((value: string) => value.slice(0, 4)),
      synchronizeAttendanceImpactForEmployeeYear: jest.fn(() =>
        Promise.resolve([]),
      ),
    };
    hrAccessService = {
      getAccessibleEmployeeIds: jest.fn(),
    };

    timezoneBuilder = createQueryBuilderMock();
    processedEventBuilder = createQueryBuilderMock();
    mobilePunchBuilder = createQueryBuilderMock();
    leaveBuilder = createQueryBuilderMock();
    tripBuilder = createQueryBuilderMock();
    employeeFilterBuilder = createQueryBuilderMock();
    shiftScheduleExpectationBuilder = createQueryBuilderMock();
    shiftExpectationBuilder = createQueryBuilderMock();
    timetableExpectationBuilder = createQueryBuilderMock();

    processedEventRepository.createQueryBuilder
      .mockReturnValueOnce(timezoneBuilder)
      .mockReturnValueOnce(processedEventBuilder);
    employeeRepository.createQueryBuilder.mockReturnValue(
      employeeFilterBuilder,
    );
    mobilePunchRepository.createQueryBuilder.mockReturnValue(
      mobilePunchBuilder,
    );
    leaveRequestRepository.createQueryBuilder.mockReturnValue(leaveBuilder);
    businessTripRepository.createQueryBuilder.mockReturnValue(tripBuilder);
    shiftScheduleRepository.createQueryBuilder.mockReturnValue(
      shiftScheduleExpectationBuilder,
    );
    shiftAssignmentRepository.createQueryBuilder.mockReturnValue(
      shiftExpectationBuilder,
    );
    employeeTimetableRepository.createQueryBuilder.mockReturnValue(
      timetableExpectationBuilder,
    );
    timetableRepository.findOne.mockResolvedValue(null);

    service = new AttendanceDailySummaryService(
      processedEventRepository as unknown as Repository<AttendanceProcessedEvent>,
      dailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      adjustmentRepository as unknown as Repository<AttendanceDailySummaryAdjustment>,
      mobilePunchRepository as unknown as Repository<AttendanceMobilePunch>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      leaveTypeRepository as unknown as Repository<LeaveType>,
      businessTripRepository as unknown as Repository<AttendanceBusinessTrip>,
      employeeRepository as unknown as Repository<Employee>,
      employeeDeviceAssignmentRepository as unknown as Repository<EmployeeDeviceAssignment>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      shiftBreakRepository as unknown as Repository<ShiftBreak>,
      timetableDayRepository as unknown as Repository<TimetableDay>,
      timetableRepository as unknown as Repository<Timetable>,
      scheduleResolver as unknown as AttendanceScheduleResolverService,
      exceptionService as unknown as AttendanceProcessingExceptionsService,
      leaveBalanceService as unknown as LeaveBalanceService,
      hrAccessService as unknown as HrAccessService,
    );
  });

  it('keeps attendance adjustments and leave refresh inside the approval transaction', async () => {
    const query = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    const scopedRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 501 }),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 501 }),
      createQueryBuilder: () => query,
      create: jest.fn((value: unknown) => value),
      save: jest.fn(),
    };
    const manager = {
      getRepository: () => scopedRepository,
    } as unknown as EntityManager;
    const recompute = jest
      .spyOn(
        AttendanceDailySummaryService.prototype,
        'recomputeForEmployeeDate',
      )
      .mockResolvedValue(true);
    try {
      await service.upsertAdjustment(
        10,
        501,
        '2026-10-17',
        {},
        90,
        {},
        manager,
      );
      expect(scopedRepository.save).toHaveBeenCalled();
      expect(adjustmentRepository.save).not.toHaveBeenCalled();
      expect(scopedRepository.findOneOrFail).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      await service['inTransaction'](manager)[
        'refreshAttendanceAffectedLeaveBalances'
      ](10, 501, '2026', 'Test');
      expect(
        leaveBalanceService.synchronizeAttendanceImpactForEmployeeYear,
      ).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ id: 501 }),
        '2026',
        manager,
        'Test',
      );
    } finally {
      recompute.mockRestore();
    }
  });

  it('persists absences for scheduled no-show days', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(buildSchedule());
    processedEventBuilder.getMany.mockResolvedValue([]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    const result = await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(result).toBe(true);
    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.ABSENT,
        attendanceDate: '2026-06-12',
        remarks: expect.arrayContaining([
          AttendanceDailyRemarkEnum.MISSING_BOTH_CHECK_IN_AND_CHECK_OUT,
        ]) as AttendanceDailyRemarkEnum[],
      }),
    );
    expect(exceptionService.replaceForEmployeeDate).toHaveBeenCalled();
    expect(
      leaveBalanceService.synchronizeAttendanceImpactForEmployeeYear,
    ).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id: 1 }),
      '2026',
      undefined,
      'Attendance summary recalculated',
    );
  });

  it('treats approved mobile punches as attendance events', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({ requiresCheckout: false, maxMissingPunchAllowed: 1 }),
    );
    processedEventBuilder.getMany.mockResolvedValue([]);
    mobilePunchBuilder.getMany.mockResolvedValue([
      {
        id: 44,
        punchTime: new Date('2026-06-12T08:05:00Z'),
      },
    ]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    const result = await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(result).toBe(true);
    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.PRESENT,
        checkInAt: new Date('2026-06-12T08:05:00Z'),
        remarks: [],
      }),
    );
  });

  it('deducts unpaid shift breaks from worked minutes', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(buildSchedule());
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 11,
        rawLogId: 101,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:00:00Z'),
      },
      {
        id: 12,
        rawLogId: 102,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T17:00:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([
      { durationMinutes: 60, isPaid: false },
    ]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workMinutes: 480,
        breakMinutes: 60,
      }),
    );
  });

  it('removes summaries after an employee exit date', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 1,
      exit_date: '2026-06-10',
    });
    dailySummaryRepository.findOne.mockResolvedValue({
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
    expect(scheduleResolver.resolveForDate).not.toHaveBeenCalled();
  });

  it('skips recomputation when the employee record is missing', async () => {
    employeeRepository.findOne.mockResolvedValue(null);

    const result = await service.recomputeForEmployeeDate(
      10,
      999,
      '2026-06-12',
    );

    expect(result).toBe(false);
    expect(dailySummaryRepository.save).not.toHaveBeenCalled();
    expect(scheduleResolver.resolveForDate).not.toHaveBeenCalled();
  });

  it('filters missing employees out of explicit rebuild requests', async () => {
    employeeFilterBuilder.getRawMany.mockResolvedValue([]);

    const result = await service.rebuildSummariesForRange({
      companyId: 10,
      startDate: '2026-06-12',
      endDate: '2026-06-12',
      employeeId: 999,
    });

    expect(result).toEqual({
      employeeCount: 0,
      daysComputed: 0,
      summariesUpserted: 0,
    });
    expect(employeeFilterBuilder.where).toHaveBeenCalledWith(
      'employee.id IN (:...employeeIds)',
      { employeeIds: [999] },
    );
  });

  it('marks a day as late when check-in crosses only the late threshold', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        lateAfterMinutes: 10,
        halfDayAfterMinutes: 240,
        absentAfterMinutes: 480,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 21,
        rawLogId: 201,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:15:00Z'),
      },
      {
        id: 22,
        rawLogId: 202,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T17:00:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.LATE,
        lateMinutes: 5,
      }),
    );
  });

  it('caps overtime minutes using the resolved schedule limits', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        allowOvertime: true,
        overtimeStartAfterMinutes: 15,
        maxOvertimeMinutes: 30,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 31,
        rawLogId: 301,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:00:00Z'),
      },
      {
        id: 32,
        rawLogId: 302,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T18:00:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.OVERTIME,
        overtimeMinutes: 30,
      }),
    );
  });

  it('applies the remaining monthly overtime allowance after earlier summaries', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    dailySummaryRepository.find.mockResolvedValue([
      { attendanceDate: '2026-06-11', overtimeMinutes: 45 },
    ]);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        allowOvertime: true,
        maxOvertimeMinutesPerMonth: 90,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 33,
        rawLogId: 303,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:00:00Z'),
      },
      {
        id: 34,
        rawLogId: 304,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T19:00:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 10,
          employeeId: 1,
        }),
      }),
    );
    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        overtimeMinutes: 45,
        flags: expect.objectContaining({
          monthlyOvertimeLimitMinutes: 90,
          monthlyOvertimeUsedBeforeDateMinutes: 45,
          monthlyOvertimeCappedMinutes: 75,
        }),
      }),
    );
  });

  it('marks worked off days distinctly while counting worked minutes as overtime', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        isOffDay: true,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 41,
        rawLogId: 401,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:00:00Z'),
      },
      {
        id: 42,
        rawLogId: 402,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T12:00:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue(null);
    timetableExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.OFF_DAY_PRESENT,
        overtimeMinutes: 240,
      }),
    );
  });

  it('keeps off days without punches as off days', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        isOffDay: true,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue(null);
    timetableExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.OFF_DAY,
        overtimeMinutes: 0,
      }),
    );
  });

  it('treats optional holidays with attendance events as worked days', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        isHoliday: true,
        holidayId: 91,
        holidayPolicyMode: AttendanceHolidayPolicyModeEnum.OPTIONAL,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 51,
        rawLogId: 501,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:00:00Z'),
      },
      {
        id: 52,
        rawLogId: 502,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T12:00:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    const saveCalls = (dailySummaryRepository.save as jest.Mock).mock
      .calls as Partial<AttendanceDailySummary>[][];
    const savedSummary = saveCalls[0][0];

    expect(savedSummary.attendanceStatus).not.toBe(
      AttendanceDailyStatusEnum.HOLIDAY,
    );
    expect(savedSummary.flags).toEqual(
      expect.objectContaining({
        holidayPolicyMode: AttendanceHolidayPolicyModeEnum.OPTIONAL,
      }),
    );
  });

  it('rounds work and overtime minutes and marks overtime for manual review when approval is required', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        allowOvertime: true,
        overtimeStartAfterMinutes: 0,
        overtimeRequiresApproval: true,
        roundingMode: AttendanceRoundingModeEnum.UP,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([
      {
        id: 61,
        rawLogId: 601,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T08:00:00Z'),
      },
      {
        id: 62,
        rawLogId: 602,
        deviceId: 5,
        employeeNo: 'EMP-001',
        eventTime: new Date('2026-06-12T17:07:00Z'),
      },
    ]);
    mobilePunchBuilder.getMany.mockResolvedValue([]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.OVERTIME,
        workMinutes: 550,
        overtimeMinutes: 10,
        remarks: expect.arrayContaining([
          AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED,
        ]) as AttendanceDailyRemarkEnum[],
        flags: expect.objectContaining({
          roundingMode: AttendanceRoundingModeEnum.UP,
          overtimeRequiresApproval: true,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('marks single-punch days for manual review when they exceed the allowed missing punch count', async () => {
    employeeRepository.findOne.mockResolvedValue({ id: 1, exit_date: null });
    dailySummaryRepository.findOne.mockResolvedValue(null);
    timezoneBuilder.getRawOne.mockResolvedValue(null);
    scheduleResolver.resolveForDate.mockResolvedValue(
      buildSchedule({
        requiresCheckout: false,
        maxMissingPunchAllowed: 0,
      }),
    );
    processedEventBuilder.getMany.mockResolvedValue([]);
    mobilePunchBuilder.getMany.mockResolvedValue([
      {
        id: 71,
        punchTime: new Date('2026-06-12T08:05:00Z'),
      },
    ]);
    leaveBuilder.getOne.mockResolvedValue(null);
    tripBuilder.getOne.mockResolvedValue(null);
    shiftScheduleExpectationBuilder.getOne.mockResolvedValue(null);
    shiftExpectationBuilder.getOne.mockResolvedValue({ id: 1 });
    timetableExpectationBuilder.getOne.mockResolvedValue(null);
    adjustmentRepository.findOne.mockResolvedValue(null);
    shiftBreakRepository.find.mockResolvedValue([]);

    await service.recomputeForEmployeeDate(10, 1, '2026-06-12');

    expect(dailySummaryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceStatus: AttendanceDailyStatusEnum.PRESENT,
        remarks: expect.arrayContaining([
          AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED,
        ]) as AttendanceDailyRemarkEnum[],
        flags: expect.objectContaining({
          maxMissingPunchAllowed: 0,
        }) as Record<string, unknown>,
      }),
    );
  });
});
