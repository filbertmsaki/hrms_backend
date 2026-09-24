import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceCorrectionRequest } from './entities/attendance-correction-request.entity';
import { EmployeeProfileUpdateRequest } from './entities/employee-profile-update-request.entity';
import { SelfServiceRequestStatusEnum } from './enums/self-service-request-status.enum';
import { CreateAttendanceCorrectionRequestDto } from './dtos/create-attendance-correction-request.dto';
import { QuerySelfServiceRequestDto } from './dtos/query-self-service-request.dto';
import { CreateProfileUpdateRequestDto } from './dtos/create-profile-update-request.dto';
import { TeamAttendanceQueryDto } from './dtos/team-attendance-query.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { UsersService } from '../../users/users.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveService } from '../leave/leave.service';
import { CancelLeaveRequestDto } from '../leave/dtos/cancel-leave-request.dto';
import { LeaveBalanceQueryDto } from '../leave/dtos/leave-balance-query.dto';
import { LeaveRequestQueryDto } from '../leave/dtos/leave-request-query.dto';
import { CreateLeaveRequestDto } from '../leave/dtos/create-leave-request.dto';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { AttendanceDailySummaryService } from '../attendance/processing/attendance-daily-summary.service';
import { QueryAttendanceDailySummariesDto } from '../attendance/processing/dtos/query-attendance-daily-summaries.dto';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../attendance/processing/enums/attendance-daily-status.enum';
import { AttendanceMobilePunchesService } from '../attendance/mobile-punches/attendance-mobile-punches.service';
import { AttendanceMobilePunchQueryDto } from '../attendance/mobile-punches/dtos/attendance-mobile-punch-query.dto';
import { AttendanceMobilePunch } from '../attendance/mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendancePunchTypeEnum } from '../attendance/mobile-punches/enums/attendance-punch-type.enum';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { AttendanceScheduleResolverService } from '../attendance/processing/attendance-schedule-resolver.service';
import { CreateMyLeaveRequestDto } from './dtos/create-my-leave-request.dto';
import { MyScheduleQueryDto } from './dtos/my-schedule-query.dto';
import { SelectDefaultAvatarDto } from '../default-avatars/dtos/select-default-avatar.dto';
import { CreateAttendanceMobilePunchDto } from '../attendance/mobile-punches/dtos/create-attendance-mobile-punch.dto';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../attendance/timetable/timetables/enums/timetable-status.enum';
import { CreateMyAttendancePunchDto } from './dtos/create-my-attendance-punch.dto';
import { MyAttendanceOverviewQueryDto } from './dtos/my-attendance-overview-query.dto';
import { MyAttendanceAssignmentQueryDto } from './dtos/my-attendance-assignment-query.dto';
import { FilesService } from '../../files/files.service';
import { ProfileChangeRequestsService } from './profile-change-requests.service';
import { ProfileChangeRequest } from './entities/profile-change-request.entity';
import { MyRequestTimelineQueryDto } from './dtos/my-request-timeline-query.dto';
import { CreateMyResignationDto } from './dtos/create-my-resignation.dto';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ActionItemQueryDto } from '../action-inbox/dtos/action-item-query.dto';
import { HrDocumentsService } from '../documents/hr-documents.service';
import { UploadDocumentDto } from '../documents/dtos/upload-document.dto';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingService } from '../offboarding/offboarding.service';
import { OffboardingTypeEnum } from '../offboarding/enums/offboarding-type.enum';
import { HrAccessService } from '../shared/hr-access.service';
import { DefaultAvatarsService } from '../default-avatars/default-avatars.service';
import { ProfileImageSourceEnum } from '../employees/enums/profile-image-source.enum';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';

type EmployeeProfileShape = {
  id?: number;
  employee_no?: string;
  profile_photo_url?: string | null;
  employment_status?: string;
  employment_type?: string;
  hire_date?: string | null;
  exit_date?: string | null;
  primary_branch?: { id: number; name: string } | null;
  primary_department?: { id: number; name: string } | null;
  primary_position?: { id: number; name: string } | null;
  manager?: {
    id: number;
    first_name?: string;
    last_name?: string;
    profile_photo_url?: string | null;
  } | null;
  [key: string]: unknown;
};

type UploadedProfilePhoto = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type WorkActivityInsightsPort = Pick<
  WorkActivityInsightsService,
  'getEmployeeSummary'
>;

const ACTIVE_PROFILE_UPDATE_REQUEST_STATUSES = [
  SelfServiceRequestStatusEnum.DRAFT,
  SelfServiceRequestStatusEnum.SUBMITTED,
];

@Injectable()
export class EmployeeSelfServiceService {
  constructor(
    private readonly usersService: UsersService,
    private readonly employeesService: EmployeesService,
    private readonly leaveService: LeaveService,
    private readonly attendanceDailySummaryService: AttendanceDailySummaryService,
    private readonly attendanceMobilePunchesService: AttendanceMobilePunchesService,
    private readonly attendanceScheduleResolverService: AttendanceScheduleResolverService,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(AttendanceMobilePunch)
    private readonly attendanceMobilePunchRepository: Repository<AttendanceMobilePunch>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(AttendanceCorrectionRequest)
    private readonly correctionRequestRepository: Repository<AttendanceCorrectionRequest>,
    @InjectRepository(EmployeeProfileUpdateRequest)
    private readonly profileUpdateRequestRepository: Repository<EmployeeProfileUpdateRequest>,
    private readonly filesService: FilesService,
    private readonly profileChangeRequestsService: ProfileChangeRequestsService,
    @InjectRepository(ProfileChangeRequest)
    private readonly profileChangeRequestRepository: Repository<ProfileChangeRequest>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    private readonly actionItemsService: ActionItemsService,
    private readonly hrDocumentsService: HrDocumentsService,
    private readonly offboardingService: OffboardingService,
    private readonly hrAccessService: HrAccessService,
    private readonly defaultAvatarsService: DefaultAvatarsService,
    @Optional()
    @Inject(WorkActivityInsightsService)
    private readonly workActivityInsightsService: WorkActivityInsightsPort = {
      getEmployeeSummary: () =>
        Promise.resolve({
          reports_submitted: 0,
          approved_reports: 0,
          reviewed_visits: 0,
          open_follow_ups: 0,
          open_exceptions: 0,
        }),
    },
  ) {}

  async getMyActionItems(actor: AuthenticatedUser, query: ActionItemQueryDto) {
    return this.actionItemsService.findMine(actor, query);
  }

