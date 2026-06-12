import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AttendanceMobilePunchesService } from '../attendance/mobile-punches/attendance-mobile-punches.service';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveService } from '../leave/leave.service';
import { UsersService } from '../../users/users.service';
import { EmployeeSelfServiceService } from './employee-self-service.service';

describe('EmployeeSelfServiceService', () => {
  let service: EmployeeSelfServiceService;
  let leaveService: {
    createLeaveRequest: jest.Mock;
    findAllLeaveBalances: jest.Mock;
  };
  let attendanceDailySummaryService: {
    findDailySummaries: jest.Mock;
  };
  let employeesService: {
    findMyProfile: jest.Mock;
  };
  let usersService: {
    findMyProfileById: jest.Mock;
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
    };
    attendanceDailySummaryService = {
      findDailySummaries: jest.fn(),
    };
    employeesService = {
      findMyProfile: jest.fn(),
    };
    usersService = {
      findMyProfileById: jest.fn(),
    };

    service = new EmployeeSelfServiceService(
      usersService as unknown as UsersService,
      employeesService as unknown as EmployeesService,
      leaveService as unknown as LeaveService,
      attendanceDailySummaryService as unknown as AttendanceDailySummaryService,
      {} as AttendanceMobilePunchesService,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
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

    expect(attendanceDailySummaryService.findDailySummaries).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        employee_id: 15,
        from_date: '2026-06-01',
        to_date: '2026-06-12',
      }),
    );
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

    await expect(service.getProfile({ ...actor, employeeId: undefined })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
