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
jest.mock(
  '../attendance/mobile-punches/attendance-mobile-punches.service',
  () => ({
    AttendanceMobilePunchesService: class AttendanceMobilePunchesService {},
  }),
);
jest.mock(
  '../attendance/processing/attendance-schedule-resolver.service',
  () => ({
    AttendanceScheduleResolverService: class AttendanceScheduleResolverService {},
  }),
);
import { AttendanceMobilePunchesService } from '../attendance/mobile-punches/attendance-mobile-punches.service';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { AttendanceScheduleResolverService } from '../attendance/processing/attendance-schedule-resolver.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveService } from '../leave/leave.service';
import { UsersService } from '../../users/users.service';
import { EmployeeSelfServiceService } from './employee-self-service.service';
import { FilesService } from '../../files/files.service';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceMobilePunch } from '../attendance/mobile-punches/entities/attendance-mobile-punch.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import { ProfileChangeRequestsService } from './profile-change-requests.service';
import { ProfileChangeRequest } from './entities/profile-change-request.entity';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { HrDocumentsService } from '../documents/hr-documents.service';
import { OffboardingService } from '../offboarding/offboarding.service';
import { HrAccessService } from '../shared/hr-access.service';
import { DefaultAvatarsService } from '../default-avatars/default-avatars.service';

