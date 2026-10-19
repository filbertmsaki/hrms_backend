import { Repository } from 'typeorm';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftRotationGroup } from '../shift/shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from '../shift/shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import {
  TimetableScheduleDefinition,
  TimetableScheduleGenerationService,
} from './timetable-schedule-generation.service';
import { AttendanceCompanyConfigService } from '../shared/attendance-company-config.service';
import { AttendanceHolidayPolicyModeEnum } from '../policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceRoundingModeEnum } from '../policies/enums/attendance-rounding-mode.enum';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { EmployeeWorkSchedule } from '../schedules/entities/employee-work-schedule.entity';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  setParameter: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
});

const buildTimetableDefinition = (
  overrides: Partial<TimetableScheduleDefinition> = {},
): TimetableScheduleDefinition => ({
  companyId: 1,
  employeeId: 1,
  branchId: 2,
  timetableId: 1,
  shiftId: null,
  scheduleDate: '2026-08-09',
  timezone: 'Africa/Dar_es_Salaam',
  generatedFromRotation: false,
  isOffDay: true,
  holidayId: null,
  sourceRule: 'DAY',
  expectedCheckInTime: null,
  expectedCheckOutTime: null,
  overtimeAllowed: false,
  assignmentSource: 'EMPLOYEE_TIMETABLE',
  ...overrides,
});

