import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AttendanceScheduleResolverService } from '../../attendance/processing/attendance-schedule-resolver.service';
import { AttendanceDailyStatusEnum } from '../../attendance/processing/enums/attendance-daily-status.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveDurationTypeEnum } from '../../leave/enums/leave-duration-type.enum';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceHoliday } from '../../attendance/holidays/entities/holiday.entity';

export type WorkActivityDateEligibility = {
  eligible: boolean;
  employed: boolean;
  isWorkday: boolean;
  isOffDay: boolean;
  isHoliday: boolean;
  hasApprovedLeave: boolean;
  hasFullDayLeave: boolean;
  hasPartialLeave: boolean;
  attendanceExceptionEligible: boolean;
  scheduleSource: string;
  timezone: string;
};

/** Shared employment, calendar, and approved-leave interpretation for Module 8. */
@Injectable()
export class WorkActivityEligibilityService {
  constructor(
    private readonly scheduleResolver: AttendanceScheduleResolverService,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
  ) {}

  async evaluate(
    employee: Employee,
    activityDate: string,
    timezone?: string,
  ): Promise<WorkActivityDateEligibility> {
    const employmentStatus = String(employee.employment_status).toLowerCase();
    const terminalStatuses = new Set<string>([
      EmploymentStatusEnum.RESIGNED,
      EmploymentStatusEnum.TERMINATED,
      EmploymentStatusEnum.RETIRED,
      EmploymentStatusEnum.DECEASED,
      EmploymentStatusEnum.EXITED,
      EmploymentStatusEnum.INACTIVE,
    ]);
    const employed =
      (!employee.hire_date || employee.hire_date <= activityDate) &&
      (!employee.exit_date || activityDate <= employee.exit_date) &&
      (employmentStatus === String(EmploymentStatusEnum.ACTIVE) ||
        (terminalStatuses.has(employmentStatus) &&
          Boolean(employee.exit_date) &&
          activityDate <= employee.exit_date!));

    const schedule = await this.scheduleResolver.resolveForDate(
      employee.company_id,
      employee.id,
      activityDate,
      timezone,
    );
    const leaves = await this.leaveRepository.find({
      where: {
        company_id: employee.company_id,
        employee_id: employee.id,
        status: LeaveStatusEnum.APPROVED,
        start_date: LessThanOrEqual(activityDate),
        end_date: MoreThanOrEqual(activityDate),
      },
      select: ['id', 'start_date', 'end_date', 'duration_type'],
    });
    const hasApprovedLeave = leaves.length > 0;
    const hasFullDayLeave = leaves.some(
      (leave) => leave.duration_type === LeaveDurationTypeEnum.FULL_DAY,
    );
    const hasPartialLeave =
      hasApprovedLeave &&
      leaves.some(
        (leave) => leave.duration_type !== LeaveDurationTypeEnum.FULL_DAY,
      );
    const isOffDay = schedule.isOffDay;
    const isHoliday = schedule.isHoliday;
    const holiday = schedule.holidayId
      ? await this.holidayRepository.findOne({
          where: { id: schedule.holidayId, companyId: employee.company_id },
          select: ['id', 'countsAsWorkingDay'],
        })
      : null;
    const isWorkday =
      !isOffDay &&
      (!isHoliday || holiday?.countsAsWorkingDay || schedule.shiftId != null) &&
      !hasFullDayLeave;
    const attendance = await this.attendanceRepository.findOne({
      where: {
        companyId: employee.company_id,
        employeeId: employee.id,
        attendanceDate: activityDate,
      },
      select: ['id', 'attendanceStatus', 'checkInAt'],
    });
    const attendanceStatus = attendance?.attendanceStatus as
      | AttendanceDailyStatusEnum
      | undefined;
    const attendanceStatusExemptions = new Set<AttendanceDailyStatusEnum>([
      AttendanceDailyStatusEnum.LEAVE,
      AttendanceDailyStatusEnum.SICK_LEAVE,
      AttendanceDailyStatusEnum.ANNUAL_LEAVE,
      AttendanceDailyStatusEnum.UNPAID_LEAVE,
    ]);
    const attendanceHasWorkEvidence =
      Boolean(attendance?.checkInAt) ||
      attendanceStatus === AttendanceDailyStatusEnum.BUSINESS_TRIP ||
      attendanceStatus === AttendanceDailyStatusEnum.OFFICIAL_DUTY;

    return {
      // Phase 1 approved the population as every employed calendar day. The
      // calendar attributes describe context; they do not suppress reminders.
      eligible: employed,
      employed,
      isWorkday,
      isOffDay,
      isHoliday,
      hasApprovedLeave,
      hasFullDayLeave,
      hasPartialLeave,
      attendanceExceptionEligible:
        employed &&
        Boolean(attendance) &&
        attendanceHasWorkEvidence &&
        !attendanceStatusExemptions.has(attendanceStatus!) &&
        isWorkday &&
        !hasFullDayLeave,
      scheduleSource: schedule.source,
      timezone: schedule.timezone,
    };
  }
}