  async getMyRequestTimeline(
    actor: AuthenticatedUser,
    query: MyRequestTimelineQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const [
      leaveRequests,
      attendanceCorrections,
      profileChanges,
      onboardingRequests,
      offboardingRequests,
    ] = await Promise.all([
      this.leaveRequestRepository.find({
        where: { company_id: companyId, employee_id: employeeId },
        order: { created_at: 'DESC' },
        take: 100,
      }),
      this.correctionRequestRepository.find({
        where: { companyId, employeeId },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      this.profileChangeRequestRepository.find({
        where: { company_id: companyId, employee_id: employeeId },
        order: { created_at: 'DESC' },
        take: 100,
      }),
      this.onboardingRequestRepository.find({
        where: { company_id: companyId, employee_id: employeeId },
        order: { created_at: 'DESC' },
        take: 20,
      }),
      this.offboardingRequestRepository.find({
        where: { company_id: companyId, employee_id: employeeId },
        order: { created_at: 'DESC' },
        take: 20,
      }),
    ]);

    const items = [
      ...leaveRequests.map((request) => ({
        source: 'leave',
        type: 'LEAVE_REQUEST',
        id: request.id,
        reference: request.leave_no,
        title: 'Leave request',
        status: request.status,
        submitted_at: request.applied_at,
        created_at: request.created_at,
        updated_at: request.updated_at,
        action_url: `/me/leave/requests/${request.id}`,
        summary: {
          start_date: request.start_date,
          end_date: request.end_date,
          total_days: request.total_days,
        },
      })),
      ...attendanceCorrections.map((request) => ({
        source: 'attendance',
        type: 'ATTENDANCE_CORRECTION',
        id: request.id,
        reference: null,
        title: 'Attendance correction',
        status: request.status,
        submitted_at: request.submittedAt,
        created_at: request.createdAt,
        updated_at: request.updatedAt,
        action_url: `/dashboard/attendance/corrections?highlight=${request.id}`,
        summary: {
          attendance_date: request.attendanceDate,
          request_type: request.requestType,
        },
      })),
      ...profileChanges.map((request) => ({
        source: 'profile',
        type: 'PROFILE_CHANGE_REQUEST',
        id: request.id,
        reference: request.reference_number,
        title: 'Profile change request',
        status: request.status,
        submitted_at: request.submitted_at,
        created_at: request.created_at,
        updated_at: request.updated_at,
        action_url: `/me/profile-change-requests/${request.id}`,
        summary: { request_type: request.request_type },
      })),
      ...onboardingRequests.map((request) => ({
        source: 'onboarding',
        type: 'ONBOARDING_REQUEST',
        id: request.id,
        reference: request.onboarding_no,
        title: request.title,
        status: request.status,
        submitted_at: request.submitted_at,
        created_at: request.created_at,
        updated_at: request.updated_at,
        action_url: `/me/onboarding/${request.id}`,
        summary: { progress_percentage: request.progress_percentage },
      })),
      ...offboardingRequests.map((request) => ({
        source: 'offboarding',
        type: 'OFFBOARDING_REQUEST',
        id: request.id,
        reference: request.offboarding_code,
        title: request.title,
        status: request.status,
        submitted_at: request.submitted_at,
        created_at: request.created_at,
        updated_at: request.updated_at,
        action_url: `/me/offboarding/${request.id}`,
        summary: {
          last_working_date: request.last_working_date,
          offboarding_type: request.offboarding_type,
        },
      })),
    ]
      .filter((item) => !query.module || item.source === query.module)
      .filter((item) => !query.status || String(item.status) === query.status)
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() -
          new Date(left.updated_at).getTime(),
      );

    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const start = (page - 1) * limit;

    return {
      data: items.slice(start, start + limit),
      meta: {
        page,
        limit,
        total: items.length,
        total_pages: Math.ceil(items.length / limit),
      },
    };
  }

  async getMyDocuments(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);

    return this.hrDocumentsService.findForEntity(
      companyId,
      DocumentEntityTypeEnum.EMPLOYEE,
      employee.id!,
    );
  }

