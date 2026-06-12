import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildDateOnlyRange, buildPaginationMeta } from '../../shared/hr.utils';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendancePunchValidationStatusEnum } from '../mobile-punches/enums/attendance-punch-validation-status.enum';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { ResolvedAttendanceSchedule } from './entities/resolved-attendance-schedule.type';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { QueryUnmatchedAttendanceLogsDto } from './dtos/query-unmatched-attendance-logs.dto';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';

@Injectable()
export class AttendanceDailySummaryService {
  constructor(
    @InjectRepository(AttendanceProcessedEvent)
    private readonly processedEventRepository: Repository<AttendanceProcessedEvent>,
    @InjectRepository(AttendanceDailySummary)
    private readonly dailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(AttendanceMobilePunch)
    private readonly mobilePunchRepository: Repository<AttendanceMobilePunch>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(AttendanceBusinessTrip)
    private readonly businessTripRepository: Repository<AttendanceBusinessTrip>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    private readonly scheduleResolver: AttendanceScheduleResolverService,
  ) {}

  async rebuildSummariesForRange(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    employeeId?: number;
    forceRebuild?: boolean;
  }) {
    const { companyId, startDate, endDate, employeeId, forceRebuild = false } = input;

    const employeeIds = await this.resolveTargetEmployees(companyId, startDate, endDate, employeeId);

    if (employeeIds.length === 0) {
      return {
        employeeCount: 0,
        daysComputed: 0,
        summariesUpserted: 0,
      };
    }

    if (forceRebuild) {
      await this.dailySummaryRepository
        .createQueryBuilder()
        .delete()
        .from(AttendanceDailySummary)
        .where('company_id = :companyId', { companyId })
        .andWhere('attendance_date >= :startDate', { startDate })
        .andWhere('attendance_date <= :endDate', { endDate })
        .andWhere('employee_id IN (:...employeeIds)', { employeeIds })
        .execute();
    }

    const dates = this.buildDateRange(startDate, endDate);
    let summariesUpserted = 0;

    for (const targetEmployeeId of employeeIds) {
      for (const date of dates) {
        const changed = await this.recomputeForEmployeeDate(companyId, targetEmployeeId, date);
        if (changed) summariesUpserted += 1;
      }
    }

    return {
      employeeCount: employeeIds.length,
      daysComputed: employeeIds.length * dates.length,
      summariesUpserted,
    };
  }

  async recomputeForEmployeeDate(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ): Promise<boolean> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      select: {
        id: true,
        exit_date: true,
      },
    });

    const existing = await this.dailySummaryRepository.findOne({
      where: { companyId, employeeId, attendanceDate },
    });

    if (employee?.exit_date && attendanceDate > employee.exit_date) {
      if (existing) {
        await this.dailySummaryRepository.remove(existing);
      }
      return false;
    }

    const [processedEvents, mobilePunches] = await Promise.all([
      this.processedEventRepository.find({
        where: { companyId, employeeId, attendanceDate, isValid: true },
        order: { eventTime: 'ASC' },
      }),
      this.mobilePunchRepository.find({
        where: {
          companyId,
          employeeId,
          attendanceDate,
          validationStatus: In([
            AttendancePunchValidationStatusEnum.APPROVED,
            AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
          ]),
        },
        order: { punchTime: 'ASC' },
      }),
    ]);

    const events = [
      ...processedEvents.map((event) => ({
        id: `processed:${event.id}`,
        eventTime: event.eventTime,
        rawLogId: event.rawLogId,
      })),
      ...mobilePunches.map((punch) => ({
        id: `mobile:${punch.id}`,
        eventTime: punch.punchTime,
        rawLogId: null,
      })),
    ].sort((left, right) => left.eventTime.getTime() - right.eventTime.getTime());

    const preferredTimezone = await this.resolvePreferredTimezone(companyId, employeeId, attendanceDate);
    const schedule = await this.scheduleResolver.resolveForDate(
      companyId,
      employeeId,
      attendanceDate,
      preferredTimezone,
    );

    const firstEvent = events[0] ?? null;
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;

    const checkInAt = firstEvent?.eventTime ?? null;
    const checkOutAt =
      lastEvent && firstEvent && lastEvent.id !== firstEvent.id ? lastEvent.eventTime : null;

    const hasApprovedLeave = await this.hasApprovedLeave(companyId, employeeId, attendanceDate);
    const hasApprovedBusinessTrip = await this.hasApprovedBusinessTrip(companyId, employeeId, attendanceDate);

    const summaryValues = this.calculateSummaryValues({
      schedule,
      checkInAt,
      checkOutAt,
      hasApprovedLeave,
      hasApprovedBusinessTrip,
      eventCount: events.length,
    });

    if (!existing && !summaryValues.shouldPersist) {
      return false;
    }

    const payload = {
      companyId,
      branchId: schedule.branchId,
      employeeId,
      attendanceDate,
      scheduleSource: schedule.source,
      shiftId: schedule.shiftId,
      timetableId: schedule.timetableId,
      timezone: schedule.timezone,
      scheduleStartAt: schedule.scheduleStartAt,
      scheduleEndAt: schedule.scheduleEndAt,
      checkInAt,
      checkOutAt,
      lateMinutes: summaryValues.lateMinutes,
      earlyDepartureMinutes: summaryValues.earlyDepartureMinutes,
      workMinutes: summaryValues.workMinutes,
      overtimeMinutes: summaryValues.overtimeMinutes,
      attendanceStatus: summaryValues.attendanceStatus,
      flags: summaryValues.flags,
      sourceFirstRawLogId: firstEvent?.rawLogId ?? null,
      sourceLastRawLogId: lastEvent?.rawLogId ?? null,
      calculationVersion: 1,
      finalizedAt: null,
    };

    if (!existing) {
      await this.dailySummaryRepository.save(this.dailySummaryRepository.create(payload));
      return true;
    }

    Object.assign(existing, payload);
    await this.dailySummaryRepository.save(existing);
    return true;
  }

  async findDailySummaries(companyId: number, query: QueryAttendanceDailySummariesDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'attendance_date',
      sortOrder = SortDirection.DESC,
      employee_id,
      from_date,
      to_date,
      attendance_status,
    } = query;

    const qb = this.dailySummaryRepository
      .createQueryBuilder('summary')
      .where('summary.company_id = :companyId', { companyId });

    if (employee_id) qb.andWhere('summary.employee_id = :employeeId', { employeeId: employee_id });
    if (from_date) qb.andWhere('summary.attendance_date >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('summary.attendance_date <= :toDate', { toDate: to_date });
    if (attendance_status?.trim()) {
      qb.andWhere('summary.attendance_status = :status', {
        status: attendance_status.trim().toUpperCase(),
      });
    }

    const sortableColumns = new Set(['attendance_date', 'created_at', 'updated_at', 'employee_id']);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'attendance_date';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`summary.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  async findUnmatchedLogs(companyId: number, query: QueryUnmatchedAttendanceLogsDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'event_time',
      sortOrder = SortDirection.DESC,
      from_date,
      to_date,
      device_id,
    } = query;

    const qb = this.processedEventRepository
      .createQueryBuilder('event')
      .where('event.company_id = :companyId', { companyId })
      .andWhere('event.employee_id IS NULL');

    if (from_date) qb.andWhere('event.attendance_date >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('event.attendance_date <= :toDate', { toDate: to_date });
    if (device_id) qb.andWhere('event.device_id = :deviceId', { deviceId: device_id });

    const sortableColumns = new Set(['event_time', 'attendance_date', 'created_at']);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'event_time';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`event.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  private async resolveTargetEmployees(
    companyId: number,
    startDate: string,
    endDate: string,
    employeeId?: number,
  ): Promise<number[]> {
    if (employeeId) return [employeeId];

    const eventRows = await this.processedEventRepository
      .createQueryBuilder('event')
      .select('DISTINCT event.employee_id', 'employeeId')
      .where('event.company_id = :companyId', { companyId })
      .andWhere('event.employee_id IS NOT NULL')
      .andWhere('event.attendance_date >= :startDate', { startDate })
      .andWhere('event.attendance_date <= :endDate', { endDate })
      .getRawMany<{ employeeId: string }>();

    const timetableRows = await this.employeeTimetableRepository
      .createQueryBuilder('assignment')
      .select('DISTINCT assignment.employee_id', 'employeeId')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :endDate', { endDate })
      .andWhere('(assignment.effective_to IS NULL OR assignment.effective_to >= :startDate)', {
        startDate,
      })
      .getRawMany<{ employeeId: string }>();

    const shiftAssignmentRows = await this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .select('DISTINCT assignment.employee_id', 'employeeId')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :endDate', { endDate })
      .andWhere('(assignment.effective_to IS NULL OR assignment.effective_to >= :startDate)', {
        startDate,
      })
      .getRawMany<{ employeeId: string }>();

    const shiftScheduleRows = await this.shiftScheduleRepository
      .createQueryBuilder('schedule')
      .select('DISTINCT schedule.employee_id', 'employeeId')
      .where('schedule.company_id = :companyId', { companyId })
      .andWhere('schedule.schedule_date >= :startDate', { startDate })
      .andWhere('schedule.schedule_date <= :endDate', { endDate })
      .getRawMany<{ employeeId: string }>();

    const mobilePunchRows = await this.mobilePunchRepository
      .createQueryBuilder('punch')
      .select('DISTINCT punch.employee_id', 'employeeId')
      .where('punch.company_id = :companyId', { companyId })
      .andWhere('punch.attendance_date >= :startDate', { startDate })
      .andWhere('punch.attendance_date <= :endDate', { endDate })
      .andWhere('punch.validation_status IN (:...statuses)', {
        statuses: [
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ],
      })
      .getRawMany<{ employeeId: string }>();

    const employeeIds = new Set<number>();
    for (const row of [
      ...eventRows,
      ...timetableRows,
      ...shiftAssignmentRows,
      ...shiftScheduleRows,
      ...mobilePunchRows,
    ]) {
      const value = Number(row.employeeId);
      if (Number.isInteger(value) && value > 0) {
        employeeIds.add(value);
      }
    }

    return [...employeeIds];
  }

  private async resolvePreferredTimezone(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ): Promise<string | undefined> {
    const event = await this.processedEventRepository
      .createQueryBuilder('event')
      .innerJoin('event.device', 'device')
      .select(['device.timezone AS timezone'])
      .where('event.company_id = :companyId', { companyId })
      .andWhere('event.employee_id = :employeeId', { employeeId })
      .andWhere('event.attendance_date = :attendanceDate', { attendanceDate })
      .orderBy('event.event_time', 'ASC')
      .limit(1)
      .getRawOne<{ timezone?: string }>();

    if (event?.timezone?.trim()) {
      return event.timezone.trim();
    }

    const employee = await this.employeeRepository.findOne({ where: { id: employeeId } });
    if (!employee?.primary_branch_id) return undefined;
    return undefined;
  }

  private async hasApprovedLeave(
    companyId: number,
    employeeId: number,
    date: string,
  ): Promise<boolean> {
    const leave = await this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leaveRequest.start_date <= :date', { date })
      .andWhere('leaveRequest.end_date >= :date', { date })
      .getOne();

    return !!leave;
  }

  private async hasApprovedBusinessTrip(
    companyId: number,
    employeeId: number,
    date: string,
  ): Promise<boolean> {
    const trip = await this.businessTripRepository
      .createQueryBuilder('trip')
      .where('trip.company_id = :companyId', { companyId })
      .andWhere('trip.employee_id = :employeeId', { employeeId })
      .andWhere('LOWER(trip.status) = :status', { status: 'approved' })
      .andWhere('trip.start_date <= :date', { date })
      .andWhere('trip.end_date >= :date', { date })
      .getOne();

    return !!trip;
  }

  private calculateSummaryValues(input: {
    schedule: ResolvedAttendanceSchedule;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    hasApprovedLeave: boolean;
    hasApprovedBusinessTrip: boolean;
    eventCount: number;
  }) {
    const {
      schedule,
      checkInAt,
      checkOutAt,
      hasApprovedLeave,
      hasApprovedBusinessTrip,
      eventCount,
    } = input;

    let attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
    let lateMinutes = 0;
    let earlyDepartureMinutes = 0;
    let workMinutes = 0;
    let overtimeMinutes = 0;

    if (hasApprovedBusinessTrip) {
      attendanceStatus = AttendanceDailyStatusEnum.BUSINESS_TRIP;
    } else if (hasApprovedLeave) {
      attendanceStatus = AttendanceDailyStatusEnum.ON_LEAVE;
    } else if (schedule.isHoliday) {
      attendanceStatus = AttendanceDailyStatusEnum.HOLIDAY;
    } else if (schedule.isOffDay) {
      attendanceStatus = AttendanceDailyStatusEnum.OFF_DAY;
    } else if (eventCount === 0 && schedule.autoAbsentIfNoCheckin) {
      attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
    } else if (!checkOutAt && schedule.requiresCheckout) {
      attendanceStatus = AttendanceDailyStatusEnum.INCOMPLETE;
    } else {
      attendanceStatus = AttendanceDailyStatusEnum.PRESENT;
    }

    if (checkInAt && checkOutAt && checkOutAt.getTime() > checkInAt.getTime()) {
      workMinutes = Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
    }

    if (checkInAt && schedule.scheduleStartAt) {
      const baseline = schedule.scheduleStartAt.getTime() + schedule.graceInMinutes * 60000;
      const lateThreshold = baseline + schedule.lateAfterMinutes * 60000;
      const halfDayThreshold = baseline + schedule.halfDayAfterMinutes * 60000;
      const absentThreshold = baseline + schedule.absentAfterMinutes * 60000;

      if (schedule.lateAfterMinutes > 0 && checkInAt.getTime() > lateThreshold) {
        lateMinutes = Math.floor((checkInAt.getTime() - lateThreshold) / 60000);
      }

      if (
        schedule.absentAfterMinutes > 0 &&
        checkInAt.getTime() > absentThreshold
      ) {
        attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
      } else if (
        schedule.halfDayAfterMinutes > 0 &&
        checkInAt.getTime() > halfDayThreshold &&
        attendanceStatus === AttendanceDailyStatusEnum.PRESENT
      ) {
        attendanceStatus = AttendanceDailyStatusEnum.HALF_DAY;
      }
    }

    if (checkOutAt && schedule.scheduleEndAt) {
      const allowedEarlyLeaveTime =
        schedule.scheduleEndAt.getTime() -
        (schedule.graceOutMinutes + schedule.earlyLeaveAfterMinutes) * 60000;
      if (checkOutAt.getTime() < allowedEarlyLeaveTime) {
        earlyDepartureMinutes = Math.floor((allowedEarlyLeaveTime - checkOutAt.getTime()) / 60000);
      }
    }

    if (checkOutAt && schedule.scheduleEndAt) {
      const overtimeStartTime =
        schedule.scheduleEndAt.getTime() + schedule.overtimeStartAfterMinutes * 60000;
      if (checkOutAt.getTime() > overtimeStartTime) {
        overtimeMinutes = Math.floor((checkOutAt.getTime() - overtimeStartTime) / 60000);
      }
    }

    if (!schedule.allowOvertime && !schedule.isHoliday && !schedule.isOffDay) {
      overtimeMinutes = 0;
    }

    if ((schedule.isHoliday || schedule.isOffDay) && workMinutes > 0) {
      overtimeMinutes = workMinutes;
    }

    if (schedule.maxOvertimeMinutes > 0) {
      overtimeMinutes = Math.min(overtimeMinutes, schedule.maxOvertimeMinutes);
    }

    const flags: Record<string, unknown> = {
      hasApprovedLeave,
      hasApprovedBusinessTrip,
      isHoliday: schedule.isHoliday,
      isOffDay: schedule.isOffDay,
      eventCount,
      requiresCheckout: schedule.requiresCheckout,
      scheduleSource: schedule.source,
      lateAfterMinutes: schedule.lateAfterMinutes,
      halfDayAfterMinutes: schedule.halfDayAfterMinutes,
      absentAfterMinutes: schedule.absentAfterMinutes,
      autoAbsentIfNoCheckin: schedule.autoAbsentIfNoCheckin,
      allowEarlyCheckin: schedule.allowEarlyCheckin,
      allowLateCheckout: schedule.allowLateCheckout,
    };

    const shouldPersist =
      eventCount > 0 ||
      hasApprovedLeave ||
      hasApprovedBusinessTrip ||
      schedule.isHoliday ||
      schedule.isOffDay ||
      attendanceStatus === AttendanceDailyStatusEnum.ABSENT ||
      attendanceStatus === AttendanceDailyStatusEnum.INCOMPLETE ||
      attendanceStatus === AttendanceDailyStatusEnum.HALF_DAY;

    return {
      shouldPersist,
      attendanceStatus,
      lateMinutes,
      earlyDepartureMinutes,
      workMinutes,
      overtimeMinutes,
      flags,
    };
  }

  private buildDateRange(startDate: string, endDate: string): string[] {
    return buildDateOnlyRange(startDate, endDate);
  }
}