describe('EmployeeSelfServiceService', () => {
  let service: EmployeeSelfServiceService;
  let leaveService: {
    createLeaveRequest: jest.Mock;
    downloadLeaveDocument: jest.Mock;
    upsertMedicalDetail: jest.Mock;
    findAllLeaveBalances: jest.Mock;
    findMyLeaveRequests: jest.Mock;
  };
  let attendanceDailySummaryService: {
    findDailySummaries: jest.Mock;
  };
  let attendanceMobilePunchesService: {
    findAll: jest.Mock;
  };
  let attendanceMobilePunchRepository: {
    find: jest.Mock;
  };
  let attendanceScheduleResolverService: {
    resolveForDate: jest.Mock;
  };
  let employeesService: {
    findMyProfile: jest.Mock;
    updateMyProfilePhoto: jest.Mock;
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
  let profileUpdateRequestRepository: {
    count: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let filesService: {
    saveBufferFile: jest.Mock;
    removeManagedFile: jest.Mock;
  };
  let profileChangeRequestsService: {
    getPendingSummary: jest.Mock;
  };
  let leaveRequestRepository: { find: jest.Mock; findOne: jest.Mock };
  let correctionRequestRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let profileChangeRequestRepository: { find: jest.Mock };
  let onboardingRequestRepository: { find: jest.Mock };
  let offboardingRequestRepository: { find: jest.Mock };
  let offboardingService: { createOffboardingRequest: jest.Mock };

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
      downloadLeaveDocument: jest.fn(),
      upsertMedicalDetail: jest.fn(),
      findAllLeaveBalances: jest.fn(),
      findMyLeaveRequests: jest.fn(),
    };
    attendanceDailySummaryService = {
      findDailySummaries: jest.fn(),
    };
    attendanceMobilePunchesService = {
      findAll: jest.fn(),
    };
    attendanceMobilePunchRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    attendanceScheduleResolverService = {
      resolveForDate: jest.fn(),
    };
    employeesService = {
      findMyProfile: jest.fn(),
      updateMyProfilePhoto: jest.fn(),
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
    profileUpdateRequestRepository = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 701, ...value })),
    };
    filesService = {
      saveBufferFile: jest.fn(),
      removeManagedFile: jest.fn(),
    };
    profileChangeRequestsService = {
      getPendingSummary: jest.fn().mockResolvedValue({
        has_pending_profile_change: false,
        pending_request_count: 0,
      }),
    };
    leaveRequestRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    correctionRequestRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 601, ...value })),
    };
    profileChangeRequestRepository = { find: jest.fn().mockResolvedValue([]) };
    onboardingRequestRepository = { find: jest.fn().mockResolvedValue([]) };
    offboardingRequestRepository = { find: jest.fn().mockResolvedValue([]) };
    offboardingService = {
      createOffboardingRequest: jest.fn().mockResolvedValue({ id: 501 }),
    };

    service = new EmployeeSelfServiceService(
      usersService as unknown as UsersService,
      employeesService as unknown as EmployeesService,
      leaveService as unknown as LeaveService,
      attendanceDailySummaryService as unknown as AttendanceDailySummaryService,
      attendanceMobilePunchesService as unknown as AttendanceMobilePunchesService,
      attendanceScheduleResolverService as unknown as AttendanceScheduleResolverService,
      {} as Repository<AttendanceDailySummary>,
      attendanceMobilePunchRepository as unknown as Repository<AttendanceMobilePunch>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
      shiftRepository as unknown as Repository<Shift>,
      timetableRepository as unknown as Repository<Timetable>,
      correctionRequestRepository as unknown as Repository<AttendanceCorrectionRequest>,
      profileUpdateRequestRepository as unknown as Repository<EmployeeProfileUpdateRequest>,
      filesService as unknown as FilesService,
      profileChangeRequestsService as unknown as ProfileChangeRequestsService,
      profileChangeRequestRepository as unknown as Repository<ProfileChangeRequest>,
      onboardingRequestRepository as unknown as Repository<OnboardingRequest>,
      offboardingRequestRepository as unknown as Repository<OffboardingRequest>,
      {} as unknown as ActionItemsService,
      {} as unknown as HrDocumentsService,
      offboardingService as unknown as OffboardingService,
      {
        getAccessibleEmployeeIds: jest.fn().mockResolvedValue(null),
      } as unknown as HrAccessService,
      {
        resolveEmployeeProfileAvatar: jest.fn().mockResolvedValue({
          profile_photo_url: null,
          uploaded_profile_photo_url: null,
          profile_photo_source: 'none',
          default_avatar_id: null,
        }),
      } as unknown as DefaultAvatarsService,
    );
  });

  it('allows employees to download their own leave evidence without HR permissions', async () => {
    leaveRequestRepository.findOne.mockResolvedValue({
      id: 42,
      employee_id: 15,
    });
    await service.downloadMyLeaveDocument(actor, 42, 9);
    expect(leaveRequestRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42, company_id: 7 } }),
    );
    expect(leaveService.downloadLeaveDocument).toHaveBeenCalledWith(
      7,
      42,
      9,
      actor,
    );
  });

  it('allows employees to update medical details only on their own request', async () => {
    leaveRequestRepository.findOne.mockResolvedValue({
      id: 42,
      employee_id: 15,
    });
    await service.updateMyLeaveMedicalDetail(actor, 42, {
      doctor_name: 'Dr Example',
    });
    expect(leaveService.upsertMedicalDetail).toHaveBeenCalledWith(
      7,
      42,
      { doctor_name: 'Dr Example' },
      actor,
    );
  });

  it('denies another employee medical edits and document downloads', async () => {
    leaveRequestRepository.findOne.mockResolvedValue({
      id: 42,
      employee_id: 99,
    });
    await expect(service.downloadMyLeaveDocument(actor, 42, 9)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.updateMyLeaveMedicalDetail(actor, 42, { doctor_name: 'Other' }),
    ).rejects.toThrow(ForbiddenException);
    expect(leaveService.downloadLeaveDocument).not.toHaveBeenCalled();
    expect(leaveService.upsertMedicalDetail).not.toHaveBeenCalled();
  });

  it('denies a missing or cross-company leave document before reading files', async () => {
    leaveRequestRepository.findOne.mockResolvedValue(null);
    await expect(service.downloadMyLeaveDocument(actor, 42, 9)).rejects.toThrow(
      NotFoundException,
    );
    expect(leaveService.downloadLeaveDocument).not.toHaveBeenCalled();
  });

  it('injects the authenticated employee id when creating a self leave request', async () => {
    leaveService.createLeaveRequest.mockResolvedValue({ id: 1001 });

    await service.createLeaveRequest(actor, {
      leave_type_id: 4,
      duration_type: 'HALF_DAY' as never,
      start_date: '2026-06-20',
      end_date: '2026-06-22',
      half_day_session: 'SECOND_HALF' as never,
      reason: 'Family commitment',
      submit: true,
    });

    expect(leaveService.createLeaveRequest).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        employee_id: 15,
        leave_type_id: 4,
        duration_type: 'HALF_DAY',
        start_date: '2026-06-20',
        end_date: '2026-06-22',
        half_day_session: 'SECOND_HALF',
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

  it('forces leave balance queries to the authenticated employee id', async () => {
    leaveService.findAllLeaveBalances.mockResolvedValue({
      data: [],
      meta: {},
    });

    await service.getLeaveBalances(actor, {
      employee_id: 999,
      fiscal_year: '2026',
      page: 1,
      limit: 10,
    });

    expect(leaveService.findAllLeaveBalances).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        employee_id: 15,
        fiscal_year: '2026',
        page: 1,
        limit: 10,
      }),
      actor,
    );
  });

  it('binds a new attendance correction to the authenticated employee', async () => {
    const result = await service.createMyCorrectionRequest(actor, {
      attendance_date: '2026-06-12',
      request_type: 'MISSING_PUNCH' as never,
      requested_check_in_at: '2026-06-12T06:00:00.000Z',
      reason: 'Clock device was unavailable',
      employee_id: 999,
    } as never);

    expect(correctionRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        employeeId: 15,
        attendanceDate: '2026-06-12',
        reason: 'Clock device was unavailable',
      }),
    );
    expect(result.employee_id).toBe(15);
  });

  it('cannot read another employee attendance correction by ID', async () => {
    correctionRequestRepository.findOne.mockResolvedValue(null);

    await expect(service.getMyCorrectionRequest(actor, 601)).rejects.toThrow(
      NotFoundException,
    );
    expect(correctionRequestRepository.findOne).toHaveBeenCalledWith({
      where: { id: 601, companyId: 7, employeeId: 15 },
    });
  });

  it('binds a profile update request to the authenticated employee', async () => {
    const result = await service.createMyProfileUpdateRequest(actor, {
      requested_changes: { phone: '+255700000000' },
      reason: 'Contact number changed',
      employee_id: 999,
    } as never);

    expect(profileUpdateRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        employeeId: 15,
        requestedChanges: { phone: '+255700000000' },
        reason: 'Contact number changed',
      }),
    );
    expect(result.employee_id).toBe(15);
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

    expect(
      attendanceScheduleResolverService.resolveForDate,
    ).toHaveBeenCalledWith(7, 15, '2026-06-22');
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
        }) as unknown,
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
    } as unknown as Awaited<ReturnType<typeof service.getTodayAttendance>>);
    jest.spyOn(service, 'getLeaveBalances').mockResolvedValue({
      data: [],
      meta: {},
    } as unknown as Awaited<ReturnType<typeof service.getLeaveBalances>>);
    jest.spyOn(service, 'getAttendanceSchedule').mockResolvedValue({
      from_date: '2026-06-22',
      to_date: '2026-06-28',
      days: [],
    } as unknown as Awaited<ReturnType<typeof service.getAttendanceSchedule>>);
    jest.spyOn(service as any, 'buildAttendanceStats').mockResolvedValue({});
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

  it('allows check-in on an off day when no active punch exists', async () => {
    attendanceDailySummaryService.findDailySummaries.mockResolvedValue({
      data: [
        {
          id: 91,
          attendanceStatus: 'OFF_DAY',
          scheduleStartAt: null,
          scheduleEndAt: null,
          checkInAt: null,
          checkOutAt: null,
          workMinutes: 0,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          timezone: 'Africa/Dar_es_Salaam',
          flags: { isOffDay: true },
        },
      ],
      meta: {},
    });

    const result = await service.getTodayAttendance(actor);

    expect(result.action_flags).toEqual({
      can_check_in: true,
      can_check_out: false,
    });
    expect(result.summary?.attendance_status).toBe('OFF_DAY');
  });

  it('falls back to employee profile update requests when the legacy profile change table is unavailable', async () => {
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
    profileChangeRequestsService.getPendingSummary.mockRejectedValueOnce(
      new Error('relation "profile_change_requests" does not exist'),
    );
    profileUpdateRequestRepository.count.mockResolvedValue(2);
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
    } as unknown as Awaited<ReturnType<typeof service.getTodayAttendance>>);
    jest.spyOn(service, 'getLeaveBalances').mockResolvedValue({
      data: [],
      meta: {},
    } as unknown as Awaited<ReturnType<typeof service.getLeaveBalances>>);
    jest.spyOn(service, 'getAttendanceSchedule').mockResolvedValue({
      from_date: '2026-06-22',
      to_date: '2026-06-28',
      days: [],
    } as unknown as Awaited<ReturnType<typeof service.getAttendanceSchedule>>);
    jest.spyOn(service as any, 'buildAttendanceStats').mockResolvedValue({});
    jest.spyOn(service as any, 'buildLeaveCounts').mockResolvedValue({});
    jest
      .spyOn(service as any, 'findUpcomingApprovedLeave')
      .mockResolvedValue([]);
    attendanceDailySummaryService.findDailySummaries.mockResolvedValue({
      data: [],
      meta: {},
    });

    const result = await service.getDashboard(actor);

    expect(profileUpdateRequestRepository.count).toHaveBeenCalledTimes(1);
    expect(result.pending_profile_change).toEqual({
      has_pending_profile_change: true,
      pending_request_count: 2,
    });
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

  it('uploads a profile photo and updates the employee profile url', async () => {
    employeesService.findMyProfile.mockResolvedValue({
      id: 15,
      employee_no: 'EMP-0015',
      profile_photo_url: '/uploads/profile-photos/company-7/old-photo.jpg',
    });
    employeesService.updateMyProfilePhoto.mockResolvedValue({
      id: 15,
      profile_photo_url: '/uploads/profile-photos/company-7/new-photo.jpg',
    });
    filesService.saveBufferFile.mockResolvedValue({
      publicPath: '/uploads/profile-photos/company-7/employee-15-new-photo.png',
    });

    const result = await service.uploadProfilePhoto(actor, {
      originalname: 'avatar.png',
      mimetype: 'image/png',
      size: 128,
      buffer: Buffer.from('png'),
    });

    expect(filesService.saveBufferFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'avatar.png',
        mimeType: 'image/png',
        fileSize: 128,
        directorySegments: ['profile-photos', 'company-7'],
      }),
    );
    expect(employeesService.updateMyProfilePhoto).toHaveBeenCalledWith(
      7,
      9,
      '/uploads/profile-photos/company-7/employee-15-new-photo.png',
    );
    expect(filesService.removeManagedFile).toHaveBeenCalledWith(
      '/uploads/profile-photos/company-7/old-photo.jpg',
    );
    expect(result).toEqual(
      expect.objectContaining({
        message: 'Profile picture uploaded successfully.',
        profile_photo_url:
          '/uploads/profile-photos/company-7/employee-15-new-photo.png',
      }),
    );
  });

  describe('getMyRequestTimeline', () => {
    it('combines and sorts leave, onboarding, and offboarding items by most recently updated', async () => {
      leaveRequestRepository.find.mockResolvedValue([
        {
          id: 1,
          leave_no: 'LV-1',
          status: 'approved',
          applied_at: new Date('2026-06-01'),
          created_at: new Date('2026-06-01'),
          updated_at: new Date('2026-06-01'),
          start_date: '2026-06-10',
          end_date: '2026-06-12',
          total_days: '2.00',
        },
      ]);
      offboardingRequestRepository.find.mockResolvedValue([
        {
          id: 5,
          offboarding_code: 'OFF-1',
          title: 'Resignation',
          status: 'pending_manager',
          submitted_at: new Date('2026-06-05'),
          created_at: new Date('2026-06-05'),
          updated_at: new Date('2026-06-05'),
          last_working_date: '2026-07-01',
          offboarding_type: 'resignation',
        },
      ]);

      const result = await service.getMyRequestTimeline(actor, {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0].source).toBe('offboarding');
      expect(result.data[1].source).toBe('leave');
    });

    it('filters by module', async () => {
      leaveRequestRepository.find.mockResolvedValue([
        {
          id: 1,
          leave_no: 'LV-1',
          status: 'approved',
          applied_at: new Date('2026-06-01'),
          created_at: new Date('2026-06-01'),
          updated_at: new Date('2026-06-01'),
          start_date: '2026-06-10',
          end_date: '2026-06-12',
          total_days: '2.00',
        },
      ]);
      offboardingRequestRepository.find.mockResolvedValue([
        {
          id: 5,
          offboarding_code: 'OFF-1',
          title: 'Resignation',
          status: 'pending_manager',
          created_at: new Date('2026-06-05'),
          updated_at: new Date('2026-06-05'),
          last_working_date: '2026-07-01',
          offboarding_type: 'resignation',
        },
      ]);

      const result = await service.getMyRequestTimeline(actor, {
        module: 'leave',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe('leave');
    });
  });

  describe('createMyResignation', () => {
    it('delegates to OffboardingService with the resigning employee id and submit=true', async () => {
      await service.createMyResignation(
        actor,
        {
          last_working_date: '2026-08-31',
          reason: 'Pursuing another opportunity',
        },
        { ip_address: null, user_agent: null },
      );

      expect(offboardingService.createOffboardingRequest).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          employee_id: 15,
          offboarding_type: 'resignation',
          reason: 'Pursuing another opportunity',
          last_working_date: '2026-08-31',
          submit: true,
        }),
        actor,
        { ip_address: null, user_agent: null },
      );
    });
  });
});