describe('AttendanceScheduleResolverService', () => {
  let service: AttendanceScheduleResolverService;
  let employeeRepository: MockRepo;
  let deviceRepository: MockRepo;
  let holidayRepository: MockRepo;
  let shiftScheduleRepository: MockRepo;
  let employeeWorkScheduleRepository: MockRepo;
  let shiftAssignmentRepository: MockRepo;
  let shiftRotationGroupRepository: MockRepo;
  let shiftRotationRuleRepository: MockRepo;
  let timetableRepository: MockRepo;
  let shiftRepository: MockRepo;
  let timetableScheduleGenerationService: {
    buildScheduleDefinition: jest.Mock;
  };
  let attendanceCompanyConfigService: {
    resolveRuntimeDefaults: jest.Mock;
  };
  let employeeBuilder: ReturnType<typeof createQueryBuilderMock>;
  let holidayBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftScheduleBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftAssignmentBuilder: ReturnType<typeof createQueryBuilderMock>;

  beforeEach(() => {
    employeeRepository = createRepositoryMock();
    deviceRepository = createRepositoryMock();
    holidayRepository = createRepositoryMock();
    shiftScheduleRepository = createRepositoryMock();
    employeeWorkScheduleRepository = createRepositoryMock();
    shiftAssignmentRepository = createRepositoryMock();
    shiftRotationGroupRepository = createRepositoryMock();
    shiftRotationRuleRepository = createRepositoryMock();
    timetableRepository = createRepositoryMock();
    shiftRepository = createRepositoryMock();

    timetableScheduleGenerationService = {
      buildScheduleDefinition: jest.fn(),
    };
    attendanceCompanyConfigService = {
      resolveRuntimeDefaults: jest.fn().mockResolvedValue({
        absent_after_minutes: 480,
        allow_early_checkin: true,
        allow_late_checkout: false,
        auto_absent_if_no_checkin: true,
        auto_mark_weekend_as_off: false,
        grace_period_minutes: 15,
        half_day_after_minutes: 240,
        ignore_missing_checkout_if_hours_valid: false,
        late_after_minutes: 30,
        max_overtime_minutes_per_day: 0,
        max_overtime_minutes_per_month: 0,
        overtime_requires_approval: false,
        overtime_start_after_minutes: 0,
        rounding_mode: AttendanceRoundingModeEnum.NEAREST,
        max_missing_punch_allowed: 0,
        holiday_policy_mode: AttendanceHolidayPolicyModeEnum.OFF,
        weekend_days: 'SAT,SUN',
      }),
    };

    employeeBuilder = createQueryBuilderMock();
    holidayBuilder = createQueryBuilderMock();
    shiftScheduleBuilder = createQueryBuilderMock();
    shiftAssignmentBuilder = createQueryBuilderMock();

    employeeRepository.createQueryBuilder.mockReturnValue(employeeBuilder);
    holidayRepository.createQueryBuilder.mockReturnValue(holidayBuilder);
    shiftScheduleRepository.createQueryBuilder.mockReturnValue(
      shiftScheduleBuilder,
    );
    shiftAssignmentRepository.createQueryBuilder.mockReturnValue(
      shiftAssignmentBuilder,
    );

    employeeBuilder.getOne.mockResolvedValue({
      id: 1,
      primary_branch_id: 2,
    });
    holidayBuilder.getOne.mockResolvedValue(null);
    shiftScheduleBuilder.getOne.mockResolvedValue(null);
    shiftAssignmentBuilder.getOne.mockResolvedValue({
      id: 7,
      shiftId: 1,
      effectiveFrom: '2026-08-01',
      rotationGroupId: null,
      status: ShiftAssignmentStatusEnum.ACTIVE,
    });
    deviceRepository.findOne.mockResolvedValue(null);

    service = new AttendanceScheduleResolverService(
      employeeRepository as unknown as Repository<Employee>,
      deviceRepository as unknown as Repository<AttendanceDevice>,
      holidayRepository as unknown as Repository<AttendanceHoliday>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      employeeWorkScheduleRepository as unknown as Repository<EmployeeWorkSchedule>,
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      shiftRotationGroupRepository as unknown as Repository<ShiftRotationGroup>,
      shiftRotationRuleRepository as unknown as Repository<ShiftRotationRule>,
      timetableRepository as unknown as Repository<Timetable>,
      shiftRepository as unknown as Repository<Shift>,
      timetableScheduleGenerationService as unknown as TimetableScheduleGenerationService,
      attendanceCompanyConfigService as unknown as AttendanceCompanyConfigService,
    );
  });

  it('keeps a dated shift assignment above a timetable off day', async () => {
    timetableScheduleGenerationService.buildScheduleDefinition.mockResolvedValue(
      buildTimetableDefinition(),
    );
    timetableRepository.findOne.mockResolvedValue({
      id: 1,
      lateAfterMinutes: 30,
      halfDayAfterMinutes: 240,
      absentAfterMinutes: 360,
      allowEarlyCheckin: true,
      allowLateCheckout: false,
      autoAbsentIfNoCheckin: true,
      maxOvertimeMinutes: 0,
      maxOvertimeMinutesPerMonth: 0,
    });

    const resolved = await service.resolveForDate(1, 1, '2026-08-09');

    expect(resolved.source).toBe('SHIFT_ASSIGNMENT');
    expect(resolved.isOffDay).toBe(false);
    expect(resolved.shiftId).toBe(1);
  });

  it('uses a published employee schedule before a direct shift assignment', async () => {
    employeeWorkScheduleRepository.findOne.mockResolvedValue({
      companyId: 1,
      employeeId: 1,
      scheduleDate: '2026-08-09',
      shiftId: 42,
      timetableId: 8,
      isOffDay: false,
      status: 'PUBLISHED',
    });

    const resolved = await service.resolveForDate(1, 1, '2026-08-09');

    expect(resolved.source).toBe('PUBLISHED_EMPLOYEE_SCHEDULE');
    expect(resolved.shiftId).toBe(42);
    expect(resolved.timetableId).toBe(8);
    expect(shiftAssignmentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('keeps shift assignment priority on working days', async () => {
    timetableScheduleGenerationService.buildScheduleDefinition.mockResolvedValue(
      buildTimetableDefinition({
        scheduleDate: '2026-08-10',
        isOffDay: false,
        shiftId: 1,
        expectedCheckInTime: '08:15:00',
        expectedCheckOutTime: '17:15:00',
      }),
    );
    shiftRepository.findOne.mockResolvedValue({
      id: 1,
      branchId: 2,
      startTime: '08:15:00',
      endTime: '17:15:00',
      crossesMidnight: false,
      lateAfterMinutes: 30,
      halfDayAfterMinutes: 240,
      absentAfterMinutes: 360,
      graceInMinutes: 15,
      graceOutMinutes: 0,
      earlyLeaveAfterMinutes: 0,
      allowEarlyCheckin: true,
      allowLateCheckout: false,
      autoMarkAbsent: true,
      allowOvertime: false,
      overtimeStartAfterMinutes: 0,
      maxOvertimeMinutes: 0,
      overtimeRequiresApproval: false,
      requiresCheckout: true,
    });

    const resolved = await service.resolveForDate(1, 1, '2026-08-10');

    expect(resolved.source).toBe('SHIFT_ASSIGNMENT');
    expect(resolved.isOffDay).toBe(false);
    expect(resolved.shiftId).toBe(1);
  });
});
