import { WorkActivityEligibilityService } from './work-activity-eligibility.service';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { LeaveDurationTypeEnum } from '../../leave/enums/leave-duration-type.enum';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { AttendanceDailyStatusEnum } from '../../attendance/processing/enums/attendance-daily-status.enum';

describe('WorkActivityEligibilityService', () => {
  const scheduleResolver = {
    resolveForDate: jest.fn(),
    resolveForDateRange: jest.fn(),
  };
  const leaveRepository = { find: jest.fn() };
  const attendanceRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const holidayRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  let service: WorkActivityEligibilityService;
  const employee = {
    id: 4,
    company_id: 2,
    employment_status: EmploymentStatusEnum.ACTIVE,
    hire_date: '2026-01-10',
    exit_date: null,
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WorkActivityEligibilityService(
      scheduleResolver as never,
      leaveRepository as never,
      attendanceRepository as never,
      holidayRepository as never,
    );
    scheduleResolver.resolveForDate.mockResolvedValue({
      source: 'PUBLISHED_EMPLOYEE_SCHEDULE',
      timezone: 'Africa/Dar_es_Salaam',
      isOffDay: false,
      isHoliday: false,
    });
    scheduleResolver.resolveForDateRange.mockResolvedValue([
      {
        source: 'PUBLISHED_EMPLOYEE_SCHEDULE',
        timezone: 'Africa/Dar_es_Salaam',
        isOffDay: false,
        isHoliday: false,
        holidayId: null,
        shiftId: 7,
      },
      {
        source: 'PUBLISHED_EMPLOYEE_SCHEDULE',
        timezone: 'Africa/Dar_es_Salaam',
        isOffDay: true,
        isHoliday: true,
        holidayId: 12,
        shiftId: null,
      },
    ]);
    leaveRepository.find.mockResolvedValue([]);
    attendanceRepository.find.mockResolvedValue([]);
    attendanceRepository.findOne.mockResolvedValue({
      attendanceStatus: AttendanceDailyStatusEnum.PRESENT,
      checkInAt: new Date('2026-06-01T06:00:00.000Z'),
    });
    holidayRepository.find.mockResolvedValue([]);
    holidayRepository.findOne.mockResolvedValue(null);
  });

  it('excludes dates outside hire and exit bounds but includes both boundary dates', async () => {
    expect((await service.evaluate(employee, '2026-01-09')).eligible).toBe(
      false,
    );
    expect((await service.evaluate(employee, '2026-01-10')).eligible).toBe(
      true,
    );

    const exited = {
      ...employee,
      exit_date: '2026-02-01',
      employment_status: EmploymentStatusEnum.TERMINATED,
    } as never;
    expect((await service.evaluate(exited, '2026-02-01')).eligible).toBe(true);
    expect((await service.evaluate(exited, '2026-02-02')).eligible).toBe(false);
  });

  it('keeps active calendar-day eligibility on off days, holidays, and leave while reporting context', async () => {
    scheduleResolver.resolveForDate.mockResolvedValue({
      source: 'PUBLISHED_EMPLOYEE_SCHEDULE',
      timezone: 'Africa/Dar_es_Salaam',
      isOffDay: true,
      isHoliday: true,
    });
    leaveRepository.find.mockResolvedValue([
      {
        start_date: '2026-06-01',
        end_date: '2026-06-01',
        duration_type: LeaveDurationTypeEnum.FULL_DAY,
        status: LeaveStatusEnum.APPROVED,
      },
    ]);

    const result = await service.evaluate(employee, '2026-06-01');
    expect(result.eligible).toBe(true);
    expect(result.isWorkday).toBe(false);
    expect(result.isOffDay).toBe(true);
    expect(result.isHoliday).toBe(true);
    expect(result.hasFullDayLeave).toBe(true);
    expect(result.timezone).toBe('Africa/Dar_es_Salaam');
  });

  it('keeps attendance exceptions eligible for partial leave, but not full-day leave', async () => {
    leaveRepository.find.mockResolvedValue([
      {
        start_date: '2026-06-01',
        end_date: '2026-06-01',
        duration_type: LeaveDurationTypeEnum.HALF_DAY,
        status: LeaveStatusEnum.APPROVED,
      },
    ]);
    expect(
      (await service.evaluate(employee, '2026-06-01'))
        .attendanceExceptionEligible,
    ).toBe(true);

    leaveRepository.find.mockResolvedValue([
      {
        start_date: '2026-06-01',
        end_date: '2026-06-01',
        duration_type: LeaveDurationTypeEnum.FULL_DAY,
        status: LeaveStatusEnum.APPROVED,
      },
    ]);
    expect(
      (await service.evaluate(employee, '2026-06-01'))
        .attendanceExceptionEligible,
    ).toBe(false);
  });

  it('does not treat a generated absent summary without a punch as attendance', async () => {
    attendanceRepository.findOne.mockResolvedValue({
      attendanceStatus: AttendanceDailyStatusEnum.ABSENT,
      checkInAt: null,
    });
    expect(
      (await service.evaluate(employee, '2026-06-01'))
        .attendanceExceptionEligible,
    ).toBe(false);
  });

  it('treats approved duty attendance as work evidence without a punch', async () => {
    attendanceRepository.findOne.mockResolvedValue({
      attendanceStatus: AttendanceDailyStatusEnum.BUSINESS_TRIP,
      checkInAt: null,
    });
    expect(
      (await service.evaluate(employee, '2026-06-01'))
        .attendanceExceptionEligible,
    ).toBe(true);
  });

  it('batches range leave and attendance data while preserving per-date eligibility context', async () => {
    leaveRepository.find.mockResolvedValue([
      {
        start_date: '2026-06-01',
        end_date: '2026-06-01',
        duration_type: LeaveDurationTypeEnum.HALF_DAY,
        status: LeaveStatusEnum.APPROVED,
      },
    ]);
    attendanceRepository.find.mockResolvedValue([
      {
        attendanceDate: '2026-06-01',
        attendanceStatus: AttendanceDailyStatusEnum.BUSINESS_TRIP,
        checkInAt: null,
      },
    ]);
    holidayRepository.find.mockResolvedValue([
      { id: 12, countsAsWorkingDay: false },
    ]);

    await expect(
      service.evaluateRange(employee, '2026-06-01', '2026-06-02'),
    ).resolves.toMatchObject([
      {
        eligible: true,
        isWorkday: true,
        hasPartialLeave: true,
        attendanceExceptionEligible: true,
      },
      {
        eligible: true,
        isOffDay: true,
        isHoliday: true,
        hasApprovedLeave: false,
      },
    ]);
    expect(scheduleResolver.resolveForDateRange).toHaveBeenCalledWith(
      2,
      4,
      ['2026-06-01', '2026-06-02'],
      undefined,
    );
    expect(leaveRepository.find).toHaveBeenCalledTimes(1);
    expect(attendanceRepository.find).toHaveBeenCalledTimes(1);
    expect(holidayRepository.find).toHaveBeenCalledTimes(1);
  });
});
