import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { TimetableGeneratedSchedule } from '../attendance/timetable/timetable-generated-schedules/entities/timetable-generated-schedule.entity';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { CreateMyLeaveRequestDto } from './dtos/create-my-leave-request.dto';
import { MyScheduleQueryDto } from './dtos/my-schedule-query.dto';

type EmployeeProfileShape = {
  id?: number;
  employee_no?: string;
  employment_status?: string;
  employment_type?: string;
  hire_date?: string | null;
  exit_date?: string | null;
  primary_branch?: { id: number; name: string } | null;
  primary_department?: { id: number; name: string } | null;
  primary_position?: { id: number; name: string } | null;
  primary_designation?: { id: number; name: string } | null;
  manager?: { id: number; first_name?: string; last_name?: string } | null;
  [key: string]: unknown;
};

type UserProfileShape = {
  id?: number;
  status?: string;
  roles?: Array<{ id?: number; name?: string; display_name?: string }>;
  permissions?: Array<{ id?: number; name?: string; display_name?: string }>;
  active_company?: {
    id: number;
    name: string;
    slug: string;
    status: string;
    metadata?: Record<string, unknown> | null;
  } | null;
  [key: string]: unknown;
};

@Injectable()
export class EmployeeSelfServiceService {
  constructor(
    private readonly usersService: UsersService,
    private readonly employeesService: EmployeesService,
    private readonly leaveService: LeaveService,
    private readonly attendanceDailySummaryService: AttendanceDailySummaryService,
    private readonly attendanceMobilePunchesService: AttendanceMobilePunchesService,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(AttendanceMobilePunch)
    private readonly attendanceMobilePunchRepository: Repository<AttendanceMobilePunch>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(TimetableGeneratedSchedule)
    private readonly generatedScheduleRepository: Repository<TimetableGeneratedSchedule>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
  ) {}

  async getProfile(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);
    const user = await this.usersService.findMyProfileById(actor.id, companyId);

