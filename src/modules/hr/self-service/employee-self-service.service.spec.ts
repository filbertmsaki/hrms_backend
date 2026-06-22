import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
jest.mock('../../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('../employees/employees.service', () => ({
  EmployeesService: class EmployeesService {},
}));
jest.mock('../leave/leave.service', () => ({
  LeaveService: class LeaveService {},
}));
jest.mock('../attendance/processing/attendance-daily-summary.service', () => ({
  AttendanceDailySummaryService: class AttendanceDailySummaryService {},
}));
jest.mock('../attendance/mobile-punches/attendance-mobile-punches.service', () => ({
  AttendanceMobilePunchesService: class AttendanceMobilePunchesService {},
}));
jest.mock('../attendance/processing/attendance-schedule-resolver.service', () => ({
  AttendanceScheduleResolverService: class AttendanceScheduleResolverService {},
}));
import { AttendanceMobilePunchesService } from '../attendance/mobile-punches/attendance-mobile-punches.service';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { AttendanceScheduleResolverService } from '../attendance/processing/attendance-schedule-resolver.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveService } from '../leave/leave.service';
import { UsersService } from '../../users/users.service';
import { EmployeeSelfServiceService } from './employee-self-service.service';

describe('EmployeeSelfServiceService', () => {
  let service: EmployeeSelfServiceService;
  let leaveService: {
    createLeaveRequest: jest.Mock;
    findAllLeaveBalances: jest.Mock;
    findMyLeaveRequests: jest.Mock;
  };
  let attendanceDailySummaryService: {
    findDailySummaries: jest.Mock;
  };
  let attendanceMobilePunchesService: {
    findAll: jest.Mock;
  };
  let attendanceScheduleResolverService: {
    resolveForDate: jest.Mock;
  };
  let employeesService: {
    findMyProfile: jest.Mock;
  };
  let usersService: {
    findMyProfileById: jest.Mock;
  };
  let shiftScheduleRepository: {
    find: jest.Mock;
  };
  let shiftAssignmentRepository: {
    find: jest.Mock;
  };
  let employeeTimetableRepository: {
    find: jest.Mock;
  };
  let shiftRepository: {
    findOne: jest.Mock;
  };
  let timetableRepository: {
    findOne: jest.Mock;
  };

  const actor: AuthenticatedUser = {
    id: 9,
    email: 'staff@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 7,
    companyMembershipId: 11,
    employeeId: 15,
    employeeNo: 'EMP-0015',
    roles: ['USER'],
    permissions: [],
  };

  beforeEach(() => {
    leaveService = {
      createLeaveRequest: jest.fn(),
      findAllLeaveBalances: jest.fn(),
      findMyLeaveRequests: jest.fn(),
    };
    attendanceDailySummaryService = {
      findDailySummaries: jest.fn(),
    };
    attendanceMobilePunchesService = {
      findAll: jest.fn(),
    };
    attendanceScheduleResolverService = {
      resolveForDate: jest.fn(),
    };
    employeesService = {
      findMyProfile: jest.fn(),
    };
    usersService = {
      findMyProfileById: jest.fn(),
    };
    shiftScheduleRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    shiftAssignmentRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    employeeTimetableRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    shiftRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    timetableRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    service = new EmployeeSelfServiceService(
      usersService as unknown as UsersService,
      employeesService as unknown as EmployeesService,
      leaveService as unknown as LeaveService,
      attendanceDailySummaryService as unknown as AttendanceDailySummaryService,
      attendanceMobilePunchesService as unknown as AttendanceMobilePunchesService,
      attendanceScheduleResolverService as unknown as AttendanceScheduleResolverService,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      shiftScheduleRepository as unknown as Repository<any>,
      shiftAssignmentRepository as unknown as Repository<any>,
      employeeTimetableRepository as unknown as Repository<any>,
      shiftRepository as unknown as Repository<any>,
      timetableRepository as unknown as Repository<any>,
    );
  });

  it('injects the authenticated employee id when creating a self leave request', async () => {
    leaveService.createLeaveRequest.mockResolvedValue({ id: 1001 });

    await service.createLeaveRequest(actor, {
      leave_type_id: 4,
      start_date: '2026-06-20',
      end_date: '2026-06-22',
      reason: 'Family commitment',
      submit: true,
    });

    expect(leaveService.createLeaveRequest).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        employee_id: 15,
        leave_type_id: 4,
        start_date: '2026-06-20',
        end_date: '2026-06-22',
        reason: 'Family commitment',
        submit: true,
      }),
      actor,
    );
  });

  it('forces attendance history queries to the authenticated employee id', async () => {
    attendanceDailySummaryService.findDailySummaries.mockResolvedValue({
      data: [],
      meta: {},
    });

    await service.getAttendanceHistory(actor, {
      employee_id: 999,
      from_date: '2026-06-01',
      to_date: '2026-06-12',
      page: 1,
      limit: 10,
    });

    expect(
      attendanceDailySummaryService.findDailySummaries,
    ).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        employee_id: 15,
        from_date: '2026-06-01',
        to_date: '2026-06-12',
      }),
    );
  });

  it('uses resolved shift assignment details for schedule days', async () => {
    shiftAssignmentRepository.find.mockResolvedValue([
      {
        effectiveFrom: '2026-06-22',
        effectiveTo: '2026-06-22',
        shift: {
          id: 12,
          name: 'Fallback Shift',
          code: 'FALLBACK',
          startTime: '09:00:00',
          endTime: '18:00:00',
          expectedWorkMinutes: 540,
          requiresCheckout: true,
          allowOvertime: false,
          crossesMidnight: false,
        },
      },
    ]);
    attendanceScheduleResolverService.resolveForDate.mockResolvedValue({
      shiftId: 25,
      timetableId: null,
      scheduleStartAt: new Date('2026-06-22T08:00:00+03:00'),
      scheduleEndAt: new Date('2026-06-22T17:00:00+03:00'),
      timezone: 'Africa/Dar_es_Salaam',
      isOffDay: true,
      holidayId: 91,
      requiresCheckout: true,
      allowOvertime: true,
    });
    shiftRepository.findOne.mockResolvedValue({
      id: 25,
      name: 'Resolved Shift',
      code: 'RES',
      startTime: '08:00:00',
      endTime: '17:00:00',
      expectedWorkMinutes: 480,
      requiresCheckout: true,
      allowOvertime: true,
      crossesMidnight: false,
    });

    const result = await service.getAttendanceSchedule(actor, {
      from_date: '2026-06-22',
      to_date: '2026-06-22',
    });

    expect(attendanceScheduleResolverService.resolveForDate).toHaveBeenCalledWith(
      7,
      15,
      '2026-06-22',
    );
    expect(result.days[0]).toEqual(
      expect.objectContaining({
        source: 'shift_assignment',
        is_off_day: true,
        holiday: {
          id: 91,
          name: null,
          date: '2026-06-22',
        },
        shift: expect.objectContaining({
          id: 25,
          name: 'Resolved Shift',
        }),
      }),
    );
  });

  it('keeps dashboard links flat for clients', async () => {
    usersService.findMyProfileById.mockResolvedValue({
      status: 'ACTIVE',
      active_company: { id: 7, name: 'Acme', slug: 'acme', status: 'ACTIVE' },
    });
    employeesService.findMyProfile.mockResolvedValue({
      id: 15,
      employment_status: 'active',
      employment_type: 'full_time',
    });
    leaveService.findMyLeaveRequests.mockResolvedValue({
      data: [],
      meta: {},
    });
    jest.spyOn(service, 'getTodayAttendance').mockResolvedValue({
      date: '2026-06-22',
      punches: [],
      punch_state: 'not_checked_in',
      processing_state: 'no_activity',
      action_flags: {
        can_check_in: true,
        can_check_out: false,
      },
      summary: null,
      first_punch: null,
      last_punch: null,
    } as any);
    jest.spyOn(service, 'getLeaveBalances').mockResolvedValue({
      data: [],
      meta: {},
    } as any);
    jest.spyOn(service, 'getAttendanceSchedule').mockResolvedValue({
      from_date: '2026-06-22',
      to_date: '2026-06-28',
      days: [],
    } as any);
    jest
      .spyOn(service as any, 'buildAttendanceStats')
      .mockResolvedValue({});
    jest.spyOn(service as any, 'buildLeaveCounts').mockResolvedValue({});
    jest
      .spyOn(service as any, 'findUpcomingApprovedLeave')
      .mockResolvedValue([]);
    attendanceDailySummaryService.findDailySummaries.mockResolvedValue({
      data: [],
      meta: {},
    });

    const result = await service.getDashboard(actor);

    expect(result.links.profile).toBe('/me/profile');
    expect((result.links as Record<string, unknown>).links).toBeUndefined();
  });

  it('requires an active company context', async () => {
    await expect(
      service.getAttendanceHistory(
        {
          ...actor,
          companyId: undefined,
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an employee profile for self-service profile access', async () => {
    employeesService.findMyProfile.mockRejectedValue(
      new NotFoundException('Employee not found'),
    );

    await expect(
      service.getProfile({ ...actor, employeeId: undefined }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