  async uploadMyDocument(actor: AuthenticatedUser, dto: UploadDocumentDto) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);

    return this.hrDocumentsService.upload({
      companyId,
      entityType: DocumentEntityTypeEnum.EMPLOYEE,
      entityId: employee.id!,
      module: DocumentModuleEnum.EMPLOYEE,
      documentTypeCode: dto.document_type_code ?? null,
      title: dto.title,
      description: dto.description ?? null,
      expiryDate: dto.expiry_date ? new Date(dto.expiry_date) : null,
      file: dto.file,
      uploadedByCompanyUserId: actor.companyMembershipId ?? null,
      directorySegments: ['documents', 'employees', `company-${companyId}`],
      fileNamePrefix: `employee-${employee.id}`,
    });
  }

  async downloadMyDocument(actor: AuthenticatedUser, documentId: number) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);

    const document = await this.hrDocumentsService.findOneForEntityOrFail(
      companyId,
      DocumentEntityTypeEnum.EMPLOYEE,
      employee.id!,
      documentId,
    );

    const buffer = await this.hrDocumentsService.readFile(document);
    if (!buffer) {
      throw new NotFoundException('Document file could not be read');
    }

    return {
      buffer,
      mimeType: document.mime_type ?? 'application/octet-stream',
      fileName: document.original_file_name,
    };
  }

  async getMyOnboarding(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    return this.onboardingRequestRepository.find({
      where: { company_id: companyId, employee_id: employeeId },
      order: { created_at: 'DESC' },
    });
  }

  async getMyOffboarding(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    return this.offboardingRequestRepository.find({
      where: { company_id: companyId, employee_id: employeeId },
      order: { created_at: 'DESC' },
    });
  }

  async createMyResignation(
    actor: AuthenticatedUser,
    dto: CreateMyResignationDto,
    context: { ip_address: string | null; user_agent: string | null },
  ) {
    const employeeId = await this.resolveEmployeeId(actor);

    return this.offboardingService.createOffboardingRequest(
      this.ensureCompanyId(actor),
      {
        employee_id: employeeId,
        title: 'Employee resignation',
        offboarding_type: OffboardingTypeEnum.RESIGNATION,
        reason: dto.reason,
        last_working_date: dto.last_working_date,
        notice_date: dto.notice_date,
        submit: true,
      },
      actor,
      context,
    );
  }

  async getProfile(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);
    const user = await this.usersService.findMyProfileById(actor.id, companyId);
    const pending = await this.getPendingProfileChangeSummary(
      companyId,
      employee.id!,
    );

    return {
      user,
      employee,
      pending_profile_change: pending,
      links: {
        dashboard: '/me/dashboard',
        profile: '/me/profile',
        attendance_today: '/me/attendance/today',
        attendance_overview: '/me/attendance/overview',
        attendance_history: '/me/attendance/history',
        attendance_schedule: '/me/attendance/schedule',
        attendance_assignments: '/me/attendance/assignments',
        attendance_punches: '/me/attendance/punches',
        attendance_check_in: '/me/attendance/check-in',
        attendance_check_out: '/me/attendance/check-out',
        leave_balances: '/me/leave/balances',
        leave_requests: '/me/leave/requests',
      },
    };
  }

  async getProfilePhoto(actor: AuthenticatedUser) {
    const employee = await this.requireMyEmployeeProfile(actor);
    const resolved =
      await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
        this.ensureCompanyId(actor),
        {
          id: employee.id!,
          profile_photo_url:
            (typeof employee.uploaded_profile_photo_url === 'string'
              ? employee.uploaded_profile_photo_url
              : null) ??
            (typeof employee.profile_photo_url === 'string'
              ? employee.profile_photo_url
              : null),
          profile_image_source:
            (employee.profile_photo_source as ProfileImageSourceEnum | null) ??
            null,
          default_avatar_id:
            typeof employee.default_avatar_id === 'number'
              ? employee.default_avatar_id
              : null,
          gender: typeof employee.gender === 'string' ? employee.gender : null,
        },
      );

    return {
      employee_id: employee.id ?? null,
      profile_photo_path: resolved.uploaded_profile_photo_url,
      profile_photo_url: resolved.profile_photo_url,
      profile_photo_source: resolved.profile_photo_source,
      default_avatar_id: resolved.default_avatar_id,
    };
  }

  async uploadProfilePhoto(
    actor: AuthenticatedUser,
    file: UploadedProfilePhoto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);
    const employeeId = employee.id!;
    const storedFile = await this.filesService.saveBufferFile({
      buffer: file.buffer,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      directorySegments: ['profile-photos', `company-${companyId}`],
      fileNamePrefix: `employee-${employeeId}`,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    try {
      const updatedEmployee = await this.employeesService.updateMyProfilePhoto(
        companyId,
        actor.id,
        storedFile.publicPath,
      );

      await this.filesService.removeManagedFile(employee.profile_photo_url);

      return {
        message: 'Profile picture uploaded successfully.',
        profile_photo_url: storedFile.publicPath,
        employee: updatedEmployee,
      };
    } catch (error) {
      await this.filesService.removeManagedFile(storedFile.publicPath);
      throw error;
    }
  }

  async listAvailableProfileAvatars(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);

    return this.employeesService.listMyAvailableDefaultAvatars(
      companyId,
      actor.id,
    );
  }

  async selectProfileAvatar(
    actor: AuthenticatedUser,
    dto: SelectDefaultAvatarDto,
  ) {
    const companyId = this.ensureCompanyId(actor);

    return this.employeesService.selectMyDefaultAvatar(
      companyId,
      actor.id,
      dto.default_avatar_id ?? null,
    );
  }

  async getStatus(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);
    const [user, todayAttendance] = await Promise.all([
      this.usersService.findMyProfileById(actor.id, companyId),
      this.getTodayAttendance(actor),
    ]);
    const pending = await this.getPendingProfileChangeSummary(
      companyId,
      employee.id!,
    );

    return {
      account_status: user.status ?? null,
      employment_status: employee?.employment_status ?? null,
      employment_type: employee?.employment_type ?? null,
      employee_no: employee?.employee_no ?? actor.employeeNo ?? null,
      company: user.active_company ?? null,
      branch: employee?.primary_branch ?? null,
      department: employee?.primary_department ?? null,
      position: employee?.primary_position ?? null,
      manager: this.mapManager(employee),
      roles: (user.roles ?? [])
        .map((role) => role.name ?? role.display_name)
        .filter(Boolean),
      permissions: (user.permissions ?? [])
        .map((permission) => permission.name ?? permission.display_name)
        .filter(Boolean),
      attendance: {
        date: todayAttendance.date,
        summary_status: todayAttendance.summary?.attendance_status ?? null,
        punch_state: todayAttendance.punch_state,
        processing_state: todayAttendance.processing_state,
        has_activity: todayAttendance.punches.length > 0,
      },
      action_flags: {
        has_employee_profile: !!employee,
        can_check_in: todayAttendance.action_flags.can_check_in,
        can_check_out: todayAttendance.action_flags.can_check_out,
        can_request_leave:
          (employee?.employment_status ?? '').toLowerCase() === 'active',
      },
      pending_profile_change: pending,
    };
  }

  async getDashboard(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);
    const today = this.getCurrentDateString();
    const lastThirtyDaysStart = this.addDays(today, -29);
    const currentFiscalYear = this.getFiscalYear(today);

    const [
      user,
      todayAttendance,
      attendanceHistory,
      attendanceStats,
      leaveBalances,
      recentLeaveRequests,
      pendingLeaveCounts,
      upcomingApprovedLeave,
      schedulePreview,
      workActivitySummary,
    ] = await Promise.all([
      this.usersService.findMyProfileById(actor.id, companyId),
      this.getTodayAttendance(actor),
      this.attendanceDailySummaryService.findDailySummaries(companyId, {
        employee_id: employeeId,
        from_date: lastThirtyDaysStart,
        to_date: today,
        page: 1,
        limit: 5,
      }),
      this.buildAttendanceStats(
        companyId,
        employeeId,
        lastThirtyDaysStart,
        today,
      ),
      this.getLeaveBalances(actor, {
        fiscal_year: currentFiscalYear,
        page: 1,
        limit: 50,
      }),
      this.leaveService.findMyLeaveRequests(
        companyId,
        { page: 1, limit: 5, sortBy: 'created_at' } as LeaveRequestQueryDto,
        actor,
      ),
      this.buildLeaveCounts(companyId, employeeId),
      this.findUpcomingApprovedLeave(companyId, employeeId, today),
      this.getAttendanceSchedule(actor, { from_date: today, days: 7 }),
      this.workActivityInsightsService.getEmployeeSummary(actor),
    ]);
    const pending = await this.getPendingProfileChangeSummary(
      companyId,
      employee.id!,
    );

    return {
      generated_at: new Date().toISOString(),
      user,
      employee,
      status: {
        account_status: user.status ?? null,
        employment_status: employee?.employment_status ?? null,
        employment_type: employee?.employment_type ?? null,
      },
      attendance_today: todayAttendance,
      attendance_overview: {
        recent_history: attendanceHistory.data,
        stats_last_30_days: attendanceStats,
      },
      leave: {
        balances: leaveBalances.data,
        balance_meta: leaveBalances.meta,
        current_fiscal_year: currentFiscalYear,
        counts: pendingLeaveCounts,
        recent_requests: recentLeaveRequests.data,
        upcoming_approved_leave: upcomingApprovedLeave,
      },
      schedule_preview: schedulePreview,
      work_activities: workActivitySummary,
      action_flags: {
        can_check_in: todayAttendance.action_flags.can_check_in,
        can_check_out: todayAttendance.action_flags.can_check_out,
        can_request_leave:
          (employee?.employment_status ?? '').toLowerCase() === 'active',
        has_employee_profile: !!employee,
      },
      pending_profile_change: pending,
      links: {
        profile: '/me/profile',
        status: '/me/status',
        attendance_today: '/me/attendance/today',
        attendance_overview: '/me/attendance/overview',
        attendance_history: '/me/attendance/history',
        attendance_schedule: '/me/attendance/schedule',
        attendance_assignments: '/me/attendance/assignments',
        attendance_punches: '/me/attendance/punches',
        attendance_check_in: '/me/attendance/check-in',
        attendance_check_out: '/me/attendance/check-out',
        daily_activities: '/me/activities',
        field_visits: '/me/field-visits',
        leave_balances: '/me/leave/balances',
        leave_requests: '/me/leave/requests',
      },
    };
  }

  async getTodayAttendance(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const today = this.getCurrentDateString();
    const [summaryResponse, punches] = await Promise.all([
      this.attendanceDailySummaryService.findDailySummaries(companyId, {
        employee_id: employeeId,
        from_date: today,
        to_date: today,
        page: 1,
        limit: 1,
      }),
      this.findAttendancePunchesForDate(companyId, employeeId, today),
    ]);

    const summary = summaryResponse.data[0] ?? null;
    const punchState = this.resolvePunchState(punches);
    const firstPunch = punches[0] ?? null;
    const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null;

    return {
      date: today,
      summary: summary
        ? {
            id: summary.id,
            attendance_status: summary.attendanceStatus,
            schedule_start_at: summary.scheduleStartAt,
            schedule_end_at: summary.scheduleEndAt,
            check_in_at: summary.checkInAt,
            check_out_at: summary.checkOutAt,
            work_minutes: summary.workMinutes,
            late_minutes: summary.lateMinutes,
            early_departure_minutes: summary.earlyDepartureMinutes,
            overtime_minutes: summary.overtimeMinutes,
            timezone: summary.timezone,
            flags: summary.flags ?? null,
          }
        : null,
      punches: punches.map((punch) => this.mapPunch(punch)),
      first_punch: firstPunch ? this.mapPunch(firstPunch) : null,
      last_punch: lastPunch ? this.mapPunch(lastPunch) : null,
      punch_state: punchState,
      processing_state: summary
        ? 'processed'
        : punches.length > 0
          ? 'pending_processing'
          : 'no_activity',
      action_flags: {
        can_check_in:
          punchState !== 'checked_in' &&
          (!summary ||
            ![
              AttendanceDailyStatusEnum.LEAVE,
              AttendanceDailyStatusEnum.SICK_LEAVE,
              AttendanceDailyStatusEnum.ANNUAL_LEAVE,
              AttendanceDailyStatusEnum.UNPAID_LEAVE,
              AttendanceDailyStatusEnum.HOLIDAY,
            ].includes(summary.attendanceStatus as AttendanceDailyStatusEnum)),
        can_check_out: punchState === 'checked_in',
      },
    };
  }

  async getAttendanceHistory(
    actor: AuthenticatedUser,
    query: QueryAttendanceDailySummariesDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    return this.attendanceDailySummaryService.findDailySummaries(companyId, {
      ...query,
      employee_id: employeeId,
    });
  }

  async getAttendancePunches(
    actor: AuthenticatedUser,
    query: AttendanceMobilePunchQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    return this.attendanceMobilePunchesService.findAll(companyId, {
      ...query,
      employeeId,
    });
  }

  async getAttendanceSchedule(
    actor: AuthenticatedUser,
    query: MyScheduleQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const { fromDate, toDate } = this.resolveScheduleRange(query);

    const [shiftSchedules, assignments, timetables] = await Promise.all([
      this.shiftScheduleRepository.find({
        where: {
          companyId,
          employeeId,
        },
        relations: {
          shift: true,
          overrideShift: true,
          holiday: true,
        },
        order: {
          scheduleDate: 'ASC',
        },
      }),
      this.shiftAssignmentRepository.find({
        where: {
          companyId,
          employeeId,
          status: ShiftAssignmentStatusEnum.ACTIVE,
        },
        relations: {
          shift: true,
        },
        order: {
          effectiveFrom: 'DESC',
        },
      }),
      this.employeeTimetableRepository.find({
        where: {
          companyId,
          employeeId,
          status: EmployeeTimetableStatusEnum.ACTIVE,
        },
        relations: {
          timetable: true,
        },
        order: {
          effectiveFrom: 'DESC',
        },
      }),
    ]);

    const days = await Promise.all(
      this.buildDateRange(fromDate, toDate).map(async (date) => {
        const resolved =
          await this.attendanceScheduleResolverService.resolveForDate(
            companyId,
            employeeId,
            date,
          );
        const explicit = shiftSchedules.find((item) =>
          this.isDateWithinRange(
            date,
            item.effectiveFrom ?? item.scheduleDate,
            item.effectiveTo ?? item.scheduleDate,
          ),
        );
        if (explicit) {
          return {
            date,
            source: 'shift_schedule',
            is_off_day: resolved.isOffDay,
            holiday: this.mapResolvedHoliday(resolved, explicit.holiday, date),
            shift: await this.mapResolvedScheduleShift(companyId, resolved),
            timetable: null,
            remarks: explicit.remarks ?? null,
          };
        }

        const assignment = assignments.find((item) =>
          this.isDateWithinRange(date, item.effectiveFrom, item.effectiveTo),
        );
        if (assignment) {
          return {
            date,
            source: 'shift_assignment',
            is_off_day: resolved.isOffDay,
            holiday: this.mapResolvedHoliday(resolved, null, date),
            shift: await this.mapResolvedScheduleShift(companyId, resolved),
            timetable: null,
            remarks: null,
            assignment_window: {
              effective_from: assignment.effectiveFrom,
              effective_to: assignment.effectiveTo,
            },
          };
        }

        const timetable = timetables.find((item) =>
          this.isDateWithinRange(date, item.effectiveFrom, item.effectiveTo),
        );
        if (timetable) {
          return {
            date,
            source: 'employee_timetable',
            is_off_day: resolved.isOffDay,
            holiday: this.mapResolvedHoliday(resolved, null, date),
            shift: await this.mapResolvedScheduleShift(companyId, resolved),
            timetable: {
              id: timetable.timetable.id,
              name: timetable.timetable.name,
              code: timetable.timetable.code,
              timezone: timetable.timetable.timezone,
            },
            remarks: null,
            assignment_window: {
              effective_from: timetable.effectiveFrom,
              effective_to: timetable.effectiveTo,
            },
          };
        }

        if (resolved.source === 'COMPANY_DEFAULT_TIMETABLE') {
          return {
            date,
            source: 'default_timetable',
            is_off_day: resolved.isOffDay,
            holiday: this.mapResolvedHoliday(resolved, null, date),
            shift: await this.mapResolvedScheduleShift(companyId, resolved),
            timetable: await this.mapResolvedScheduleTimetable(
              companyId,
              resolved.timetableId,
            ),
            remarks: null,
          };
        }

        return {
          date,
          source: 'unassigned',
          is_off_day: resolved.isOffDay,
          holiday: this.mapResolvedHoliday(resolved, null, date),
          shift: null,
          timetable: null,
          remarks: null,
        };
      }),
    );

    return {
      from_date: fromDate,
      to_date: toDate,
      days,
    };
  }

  async getLeaveBalances(
    actor: AuthenticatedUser,
    query: LeaveBalanceQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const currentFiscalYear = this.getFiscalYear(this.getCurrentDateString());
    const response = await this.leaveService.findAllLeaveBalances(
      companyId,
      {
        ...query,
        employee_id: employeeId,
        fiscal_year: query.fiscal_year?.trim() || currentFiscalYear,
      },
      actor,
    );

    const leaveBalances: Array<Record<string, unknown>> = Array.isArray(
      response.data,
    )
      ? (((response.data[0] as { leave_balances?: unknown[] } | undefined)
          ?.leave_balances as Array<Record<string, unknown>> | undefined) ?? [])
      : [];

    const totals = leaveBalances.reduce(
      (acc: Record<string, number>, item) => {
        acc.allocated_days += this.toNumber(item.allocated_days);
        acc.opening_balance_days += this.toNumber(item.opening_balance_days);
        acc.entitlement_days += this.toNumber(item.entitlement_days);
        acc.used_days += this.toNumber(item.used_days);
        acc.pending_days += this.toNumber(item.pending_days);
        acc.carried_forward_days += this.toNumber(item.carried_forward_days);
        acc.expired_days += this.toNumber(item.expired_days);
        acc.adjusted_days += this.toNumber(item.adjusted_days);
        acc.attendance_deduction_days += this.toNumber(
          item.attendance_deduction_days,
        );
        acc.available_days += this.toNumber(item.available_days);
        return acc;
      },
      {
        allocated_days: 0,
        opening_balance_days: 0,
        entitlement_days: 0,
        used_days: 0,
        pending_days: 0,
        carried_forward_days: 0,
        expired_days: 0,
        adjusted_days: 0,
        attendance_deduction_days: 0,
        available_days: 0,
      },
    );

    return {
      ...response,
      current_fiscal_year: query.fiscal_year?.trim() || currentFiscalYear,
      totals,
    };
  }

  async getLeaveRequests(
    actor: AuthenticatedUser,
    query: LeaveRequestQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    return this.leaveService.findMyLeaveRequests(companyId, query, actor);
  }

  async getLeaveRequest(actor: AuthenticatedUser, leaveRequestId: number) {
    const companyId = this.ensureCompanyId(actor);
    await this.ensureOwnLeaveRequest(companyId, actor, leaveRequestId);
    return this.leaveService.findOneLeaveRequest(
      companyId,
      leaveRequestId,
      actor,
    );
  }

  async createLeaveRequest(
    actor: AuthenticatedUser,
    dto: CreateMyLeaveRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const payload: CreateLeaveRequestDto = {
      employee_id: employeeId,
      leave_type_id: dto.leave_type_id,
      start_date: dto.start_date,
      end_date: dto.end_date,
      reason: dto.reason,
      submit: dto.submit,
    };

    return this.leaveService.createLeaveRequest(companyId, payload, actor);
  }

  async submitLeaveRequest(actor: AuthenticatedUser, leaveRequestId: number) {
    const companyId = this.ensureCompanyId(actor);
    await this.ensureOwnLeaveRequest(companyId, actor, leaveRequestId);
    return this.leaveService.submitLeaveRequest(
      companyId,
      leaveRequestId,
      actor,
    );
  }

  async cancelLeaveRequest(
    actor: AuthenticatedUser,
    leaveRequestId: number,
    dto: CancelLeaveRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    await this.ensureOwnLeaveRequest(companyId, actor, leaveRequestId);
    return this.leaveService.cancelLeaveRequest(
      companyId,
      leaveRequestId,
      dto,
      actor,
    );
  }

  async getLeaveRequestPdf(actor: AuthenticatedUser, leaveRequestId: number) {
    const companyId = this.ensureCompanyId(actor);
    await this.ensureOwnLeaveRequest(companyId, actor, leaveRequestId);
    return this.leaveService.getLeaveRequestPdf(
      companyId,
      leaveRequestId,
      actor,
    );
  }

  // ─── Attendance Correction Requests ────────────────────────────────────────

  async listMyCorrectionRequests(
    actor: AuthenticatedUser,
    query: QuerySelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.correctionRequestRepository
      .createQueryBuilder('r')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.employeeId = :employeeId', { employeeId })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    if (query.date_from) {
      qb.andWhere('r.attendanceDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('r.attendanceDate <= :dateTo', { dateTo: query.date_to });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((r) => this.mapCorrectionRequest(r)),
      meta: this.buildSelfServicePaginationMeta(total, page, limit),
    };
  }

  async getMyCorrectionRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const request = await this.correctionRequestRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Attendance correction request not found.');
    }

    return this.mapCorrectionRequest(request);
  }

  async createMyCorrectionRequest(
    actor: AuthenticatedUser,
    dto: CreateAttendanceCorrectionRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const request = this.correctionRequestRepository.create({
      companyId,
      employeeId,
      attendanceDate: dto.attendance_date,
      requestType: dto.request_type,
      requestedCheckInAt: dto.requested_check_in_at
        ? new Date(dto.requested_check_in_at)
        : null,
      requestedCheckOutAt: dto.requested_check_out_at
        ? new Date(dto.requested_check_out_at)
        : null,
      requestedStatus: dto.requested_status ?? null,
      reason: dto.reason ?? null,
      status: SelfServiceRequestStatusEnum.DRAFT,
    });

    const saved = await this.correctionRequestRepository.save(request);
    return this.mapCorrectionRequest(saved);
  }

  async submitMyCorrectionRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const request = await this.correctionRequestRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Attendance correction request not found.');
    }

    if (request.status !== SelfServiceRequestStatusEnum.DRAFT) {
      throw new BadRequestException(
        `Cannot submit a request in status '${request.status}'.`,
      );
    }

    request.status = SelfServiceRequestStatusEnum.SUBMITTED;
    request.submittedAt = new Date();
    const saved = await this.correctionRequestRepository.save(request);
    return this.mapCorrectionRequest(saved);
  }

  async cancelMyCorrectionRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const request = await this.correctionRequestRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Attendance correction request not found.');
    }

    if (
      request.status !== SelfServiceRequestStatusEnum.DRAFT &&
      request.status !== SelfServiceRequestStatusEnum.SUBMITTED
    ) {
      throw new BadRequestException(
        `Cannot cancel a request in status '${request.status}'.`,
      );
    }

    request.status = SelfServiceRequestStatusEnum.CANCELLED;
    request.cancelledAt = new Date();
    const saved = await this.correctionRequestRepository.save(request);
    return this.mapCorrectionRequest(saved);
  }

  private mapCorrectionRequest(r: AttendanceCorrectionRequest) {
    return {
      id: r.id,
      employee_id: r.employeeId,
      attendance_date: r.attendanceDate,
      request_type: r.requestType,
      requested_check_in_at: r.requestedCheckInAt,
      requested_check_out_at: r.requestedCheckOutAt,
      requested_status: r.requestedStatus,
      reason: r.reason,
      status: r.status,
      submitted_at: r.submittedAt,
      cancelled_at: r.cancelledAt,
      reviewed_by_company_user_id: r.reviewedByCompanyUserId,
      reviewed_at: r.reviewedAt,
      review_comment: r.reviewComment,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    };
  }

  // ─── Profile Update Requests ────────────────────────────────────────────────

  async listMyProfileUpdateRequests(
    actor: AuthenticatedUser,
    query: QuerySelfServiceRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.profileUpdateRequestRepository
      .createQueryBuilder('r')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.employeeId = :employeeId', { employeeId })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((r) => this.mapProfileUpdateRequest(r)),
      meta: this.buildSelfServicePaginationMeta(total, page, limit),
    };
  }

  async getMyProfileUpdateRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const request = await this.profileUpdateRequestRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Profile update request not found.');
    }

    return this.mapProfileUpdateRequest(request);
  }

  async createMyProfileUpdateRequest(
    actor: AuthenticatedUser,
    dto: CreateProfileUpdateRequestDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const request = this.profileUpdateRequestRepository.create({
      companyId,
      employeeId,
      requestedChanges: dto.requested_changes,
      reason: dto.reason ?? null,
      status: SelfServiceRequestStatusEnum.DRAFT,
    });

    const saved = await this.profileUpdateRequestRepository.save(request);
    return this.mapProfileUpdateRequest(saved);
  }

  async submitMyProfileUpdateRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const request = await this.profileUpdateRequestRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Profile update request not found.');
    }

    if (request.status !== SelfServiceRequestStatusEnum.DRAFT) {
      throw new BadRequestException(
        `Cannot submit a request in status '${request.status}'.`,
      );
    }

    request.status = SelfServiceRequestStatusEnum.SUBMITTED;
    request.submittedAt = new Date();
    const saved = await this.profileUpdateRequestRepository.save(request);
    return this.mapProfileUpdateRequest(saved);
  }

  async cancelMyProfileUpdateRequest(actor: AuthenticatedUser, id: number) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);
    const request = await this.profileUpdateRequestRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!request) {
      throw new NotFoundException('Profile update request not found.');
    }

    if (
      request.status !== SelfServiceRequestStatusEnum.DRAFT &&
      request.status !== SelfServiceRequestStatusEnum.SUBMITTED
    ) {
      throw new BadRequestException(
        `Cannot cancel a request in status '${request.status}'.`,
      );
    }

    request.status = SelfServiceRequestStatusEnum.CANCELLED;
    request.cancelledAt = new Date();
    const saved = await this.profileUpdateRequestRepository.save(request);
    return this.mapProfileUpdateRequest(saved);
  }

  private mapProfileUpdateRequest(r: EmployeeProfileUpdateRequest) {
    return {
      id: r.id,
      employee_id: r.employeeId,
      requested_changes: r.requestedChanges,
      reason: r.reason,
      status: r.status,
      submitted_at: r.submittedAt,
      cancelled_at: r.cancelledAt,
      reviewed_by_company_user_id: r.reviewedByCompanyUserId,
      reviewed_at: r.reviewedAt,
      review_comment: r.reviewComment,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    };
  }

  // ─── Manager / Team Attendance ──────────────────────────────────────────────

  async getMyTeamAttendance(
    actor: AuthenticatedUser,
    query: TeamAttendanceQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (accessibleEmployeeIds !== null && accessibleEmployeeIds.length === 0) {
      return {
        data: [],
        meta: this.buildSelfServicePaginationMeta(0, page, limit),
      };
    }

    const qb = this.attendanceDailySummaryRepository
      .createQueryBuilder('s')
      .where('s.companyId = :companyId', { companyId })
      .orderBy('s.attendanceDate', 'DESC')
      .addOrderBy('s.employeeId', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (accessibleEmployeeIds !== null) {
      qb.andWhere('s.employeeId IN (:...employeeIds)', {
        employeeIds: accessibleEmployeeIds,
      });
    }

    if (query.date_from) {
      qb.andWhere('s.attendanceDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('s.attendanceDate <= :dateTo', { dateTo: query.date_to });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((s) => ({
        id: s.id,
        employee_id: s.employeeId,
        attendance_date: s.attendanceDate,
        status: s.attendanceStatus,
        check_in_at: s.checkInAt,
        check_out_at: s.checkOutAt,
        work_minutes: s.workMinutes,
        late_minutes: s.lateMinutes,
        overtime_minutes: s.overtimeMinutes,
        early_departure_minutes: s.earlyDepartureMinutes,
      })),
      meta: this.buildSelfServicePaginationMeta(total, page, limit),
    };
  }

  private buildSelfServicePaginationMeta(
    total: number,
    page: number,
    limit: number,
  ) {
    const totalPages = Math.ceil(total / limit);
    return {
      total,
      count: Math.min(limit, total - (page - 1) * limit),
      limit,
      page,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_previous_page: page > 1,
    };
  }

  private ensureCompanyId(actor: AuthenticatedUser): number {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    return actor.companyId;
  }

  private async getPendingProfileChangeSummary(
    companyId: number,
    employeeId: number,
  ) {
    try {
      return await this.profileChangeRequestsService.getPendingSummary(
        companyId,
        employeeId,
      );
    } catch (error) {
      if (!this.isMissingLegacyProfileChangeTableError(error)) {
        throw error;
      }

      try {
        const count = await this.profileUpdateRequestRepository.count({
          where: {
            companyId,
            employeeId,
            status: In(ACTIVE_PROFILE_UPDATE_REQUEST_STATUSES),
          },
        });

        return {
          has_pending_profile_change: count > 0,
          pending_request_count: count,
        };
      } catch {
        throw new ServiceUnavailableException(
          'Profile change request data is not available. Please complete the self-service profile request setup.',
        );
      }
    }
  }

  private isMissingLegacyProfileChangeTableError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    return /relation "profile_change_requests" does not exist/i.test(
      error.message,
    );
  }

  private async findMyEmployeeProfile(
    actor: AuthenticatedUser,
  ): Promise<EmployeeProfileShape | null> {
    const companyId = this.ensureCompanyId(actor);

    try {
      const employee = (await this.employeesService.findMyProfile(
        companyId,
        actor.id,
      )) as EmployeeProfileShape;

      return employee;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }

      throw error;
    }
  }

  private async requireMyEmployeeProfile(
    actor: AuthenticatedUser,
  ): Promise<EmployeeProfileShape> {
    const employee = await this.findMyEmployeeProfile(actor);

    if (!employee?.id) {
      throw new NotFoundException(
        'Employee profile not found for the current company user.',
      );
    }

    return employee;
  }

  private async resolveEmployeeId(actor: AuthenticatedUser): Promise<number> {
    if (actor.employeeId) {
      return actor.employeeId;
    }

    const employee = await this.requireMyEmployeeProfile(actor);
    return employee.id!;
  }

  private async findAttendancePunchesForDate(
    companyId: number,
    employeeId: number,
    date: string,
  ): Promise<AttendanceMobilePunch[]> {
    return this.attendanceMobilePunchRepository.find({
      where: {
        companyId,
        employeeId,
        attendanceDate: date,
      },
      order: {
        punchTime: 'ASC',
      },
    });
  }

  private resolvePunchState(punches: AttendanceMobilePunch[]) {
    if (!punches.length) {
      return 'not_checked_in';
    }

    const lastPunch = punches[punches.length - 1];

    if (lastPunch.punchType === AttendancePunchTypeEnum.CHECK_IN) {
      return 'checked_in';
    }

    return 'checked_out';
  }

  private mapPunch(punch: AttendanceMobilePunch) {
    return {
      id: punch.id,
      punch_type: punch.punchType,
      punch_time: punch.punchTime,
      attendance_date: punch.attendanceDate,
      validation_status: punch.validationStatus,
      validation_message: punch.validationMessage,
      branch_id: punch.branchId,
      latitude: punch.latitude,
      longitude: punch.longitude,
      distance_from_geofence_meters: punch.distanceFromGeofenceMeters,
      wifi_ssid: punch.wifiSsid,
      wifi_bssid: punch.wifiBssid,
      ip_address: punch.ipAddress,
      is_override_requested: punch.isOverrideRequested,
      override_reason: punch.overrideReason,
      override_reviewed_at: punch.overrideReviewedAt,
      override_review_note: punch.overrideReviewNote,
      is_processed: punch.isProcessed,
    };
  }

  private mapManager(employee: EmployeeProfileShape | null) {
    if (!employee?.manager) {
      return null;
    }

    const manager = employee.manager;
    return {
      id: manager.id,
      name: [manager.first_name, manager.last_name].filter(Boolean).join(' '),
      profile_photo_url: manager.profile_photo_url ?? null,
    };
  }

  private mapShift(
    shift:
      | {
          id: number;
          name: string;
          code: string;
          startTime: string;
          endTime: string;
          expectedWorkMinutes: number;
          requiresCheckout: boolean;
          allowOvertime: boolean;
          crossesMidnight: boolean;
        }
      | null
      | undefined,
  ) {
    if (!shift) {
      return null;
    }

    return {
      id: shift.id,
      name: shift.name,
      code: shift.code,
      start_time: shift.startTime,
      end_time: shift.endTime,
      expected_work_minutes: shift.expectedWorkMinutes,
      requires_checkout: shift.requiresCheckout,
      allow_overtime: shift.allowOvertime,
      crosses_midnight: shift.crossesMidnight,
    };
  }

  private resolveScheduleRange(query: MyScheduleQueryDto) {
    const today = this.getCurrentDateString();
    const fromDate = query.from_date ?? today;
    const days = query.days ?? 7;
    const toDate = query.to_date ?? this.addDays(fromDate, days - 1);

    if (toDate < fromDate) {
      throw new BadRequestException(
        'to_date cannot be earlier than from_date.',
      );
    }

    return { fromDate, toDate };
  }

  private isDateWithinRange(
    targetDate: string,
    startDate: string,
    endDate: string | null,
  ) {
    return targetDate >= startDate && (!endDate || targetDate <= endDate);
  }

  private buildDateRange(startDate: string, endDate: string) {
    const dates: string[] = [];
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    for (
      let cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      dates.push(cursor.toISOString().slice(0, 10));
    }

    return dates;
  }

  private getCurrentDateString(timezone = this.getSelfServiceTimezone()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }

  private getSelfServiceTimezone() {
    return process.env.DEFAULT_TIMEZONE || 'Africa/Dar_es_Salaam';
  }

  private addDays(baseDate: string, days: number) {
    const next = new Date(`${baseDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  }

  private getFiscalYear(date: string) {
    return String(new Date(`${date}T00:00:00.000Z`).getUTCFullYear());
  }

  private async buildAttendanceStats(
    companyId: number,
    employeeId: number,
    fromDate: string,
    toDate: string,
  ) {
    const raw = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .select('COUNT(*)', 'total_days')
      .addSelect(
        `SUM(CASE WHEN summary.attendance_status = :presentStatus THEN 1 ELSE 0 END)`,
        'present_days',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendance_status = :absentStatus THEN 1 ELSE 0 END)`,
        'absent_days',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendance_status = :halfDayStatus THEN 1 ELSE 0 END)`,
        'half_days',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendance_status IN ('LEAVE','SICK_LEAVE','ANNUAL_LEAVE','UNPAID_LEAVE') THEN 1 ELSE 0 END)`,
        'leave_days',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendance_status = :noShiftStatus THEN 1 ELSE 0 END)`,
        'incomplete_days',
      )
      .addSelect(
        `SUM(CASE WHEN summary.late_minutes > 0 THEN 1 ELSE 0 END)`,
        'late_days',
      )
      .addSelect(
        `SUM(CASE WHEN summary.overtime_minutes > 0 THEN 1 ELSE 0 END)`,
        'overtime_days',
      )
      .where('summary.company_id = :companyId', { companyId })
      .andWhere('summary.employee_id = :employeeId', { employeeId })
      .andWhere('summary.attendance_date >= :fromDate', { fromDate })
      .andWhere('summary.attendance_date <= :toDate', { toDate })
      .setParameters({
        presentStatus: AttendanceDailyStatusEnum.PRESENT,
        absentStatus: AttendanceDailyStatusEnum.ABSENT,
        halfDayStatus: AttendanceDailyStatusEnum.HALF_DAY,
        noShiftStatus: AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE,
      })
      .getRawOne<{
        total_days: string | null;
        present_days: string | null;
        absent_days: string | null;
        half_days: string | null;
        leave_days: string | null;
        incomplete_days: string | null;
        late_days: string | null;
        overtime_days: string | null;
      }>();

    return {
      from_date: fromDate,
      to_date: toDate,
      total_days: Number(raw?.total_days ?? 0),
      present_days: Number(raw?.present_days ?? 0),
      absent_days: Number(raw?.absent_days ?? 0),
      half_days: Number(raw?.half_days ?? 0),
      leave_days: Number(raw?.leave_days ?? 0),
      incomplete_days: Number(raw?.incomplete_days ?? 0),
      late_days: Number(raw?.late_days ?? 0),
      overtime_days: Number(raw?.overtime_days ?? 0),
    };
  }

  private async buildLeaveCounts(companyId: number, employeeId: number) {
    const rows = await this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .select('leaveRequest.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .groupBy('leaveRequest.status')
      .getRawMany<{ status: string; count: string }>();

    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.count);
      return acc;
    }, {});

    return {
      draft: counts[LeaveStatusEnum.DRAFT] ?? 0,
      submitted: counts[LeaveStatusEnum.SUBMITTED] ?? 0,
      in_review: counts[LeaveStatusEnum.IN_REVIEW] ?? 0,
      pending_department_manager:
        counts[LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER] ?? 0,
      pending_hr: counts[LeaveStatusEnum.PENDING_HR] ?? 0,
      returned_for_correction:
        counts[LeaveStatusEnum.RETURNED_FOR_CORRECTION] ?? 0,
      approved: counts[LeaveStatusEnum.APPROVED] ?? 0,
      rejected: counts[LeaveStatusEnum.REJECTED] ?? 0,
      cancelled: counts[LeaveStatusEnum.CANCELLED] ?? 0,
      pending_total:
        (counts[LeaveStatusEnum.SUBMITTED] ?? 0) +
        (counts[LeaveStatusEnum.IN_REVIEW] ?? 0) +
        (counts[LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER] ?? 0) +
        (counts[LeaveStatusEnum.PENDING_HR] ?? 0) +
        (counts[LeaveStatusEnum.RETURNED_FOR_CORRECTION] ?? 0),
    };
  }

  private async findUpcomingApprovedLeave(
    companyId: number,
    employeeId: number,
    today: string,
  ) {
    const items = await this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .leftJoinAndSelect('leaveRequest.leave_type', 'leaveType')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status = :status', {
        status: LeaveStatusEnum.APPROVED,
      })
      .andWhere('leaveRequest.end_date >= :today', { today })
      .orderBy('leaveRequest.start_date', 'ASC')
      .limit(5)
      .getMany();

    return items.map((item) => ({
      id: item.id,
      leave_no: item.leave_no,
      leave_type: item.leave_type
        ? {
            id: item.leave_type.id,
            name: item.leave_type.name,
            code: item.leave_type.code,
          }
        : null,
      start_date: item.start_date,
      end_date: item.end_date,
      total_days: item.total_days,
      status: item.status,
      approved_at: item.approved_at,
    }));
  }

  private async ensureOwnLeaveRequest(
    companyId: number,
    actor: AuthenticatedUser,
    leaveRequestId: number,
  ) {
    const employeeId = await this.resolveEmployeeId(actor);
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      select: ['id', 'employee_id'],
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found.');
    }

    if (leaveRequest.employee_id !== employeeId) {
      throw new ForbiddenException(
        'You can only manage your own leave requests.',
      );
    }
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async checkIn(
    actor: AuthenticatedUser,
    dto: CreateMyAttendancePunchDto,
    requestIp?: string | null,
    userAgent?: string | null,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const payload: CreateAttendanceMobilePunchDto = {
      ...dto,
      employeeId,
    };

    return this.attendanceMobilePunchesService.checkIn({
      companyId,
      authenticatedEmployeeId: employeeId,
      employeeId,
      dto: payload,
      requestIp,
      userAgent,
    });
  }

  async checkOut(
    actor: AuthenticatedUser,
    dto: CreateMyAttendancePunchDto,
    requestIp?: string | null,
    userAgent?: string | null,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const payload: CreateAttendanceMobilePunchDto = {
      ...dto,
      employeeId,
    };

    return this.attendanceMobilePunchesService.checkOut({
      companyId,
      authenticatedEmployeeId: employeeId,
      employeeId,
      dto: payload,
      requestIp,
      userAgent,
    });
  }

  async getAttendanceOverview(
    actor: AuthenticatedUser,
    query: MyAttendanceOverviewQueryDto,
  ) {
    this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const timezone = this.getSelfServiceTimezone();
    const today = this.getCurrentDateString(timezone);

    const fromDate = query.from_date ?? this.addDays(today, -29);
    const toDate = query.to_date ?? today;

    if (toDate < fromDate) {
      throw new BadRequestException(
        'to_date cannot be earlier than from_date.',
      );
    }

    const [todayAttendance, history, punches, schedule, assignments] =
      await Promise.all([
        this.getTodayAttendance(actor),
        this.getAttendanceHistory(actor, {
          ...query,
          employee_id: employeeId,
          from_date: fromDate,
          to_date: toDate,
          page: query.page ?? 1,
          limit: query.limit ?? 20,
        }),
        this.getAttendancePunches(actor, {
          employeeId,
          fromDate,
          toDate,
          page: 1,
          limit: 50,
        } as AttendanceMobilePunchQueryDto),
        this.getAttendanceSchedule(actor, {
          from_date: fromDate,
          to_date: toDate,
        }),
        this.getAttendanceAssignments(actor, {
          from_date: fromDate,
          to_date: toDate,
        }),
      ]);

    return {
      generated_at: new Date().toISOString(),
      timezone,
      employee_id: employeeId,
      period: {
        from_date: fromDate,
        to_date: toDate,
      },
      today: todayAttendance,
      history,
      punches,
      schedule,
      assignments,
      links: {
        today: '/me/attendance/today',
        history: '/me/attendance/history',
        punches: '/me/attendance/punches',
        schedule: '/me/attendance/schedule',
        assignments: '/me/attendance/assignments',
        check_in: '/me/attendance/check-in',
        check_out: '/me/attendance/check-out',
      },
    };
  }

  async getAttendanceAssignments(
    actor: AuthenticatedUser,
    query: MyAttendanceAssignmentQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const employeeId = await this.resolveEmployeeId(actor);

    const today = this.getCurrentDateString();
    const fromDate = query.from_date ?? this.addDays(today, -90);
    const toDate = query.to_date ?? this.addDays(today, 90);

    if (toDate < fromDate) {
      throw new BadRequestException(
        'to_date cannot be earlier than from_date.',
      );
    }

    const shiftScheduleQb = this.shiftScheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.shift', 'shift')
      .leftJoinAndSelect('schedule.overrideShift', 'overrideShift')
      .leftJoinAndSelect('schedule.holiday', 'holiday')
      .where('schedule.company_id = :companyId', { companyId })
      .andWhere('schedule.employee_id = :employeeId', { employeeId })
      .andWhere('schedule.effective_from <= :toDate', { toDate })
      .andWhere(
        '(schedule.effective_to IS NULL OR schedule.effective_to >= :fromDate)',
        { fromDate },
      )
      .orderBy('schedule.effective_from', 'ASC');

    const shiftAssignmentQb = this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.shift', 'shift')
      .leftJoinAndSelect('assignment.rotationGroup', 'rotationGroup')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.employee_id = :employeeId', { employeeId })
      .andWhere('assignment.effective_from <= :toDate', { toDate })
      .andWhere(
        '(assignment.effective_to IS NULL OR assignment.effective_to >= :fromDate)',
        { fromDate },
      )
      .orderBy('assignment.effective_from', 'ASC');

    const timetableAssignmentQb = this.employeeTimetableRepository
      .createQueryBuilder('employeeTimetable')
      .leftJoinAndSelect('employeeTimetable.timetable', 'timetable')
      .leftJoinAndSelect('timetable.days', 'timetableDay')
      .leftJoinAndSelect('timetableDay.defaultShift', 'defaultShift')
      .where('employeeTimetable.company_id = :companyId', { companyId })
      .andWhere('employeeTimetable.employee_id = :employeeId', { employeeId })
      .andWhere('employeeTimetable.effective_from <= :toDate', { toDate })
      .andWhere(
        '(employeeTimetable.effective_to IS NULL OR employeeTimetable.effective_to >= :fromDate)',
        { fromDate },
      )
      .orderBy('employeeTimetable.effective_from', 'ASC');

    if (!query.include_inactive) {
      shiftAssignmentQb.andWhere('assignment.status = :assignmentStatus', {
        assignmentStatus: ShiftAssignmentStatusEnum.ACTIVE,
      });

      timetableAssignmentQb.andWhere('employeeTimetable.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      });
    }

    const [
      shiftSchedules,
      shiftAssignments,
      employeeTimetables,
      defaultTimetables,
    ] = await Promise.all([
      shiftScheduleQb.getMany(),
      shiftAssignmentQb.getMany(),
      timetableAssignmentQb.getMany(),
      this.timetableRepository.find({
        where: {
          companyId,
          isDefault: true,
          status: TimetableStatusEnum.ACTIVE,
        },
        relations: {
          days: {
            defaultShift: true,
          },
        },
        order: {
          id: 'ASC',
          days: {
            dayOfWeek: 'ASC',
          },
        },
      }),
    ]);

    return {
      employee_id: employeeId,
      period: {
        from_date: fromDate,
        to_date: toDate,
      },
      source_priority: [
        {
          priority: 1,
          source: 'shift_schedule',
          description:
            'Manual/specific shift schedule override. This has the highest priority.',
        },
        {
          priority: 2,
          source: 'shift_assignment',
          description:
            'Direct shift assignment. Used when there is no manual schedule override.',
        },
        {
          priority: 3,
          source: 'employee_timetable',
          description:
            'Employee timetable assignment. Used as normal working plan.',
        },
        {
          priority: 4,
          source: 'default_timetable',
          description:
            'Company default timetable. Used when employee has no direct timetable.',
        },
      ],
      shift_schedules: shiftSchedules.map((item) =>
        this.mapShiftScheduleAssignment(item),
      ),
      shift_assignments: shiftAssignments.map((item) =>
        this.mapShiftAssignment(item),
      ),
      employee_timetables: employeeTimetables.map((item) =>
        this.mapEmployeeTimetableAssignment(item),
      ),
      default_timetables: defaultTimetables.map((item) =>
        this.mapDefaultTimetable(item),
      ),
    };
  }

  private async mapResolvedScheduleShift(
    companyId: number,
    resolved: {
      shiftId: number | null;
      scheduleStartAt: Date | null;
      scheduleEndAt: Date | null;
      timezone: string;
      requiresCheckout: boolean;
      allowOvertime: boolean;
    },
  ) {
    if (!resolved.shiftId) {
      return null;
    }

    const shift = await this.shiftRepository.findOne({
      where: {
        id: resolved.shiftId,
        companyId,
      },
    });

    if (shift) {
      return this.mapShift(shift);
    }

    return {
      id: resolved.shiftId,
      name: null,
      code: null,
      start_time: this.formatTimeInTimezone(
        resolved.scheduleStartAt,
        resolved.timezone,
      ),
      end_time: this.formatTimeInTimezone(
        resolved.scheduleEndAt,
        resolved.timezone,
      ),
      expected_work_minutes: null,
      requires_checkout: resolved.requiresCheckout,
      allow_overtime: resolved.allowOvertime,
      crosses_midnight: Boolean(
        resolved.scheduleStartAt &&
        resolved.scheduleEndAt &&
        resolved.scheduleEndAt < resolved.scheduleStartAt,
      ),
    };
  }

  private mapResolvedHoliday(
    resolved: { holidayId: number | null },
    holiday: { id: number; name: string; date: string } | null,
    scheduleDate: string,
  ) {
    if (holiday) {
      return {
        id: holiday.id,
        name: holiday.name,
        date: holiday.date,
      };
    }

    if (!resolved.holidayId) {
      return null;
    }

    return {
      id: resolved.holidayId,
      name: null,
      date: scheduleDate,
    };
  }

  private async mapResolvedScheduleTimetable(
    companyId: number,
    timetableId: number | null,
  ) {
    if (!timetableId) {
      return null;
    }

    const timetable = await this.timetableRepository.findOne({
      where: {
        id: timetableId,
        companyId,
      },
    });

    if (timetable) {
      return {
        id: timetable.id,
        name: timetable.name,
        code: timetable.code,
        timezone: timetable.timezone,
      };
    }

    return {
      id: timetableId,
      name: null,
      code: null,
      timezone: null,
    };
  }

  private formatTimeInTimezone(date: Date | null, timezone: string) {
    if (!date) {
      return null;
    }

    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date);

      const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
      const minute =
        parts.find((part) => part.type === 'minute')?.value ?? '00';
      const second =
        parts.find((part) => part.type === 'second')?.value ?? '00';

      return `${hour}:${minute}:${second}`;
    } catch {
      return date.toISOString().slice(11, 19);
    }
  }

  private mapShiftScheduleAssignment(item: ShiftSchedule) {
    const effectiveShift = item.overrideShift ?? item.shift ?? null;

    return {
      id: item.id,
      source: 'shift_schedule',
      schedule_date: item.scheduleDate,
      effective_from: item.effectiveFrom,
      effective_to: item.effectiveTo,
      is_off_day: item.isOffDay,
      generated_from_rotation: item.generatedFromRotation,
      remarks: item.remarks,
      shift: this.mapShift(item.shift),
      override_shift: this.mapShift(item.overrideShift),
      effective_shift: this.mapShift(effectiveShift),
      holiday: item.holiday
        ? {
            id: item.holiday.id,
            name: item.holiday.name,
            date: item.holiday.date,
          }
        : null,
      priority: 1,
    };
  }

  private mapShiftAssignment(item: ShiftAssignment) {
    return {
      id: item.id,
      source: 'shift_assignment',
      effective_from: item.effectiveFrom,
      effective_to: item.effectiveTo,
      is_primary: item.isPrimary,
      status: item.status,
      shift: this.mapShift(item.shift),
      rotation_group: item.rotationGroup
        ? {
            id: item.rotationGroup.id,
            name: (item.rotationGroup as { name?: string }).name ?? null,
            code: (item.rotationGroup as { code?: string }).code ?? null,
          }
        : null,
      priority: 2,
    };
  }

  private mapEmployeeTimetableAssignment(item: EmployeeTimetable) {
    return {
      id: item.id,
      source: 'employee_timetable',
      timetable_id: item.timetableId,
      effective_from: item.effectiveFrom,
      effective_to: item.effectiveTo,
      status: item.status,
      timetable: item.timetable
        ? {
            id: item.timetable.id,
            name: item.timetable.name,
            code: item.timetable.code,
            type: item.timetable.timetableType,
            timezone: item.timetable.timezone,
            is_default: item.timetable.isDefault,
            days: this.mapTimetableDays(item.timetable.days ?? []),
          }
        : null,
      priority: 3,
    };
  }

  private mapDefaultTimetable(item: Timetable) {
    return {
      id: item.id,
      source: 'default_timetable',
      name: item.name,
      code: item.code,
      type: item.timetableType,
      timezone: item.timezone,
      is_default: item.isDefault,
      status: item.status,
      days: this.mapTimetableDays(item.days ?? []),
      priority: 4,
    };
  }

  private mapTimetableDays(
    days: Array<{
      id: number;
      dayOfWeek: number;
      isWorkingDay: boolean;
      minimumWorkMinutes: number;
      expectedCheckInTime: string | null;
      expectedCheckOutTime: string | null;
      allowFlexibleTime: boolean;
      flexibleStartFrom: string | null;
      flexibleStartTo: string | null;
      overtimeAllowed: boolean;
      breakRequired: boolean;
      breakMinutes: number;
      defaultShift?: Shift | null;
    }>,
  ) {
    return [...days]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((day) => ({
        id: day.id,
        day_of_week: day.dayOfWeek,
        day_name: this.getDayName(day.dayOfWeek),
        is_working_day: day.isWorkingDay,
        minimum_work_minutes: day.minimumWorkMinutes,
        expected_check_in_time: day.expectedCheckInTime,
        expected_check_out_time: day.expectedCheckOutTime,
        allow_flexible_time: day.allowFlexibleTime,
        flexible_start_from: day.flexibleStartFrom,
        flexible_start_to: day.flexibleStartTo,
        overtime_allowed: day.overtimeAllowed,
        break_required: day.breakRequired,
        break_minutes: day.breakMinutes,
        default_shift: this.mapShift(day.defaultShift),
      }));
  }

  private getDayName(dayOfWeek: number) {
    const names: Record<number, string> = {
      0: 'Sunday',
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
    };

    return names[dayOfWeek] ?? `Day ${dayOfWeek}`;
  }
}