    return {
      user,
      employee,
      links: {
        dashboard: '/me/dashboard',
        profile: '/me/profile',
        attendance_today: '/me/attendance/today',
        attendance_history: '/me/attendance/history',
        attendance_schedule: '/me/attendance/schedule',
        attendance_punches: '/me/attendance/punches',
        leave_balances: '/me/leave/balances',
        leave_requests: '/me/leave/requests',
      },
    };
  }

  async getStatus(actor: AuthenticatedUser) {
    const companyId = this.ensureCompanyId(actor);
    const employee = await this.requireMyEmployeeProfile(actor);
    const [user, todayAttendance] = await Promise.all([
      this.usersService.findMyProfileById(actor.id, companyId),
      this.getTodayAttendance(actor),
    ]);

    return {
      account_status: user.status ?? null,
      employment_status: employee?.employment_status ?? null,
      employment_type: employee?.employment_type ?? null,
      employee_no: employee?.employee_no ?? actor.employeeNo ?? null,
      company: user.active_company ?? null,
      branch: employee?.primary_branch ?? null,
      department: employee?.primary_department ?? null,
      position: employee?.primary_position ?? null,
      designation: employee?.primary_designation ?? null,
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
    ]);

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
      action_flags: {
        can_check_in: todayAttendance.action_flags.can_check_in,
        can_check_out: todayAttendance.action_flags.can_check_out,
        can_request_leave:
          (employee?.employment_status ?? '').toLowerCase() === 'active',
        has_employee_profile: !!employee,
      },
      links: {
        profile: '/me/profile',
        status: '/me/status',
        attendance_today: '/me/attendance/today',
        attendance_history: '/me/attendance/history',
        attendance_schedule: '/me/attendance/schedule',
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
              AttendanceDailyStatusEnum.OFF_DAY,
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

    const [shiftSchedules, generatedSchedules, assignments, timetables] =
      await Promise.all([
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
        this.generatedScheduleRepository.find({
          where: {
            companyId,
            employeeId,
          },
          relations: {
            shift: true,
            timetable: true,
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

    const explicitScheduleMap = new Map(
      shiftSchedules
        .filter(
          (item) =>
            item.scheduleDate >= fromDate && item.scheduleDate <= toDate,
        )
        .map((item) => [item.scheduleDate, item]),
    );
    const generatedScheduleMap = new Map(
      generatedSchedules
        .filter(
          (item) =>
            item.scheduleDate >= fromDate && item.scheduleDate <= toDate,
        )
        .map((item) => [item.scheduleDate, item]),
    );

    const days = this.buildDateRange(fromDate, toDate).map((date) => {
      const explicit = explicitScheduleMap.get(date);
      if (explicit) {
        const activeShift = explicit.overrideShift ?? explicit.shift ?? null;
        return {
          date,
          source: 'shift_schedule',
          is_off_day: explicit.isOffDay,
          holiday: explicit.holiday
            ? {
                id: explicit.holiday.id,
                name: explicit.holiday.name,
                date: explicit.holiday.date,
              }
            : null,
          shift: this.mapShift(activeShift),
          timetable: null,
          remarks: explicit.remarks ?? null,
        };
      }

      const generated = generatedScheduleMap.get(date);
      if (generated) {
        return {
          date,
          source: 'timetable_generated_schedule',
          is_off_day: generated.isOffDay,
          holiday: generated.holiday
            ? {
                id: generated.holiday.id,
                name: generated.holiday.name,
                date: generated.holiday.date,
              }
            : null,
          shift: this.mapShift(generated.shift),
          timetable: generated.timetable
            ? {
                id: generated.timetable.id,
                name: generated.timetable.name,
                code: generated.timetable.code,
                timezone: generated.timetable.timezone,
              }
            : null,
          remarks: null,
        };
      }

      const assignment = assignments.find((item) =>
        this.isDateWithinRange(date, item.effectiveFrom, item.effectiveTo),
      );
      if (assignment) {
        return {
          date,
          source: 'shift_assignment',
          is_off_day: false,
          holiday: null,
          shift: this.mapShift(assignment.shift),
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
          is_off_day: null,
          holiday: null,
          shift: null,
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

      return {
        date,
        source: 'unassigned',
        is_off_day: null,
        holiday: null,
        shift: null,
        timetable: null,
        remarks: null,
      };
    });

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
    const currentFiscalYear = this.getFiscalYear(this.getCurrentDateString());
    const response = await this.leaveService.findAllLeaveBalances(
      companyId,
      {
        ...query,
        fiscal_year: query.fiscal_year?.trim() || currentFiscalYear,
      },
      actor,
    );

    const totals = Array.isArray(response.data)
      ? response.data.reduce(
          (acc, item: Record<string, unknown>) => {
            acc.allocated_days += this.toNumber(item.allocated_days);
            acc.used_days += this.toNumber(item.used_days);
            acc.pending_days += this.toNumber(item.pending_days);
            acc.carried_forward_days += this.toNumber(
              item.carried_forward_days,
            );
            acc.expired_days += this.toNumber(item.expired_days);
            acc.available_days += this.toNumber(item.available_days);
            return acc;
          },
          {
            allocated_days: 0,
            used_days: 0,
            pending_days: 0,
            carried_forward_days: 0,
            expired_days: 0,
            available_days: 0,
          },
        )
      : null;

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

  private ensureCompanyId(actor: AuthenticatedUser): number {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    return actor.companyId;
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

  private getCurrentDateString() {
    return new Date().toISOString().slice(0, 10);
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
      approved: counts[LeaveStatusEnum.APPROVED] ?? 0,
      rejected: counts[LeaveStatusEnum.REJECTED] ?? 0,
      cancelled: counts[LeaveStatusEnum.CANCELLED] ?? 0,
      pending_total:
        (counts[LeaveStatusEnum.SUBMITTED] ?? 0) +
        (counts[LeaveStatusEnum.IN_REVIEW] ?? 0),
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
}
