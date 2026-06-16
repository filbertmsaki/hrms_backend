import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildDateOnlyRange, buildPaginationMeta, normalizeDateInput } from '../../shared/hr.utils';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveType } from '../../leave/entities/leave-type.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftBreak } from '../shift/shift-breaks/entities/shift-break.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendancePunchValidationStatusEnum } from '../mobile-punches/enums/attendance-punch-validation-status.enum';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailySummaryAdjustment } from './entities/attendance-daily-summary-adjustment.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { ResolvedAttendanceSchedule } from './entities/resolved-attendance-schedule.type';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { QueryUnmatchedAttendanceLogsDto } from './dtos/query-unmatched-attendance-logs.dto';
import { UpsertAttendanceDailySummaryAdjustmentDto } from './dtos/upsert-attendance-daily-summary-adjustment.dto';
import { AttendanceExceptionTypeEnum } from './enums/attendance-exception-type.enum';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';

type AttendanceEventPoint = {
  id: string;
  eventTime: Date;
  rawLogId: number | null;
  source: 'processed' | 'mobile';
};

type PreparedPunchAnalysis = {
  effectivePunches: AttendanceEventPoint[];
  duplicatePunches: AttendanceEventPoint[];
  invalidPunches: AttendanceEventPoint[];
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakMinutes: number;
};

type SummaryCalculationInput = {
  schedule: ResolvedAttendanceSchedule;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakMinutes: number;
  /** null = no approved leave; a status value = approved leave of that type */
  leaveStatus: AttendanceDailyStatusEnum | null;
  hasApprovedBusinessTrip: boolean;
  eventCount: number;
  hasScheduleExpectation: boolean;
  noScheduleFound: boolean;
};

type SummaryCalculationResult = {
  shouldPersist: boolean;
  attendanceStatus: AttendanceDailyStatusEnum;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  breakMinutes: number;
  workMinutes: number;
  overtimeMinutes: number;
  flags: Record<string, unknown>;
};

@Injectable()
export class AttendanceDailySummaryService {
  private readonly duplicatePunchThresholdMs = 60 * 1000;
  private readonly preShiftWindowHours = 12;
  private readonly postShiftWindowHours = 12;

  constructor(
    @InjectRepository(AttendanceProcessedEvent)
    private readonly processedEventRepository: Repository<AttendanceProcessedEvent>,
    @InjectRepository(AttendanceDailySummary)
    private readonly dailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(AttendanceDailySummaryAdjustment)
    private readonly adjustmentRepository: Repository<AttendanceDailySummaryAdjustment>,
    @InjectRepository(AttendanceMobilePunch)
    private readonly mobilePunchRepository: Repository<AttendanceMobilePunch>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
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
    @InjectRepository(ShiftBreak)
    private readonly shiftBreakRepository: Repository<ShiftBreak>,
    @InjectRepository(TimetableDay)
    private readonly timetableDayRepository: Repository<TimetableDay>,
    private readonly scheduleResolver: AttendanceScheduleResolverService,
    private readonly exceptionService: AttendanceProcessingExceptionsService,
  ) {}

  async rebuildSummariesForRange(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    employeeId?: number;
    forceRebuild?: boolean;
  }) {
    const { companyId, startDate, endDate, employeeId, forceRebuild = false } = input;

    const employeeIds = await this.resolveTargetEmployees(
      companyId,
      startDate,
      endDate,
      employeeId,
    );

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
        const changed = await this.recomputeForEmployeeDate(
          companyId,
          targetEmployeeId,
          date,
        );
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
    const normalizedAttendanceDate = this.normalizeDate(
      attendanceDate,
      'attendanceDate',
    );
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      select: {
        id: true,
        exit_date: true,
      },
    });

    const existing = await this.dailySummaryRepository.findOne({
      where: { companyId, employeeId, attendanceDate: normalizedAttendanceDate },
    });

    if (employee?.exit_date && normalizedAttendanceDate > employee.exit_date) {
      if (existing) {
        await this.dailySummaryRepository.remove(existing);
      }
      await this.exceptionService.replaceForEmployeeDate(
        companyId,
        employeeId,
        normalizedAttendanceDate,
        [],
      );
      return false;
    }

    const preferredTimezone = await this.resolvePreferredTimezone(
      companyId,
      employeeId,
      normalizedAttendanceDate,
    );
    const schedule = await this.scheduleResolver.resolveForDate(
      companyId,
      employeeId,
      normalizedAttendanceDate,
      preferredTimezone,
    );
    const hasScheduleExpectation = await this.hasScheduleExpectation(
      companyId,
      employeeId,
      normalizedAttendanceDate,
    );
    const noScheduleFound =
      schedule.source === 'NONE' &&
      hasScheduleExpectation &&
      !schedule.isOffDay &&
      !schedule.isHoliday;

    const [processedEvents, mobilePunches, leaveStatus, hasApprovedBusinessTrip, scheduledBreakMinutes, activeAdjustment] =
      await Promise.all([
        this.findProcessedEventsForSchedule(
          companyId,
          employeeId,
          normalizedAttendanceDate,
          schedule,
        ),
        this.findMobilePunchesForSchedule(
          companyId,
          employeeId,
          normalizedAttendanceDate,
          schedule,
        ),
        this.resolveApprovedLeave(companyId, employeeId, normalizedAttendanceDate),
        this.hasApprovedBusinessTrip(companyId, employeeId, normalizedAttendanceDate),
        this.resolveScheduledBreakMinutes(schedule, normalizedAttendanceDate),
        this.findActiveAdjustment(companyId, employeeId, normalizedAttendanceDate),
      ]);

    const events = [
      ...processedEvents.map((event) => ({
        id: `processed:${event.id}`,
        eventTime: event.eventTime,
        rawLogId: event.rawLogId,
        source: 'processed' as const,
      })),
      ...mobilePunches.map((punch) => ({
        id: `mobile:${punch.id}`,
        eventTime: punch.punchTime,
        rawLogId: null,
        source: 'mobile' as const,
      })),
    ].sort((left, right) => left.eventTime.getTime() - right.eventTime.getTime());

    const punchAnalysis = this.preparePunches(
      events,
      schedule,
      normalizedAttendanceDate,
    );
    const effectiveBreakMinutes =
      punchAnalysis.breakMinutes > 0
        ? punchAnalysis.breakMinutes
        : scheduledBreakMinutes;

    const calculated = this.calculateSummaryValues({
      schedule,
      checkInAt: punchAnalysis.checkInAt,
      checkOutAt: punchAnalysis.checkOutAt,
      breakMinutes: effectiveBreakMinutes,
      leaveStatus,
      hasApprovedBusinessTrip,
      eventCount: punchAnalysis.effectivePunches.length,
      hasScheduleExpectation,
      noScheduleFound,
    });
    const summaryValues = this.applyAdjustmentToSummary(
      calculated,
      schedule,
      {
        checkInAt: punchAnalysis.checkInAt,
        checkOutAt: punchAnalysis.checkOutAt,
        breakMinutes: effectiveBreakMinutes,
      },
      {
        leaveStatus,
        hasApprovedBusinessTrip,
        eventCount: punchAnalysis.effectivePunches.length,
        hasScheduleExpectation,
        noScheduleFound,
      },
      activeAdjustment,
    );

    const effectivePunches = punchAnalysis.effectivePunches;
    const firstEvent = effectivePunches[0] ?? null;
    const lastEvent =
      effectivePunches.length > 0
        ? effectivePunches[effectivePunches.length - 1]
        : null;

    if (!existing && !summaryValues.shouldPersist) {
      await this.exceptionService.replaceForEmployeeDate(
        companyId,
        employeeId,
        normalizedAttendanceDate,
        [],
      );
      return false;
    }

    if (existing && !summaryValues.shouldPersist) {
      await this.dailySummaryRepository.remove(existing);
      await this.exceptionService.replaceForEmployeeDate(
        companyId,
        employeeId,
        normalizedAttendanceDate,
        [],
      );
      return false;
    }

    const payload = {
      companyId,
      branchId: schedule.branchId,
      employeeId,
      attendanceDate: normalizedAttendanceDate,
      scheduleSource: schedule.source,
      shiftId: schedule.shiftId,
      timetableId: schedule.timetableId,
      timezone: schedule.timezone,
      scheduleStartAt: schedule.scheduleStartAt,
      scheduleEndAt: schedule.scheduleEndAt,
      checkInAt: summaryValues.checkInAt,
      checkOutAt: summaryValues.checkOutAt,
      lateMinutes: summaryValues.lateMinutes,
      earlyDepartureMinutes: summaryValues.earlyDepartureMinutes,
      workMinutes: summaryValues.workMinutes,
      breakMinutes: summaryValues.breakMinutes,
      overtimeMinutes: summaryValues.overtimeMinutes,
      attendanceStatus: summaryValues.attendanceStatus,
      flags: summaryValues.flags,
      sourceFirstRawLogId: firstEvent?.rawLogId ?? null,
      sourceLastRawLogId: lastEvent?.rawLogId ?? null,
      calculationVersion: 2,
      isAdjusted: !!activeAdjustment,
      adjustedByCompanyUserId: activeAdjustment?.appliedByCompanyUserId ?? null,
      adjustedAt: activeAdjustment?.appliedAt ?? null,
      finalizedAt: null,
    };

    const savedSummary = existing
      ? await this.dailySummaryRepository.save(Object.assign(existing, payload))
      : await this.dailySummaryRepository.save(
          this.dailySummaryRepository.create(payload),
        );

    if (activeAdjustment && activeAdjustment.summaryId !== savedSummary.id) {
      activeAdjustment.summaryId = savedSummary.id;
      await this.adjustmentRepository.save(activeAdjustment);
    }

    await this.exceptionService.replaceForEmployeeDate(
      companyId,
      employeeId,
      normalizedAttendanceDate,
      this.buildSummaryExceptionDrafts({
        companyId,
        employeeId,
        branchId: schedule.branchId,
        deviceId: processedEvents[0]?.deviceId ?? null,
        attendanceDate: normalizedAttendanceDate,
        employeeNo: processedEvents[0]?.employeeNo ?? '',
        summaryId: savedSummary.id,
        punchAnalysis,
        schedule,
        hasScheduleExpectation,
        noScheduleFound,
      }),
    );

    return true;
  }

  async upsertAdjustment(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
    dto: UpsertAttendanceDailySummaryAdjustmentDto,
    appliedByCompanyUserId: number | null,
  ) {
    const normalizedAttendanceDate = this.normalizeDate(
      attendanceDate,
      'attendanceDate',
    );

    await this.adjustmentRepository
      .createQueryBuilder()
      .update(AttendanceDailySummaryAdjustment)
      .set({ isActive: false })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('attendance_date = :attendanceDate', {
        attendanceDate: normalizedAttendanceDate,
      })
      .andWhere('is_active = :isActive', { isActive: true })
      .execute();

    const summary = await this.dailySummaryRepository.findOne({
      where: {
        companyId,
        employeeId,
        attendanceDate: normalizedAttendanceDate,
      },
    });

    await this.adjustmentRepository.save(
      this.adjustmentRepository.create({
        companyId,
        employeeId,
        summaryId: summary?.id ?? null,
        attendanceDate: normalizedAttendanceDate,
        statusOverride: dto.attendance_status?.trim().toUpperCase() || null,
        checkInAtOverride: this.parseOptionalDate(dto.check_in_at, 'check_in_at'),
        checkOutAtOverride: this.parseOptionalDate(dto.check_out_at, 'check_out_at'),
        breakMinutesOverride: dto.break_minutes ?? null,
        workMinutesOverride: dto.worked_minutes ?? null,
        lateMinutesOverride: dto.late_minutes ?? null,
        earlyDepartureMinutesOverride: dto.early_departure_minutes ?? null,
        overtimeMinutesOverride: dto.overtime_minutes ?? null,
        notes: dto.notes?.trim() || null,
        metadata: {
          source: 'MANUAL_ADJUSTMENT',
        },
        isActive: true,
        appliedByCompanyUserId,
      }),
    );

    await this.recomputeForEmployeeDate(
      companyId,
      employeeId,
      normalizedAttendanceDate,
    );

    return this.dailySummaryRepository.findOne({
      where: {
        companyId,
        employeeId,
        attendanceDate: normalizedAttendanceDate,
      },
    });
  }

  async clearAdjustment(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ) {
    const normalizedAttendanceDate = this.normalizeDate(
      attendanceDate,
      'attendanceDate',
    );

    await this.adjustmentRepository
      .createQueryBuilder()
      .update(AttendanceDailySummaryAdjustment)
      .set({ isActive: false })
      .where('company_id = :companyId', { companyId })
      .andWhere('employee_id = :employeeId', { employeeId })
      .andWhere('attendance_date = :attendanceDate', {
        attendanceDate: normalizedAttendanceDate,
      })
      .andWhere('is_active = :isActive', { isActive: true })
      .execute();

    await this.recomputeForEmployeeDate(
      companyId,
      employeeId,
      normalizedAttendanceDate,
    );

    return this.dailySummaryRepository.findOne({
      where: {
        companyId,
        employeeId,
        attendanceDate: normalizedAttendanceDate,
      },
    });
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

    return undefined;
  }

  private async findProcessedEventsForSchedule(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
    schedule: ResolvedAttendanceSchedule,
  ): Promise<AttendanceProcessedEvent[]> {
    const qb = this.processedEventRepository
      .createQueryBuilder('event')
      .where('event.company_id = :companyId', { companyId })
      .andWhere('event.employee_id = :employeeId', { employeeId })
      .andWhere('event.is_valid = :isValid', { isValid: true });

    const window = this.buildEventWindow(schedule, attendanceDate);
    if (window) {
      qb.andWhere('event.event_time >= :windowStart', {
        windowStart: window.start,
      });
      qb.andWhere('event.event_time <= :windowEnd', {
        windowEnd: window.end,
      });
    } else {
      qb.andWhere('event.attendance_date = :attendanceDate', { attendanceDate });
    }

    return qb.orderBy('event.event_time', 'ASC').getMany();
  }

  private async findMobilePunchesForSchedule(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
    schedule: ResolvedAttendanceSchedule,
  ): Promise<AttendanceMobilePunch[]> {
    const qb = this.mobilePunchRepository
      .createQueryBuilder('punch')
      .where('punch.company_id = :companyId', { companyId })
      .andWhere('punch.employee_id = :employeeId', { employeeId })
      .andWhere('punch.validation_status IN (:...statuses)', {
        statuses: [
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ],
      });

    const window = this.buildEventWindow(schedule, attendanceDate);
    if (window) {
      qb.andWhere('punch.punch_time >= :windowStart', {
        windowStart: window.start,
      });
      qb.andWhere('punch.punch_time <= :windowEnd', {
        windowEnd: window.end,
      });
    } else {
      qb.andWhere('punch.attendance_date = :attendanceDate', { attendanceDate });
    }

    return qb.orderBy('punch.punch_time', 'ASC').getMany();
  }

  private buildEventWindow(
    schedule: ResolvedAttendanceSchedule,
    attendanceDate: string,
  ): { start: Date; end: Date } | null {
    if (!schedule.scheduleStartAt || !schedule.scheduleEndAt) {
      return null;
    }

    return {
      start: new Date(
        schedule.scheduleStartAt.getTime() -
          this.preShiftWindowHours * 60 * 60 * 1000,
      ),
      end: new Date(
        schedule.scheduleEndAt.getTime() +
          this.postShiftWindowHours * 60 * 60 * 1000,
      ),
    };
  }

  private async resolveScheduledBreakMinutes(
    schedule: ResolvedAttendanceSchedule,
    attendanceDate: string,
  ): Promise<number> {
    if (schedule.shiftId) {
      const breaks = await this.shiftBreakRepository.find({
        where: { shiftId: schedule.shiftId },
      });

      return breaks.reduce((total, item) => {
        if (item.isPaid) return total;
        return total + Math.max(0, item.durationMinutes ?? 0);
      }, 0);
    }

    if (schedule.timetableId) {
      const dayOfWeek = this.getDayOfWeek(attendanceDate);
      const day = await this.timetableDayRepository.findOne({
        where: { timetableId: schedule.timetableId, dayOfWeek },
      });
      if (day?.breakRequired) {
        return Math.max(0, day.breakMinutes ?? 0);
      }
    }

    return 0;
  }

  private preparePunches(
    events: AttendanceEventPoint[],
    schedule: ResolvedAttendanceSchedule,
    attendanceDate: string,
  ): PreparedPunchAnalysis {
    const effectivePunches: AttendanceEventPoint[] = [];
    const duplicatePunches: AttendanceEventPoint[] = [];
    const invalidPunches: AttendanceEventPoint[] = [];

    for (const event of events) {
      const previous = effectivePunches[effectivePunches.length - 1] ?? null;
      if (
        previous &&
        event.eventTime.getTime() - previous.eventTime.getTime() <=
          this.duplicatePunchThresholdMs
      ) {
        duplicatePunches.push(event);
        continue;
      }
      effectivePunches.push(event);
    }

    if (effectivePunches.length === 0) {
      return {
        effectivePunches,
        duplicatePunches,
        invalidPunches,
        checkInAt: null,
        checkOutAt: null,
        breakMinutes: 0,
      };
    }

    let checkInAt: Date | null = null;
    let checkOutAt: Date | null = null;

    if (effectivePunches.length === 1) {
      const onlyPunch = effectivePunches[0];
      if (this.shouldTreatSinglePunchAsCheckout(schedule, onlyPunch.eventTime)) {
        checkOutAt = onlyPunch.eventTime;
      } else {
        checkInAt = onlyPunch.eventTime;
      }
    } else {
      checkInAt = effectivePunches[0].eventTime;
      checkOutAt = effectivePunches[effectivePunches.length - 1].eventTime;
      if (checkOutAt.getTime() <= checkInAt.getTime()) {
        invalidPunches.push(...effectivePunches);
        checkOutAt = null;
      }
    }

    let breakMinutes = 0;
    const internalPunches =
      effectivePunches.length > 2 ? effectivePunches.slice(1, -1) : [];

    for (let index = 0; index + 1 < internalPunches.length; index += 2) {
      const breakStart = internalPunches[index];
      const breakEnd = internalPunches[index + 1];
      if (breakEnd.eventTime.getTime() <= breakStart.eventTime.getTime()) {
        invalidPunches.push(breakStart, breakEnd);
        continue;
      }
      breakMinutes += Math.floor(
        (breakEnd.eventTime.getTime() - breakStart.eventTime.getTime()) / 60000,
      );
    }

    if (internalPunches.length % 2 === 1) {
      invalidPunches.push(internalPunches[internalPunches.length - 1]);
    }

    return {
      effectivePunches,
      duplicatePunches,
      invalidPunches,
      checkInAt,
      checkOutAt,
      breakMinutes,
    };
  }

  private shouldTreatSinglePunchAsCheckout(
    schedule: ResolvedAttendanceSchedule,
    punchTime: Date,
  ): boolean {
    if (!schedule.scheduleStartAt || !schedule.scheduleEndAt) {
      return false;
    }

    const startDistance = Math.abs(
      punchTime.getTime() - schedule.scheduleStartAt.getTime(),
    );
    const endDistance = Math.abs(
      punchTime.getTime() - schedule.scheduleEndAt.getTime(),
    );

    return endDistance < startDistance;
  }

  private calculateSummaryValues(
    input: SummaryCalculationInput,
  ): SummaryCalculationResult {
    const {
      schedule,
      checkInAt,
      checkOutAt,
      breakMinutes,
      leaveStatus,
      hasApprovedBusinessTrip,
      eventCount,
      hasScheduleExpectation,
      noScheduleFound,
    } = input;

    const hasApprovedLeave = leaveStatus !== null;

    let attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
    let lateMinutes = 0;
    let earlyDepartureMinutes = 0;
    let workMinutes = 0;
    let overtimeMinutes = 0;

    // ── Priority 1: Business trip overrides everything ──────────────────────
    if (hasApprovedBusinessTrip) {
      attendanceStatus = AttendanceDailyStatusEnum.BUSINESS_TRIP;

    // ── Priority 2: Approved leave (type-aware) ──────────────────────────────
    } else if (hasApprovedLeave) {
      attendanceStatus = leaveStatus!;

    // ── Priority 3: Holiday ──────────────────────────────────────────────────
    } else if (schedule.isHoliday) {
      attendanceStatus = AttendanceDailyStatusEnum.HOLIDAY;

    // ── Priority 4: Off day ──────────────────────────────────────────────────
    } else if (schedule.isOffDay) {
      attendanceStatus = AttendanceDailyStatusEnum.OFF_DAY;

    // ── Priority 5: No usable schedule and there is schedule expectation ─────
    } else if (noScheduleFound) {
      attendanceStatus = AttendanceDailyStatusEnum.INCOMPLETE;

    // ── Priority 6: Check-out exists but no check-in (orphan punch) ──────────
    } else if (!checkInAt && checkOutAt) {
      attendanceStatus = AttendanceDailyStatusEnum.INCOMPLETE;

    // ── Priority 7: No punches at all on a working day ───────────────────────
    } else if (eventCount === 0 && hasScheduleExpectation && schedule.autoAbsentIfNoCheckin) {
      attendanceStatus = AttendanceDailyStatusEnum.ABSENT;

    // ── Priority 8+: At least one valid check-in punch ───────────────────────
    } else if (checkInAt) {
      // Missing check-out on a shift that requires it
      if (!checkOutAt && schedule.requiresCheckout) {
        attendanceStatus = AttendanceDailyStatusEnum.MISSING_CHECKOUT;
      } else {
        attendanceStatus = AttendanceDailyStatusEnum.PRESENT;
      }
    }

    // ── Work minutes (gross − break) ────────────────────────────────────────
    if (checkInAt && checkOutAt && checkOutAt.getTime() > checkInAt.getTime()) {
      const grossMinutes = Math.floor(
        (checkOutAt.getTime() - checkInAt.getTime()) / 60000,
      );
      workMinutes = Math.max(0, grossMinutes - Math.max(0, breakMinutes));
    }

    // ── Late / half-day / absent threshold checks ────────────────────────────
    if (checkInAt && schedule.scheduleStartAt) {
      const baseline = schedule.scheduleStartAt.getTime() + schedule.graceInMinutes * 60000;
      const lateThreshold    = baseline + schedule.lateAfterMinutes    * 60000;
      const halfDayThreshold = baseline + schedule.halfDayAfterMinutes * 60000;
      const absentThreshold  = baseline + schedule.absentAfterMinutes  * 60000;

      if (schedule.lateAfterMinutes > 0 && checkInAt.getTime() > lateThreshold) {
        lateMinutes = Math.floor((checkInAt.getTime() - lateThreshold) / 60000);
      }

      // Absent-by-lateness overrides PRESENT/MISSING_CHECKOUT
      if (
        schedule.absentAfterMinutes > 0 &&
        checkInAt.getTime() > absentThreshold &&
        !hasApprovedLeave &&
        !hasApprovedBusinessTrip &&
        !schedule.isHoliday &&
        !schedule.isOffDay
      ) {
        attendanceStatus = AttendanceDailyStatusEnum.ABSENT;

      // Half-day overrides PRESENT only
      } else if (
        schedule.halfDayAfterMinutes > 0 &&
        checkInAt.getTime() > halfDayThreshold &&
        attendanceStatus === AttendanceDailyStatusEnum.PRESENT
      ) {
        attendanceStatus = AttendanceDailyStatusEnum.HALF_DAY;

      // LATE overrides PRESENT (not MISSING_CHECKOUT or HALF_DAY)
      } else if (
        lateMinutes > 0 &&
        attendanceStatus === AttendanceDailyStatusEnum.PRESENT
      ) {
        attendanceStatus = AttendanceDailyStatusEnum.LATE;
      }
    }

    // ── Early departure ──────────────────────────────────────────────────────
    if (checkOutAt && schedule.scheduleEndAt) {
      const allowedEarlyLeaveTime =
        schedule.scheduleEndAt.getTime() -
        (schedule.graceOutMinutes + schedule.earlyLeaveAfterMinutes) * 60000;
      if (checkOutAt.getTime() < allowedEarlyLeaveTime) {
        earlyDepartureMinutes = Math.floor(
          (allowedEarlyLeaveTime - checkOutAt.getTime()) / 60000,
        );
      }
    }

    // EARLY_DEPARTURE overrides PRESENT only (LATE takes precedence over leaving early)
    if (
      earlyDepartureMinutes > 0 &&
      attendanceStatus === AttendanceDailyStatusEnum.PRESENT
    ) {
      attendanceStatus = AttendanceDailyStatusEnum.EARLY_DEPARTURE;
    }

    // ── Overtime ─────────────────────────────────────────────────────────────
    if (checkOutAt && schedule.scheduleEndAt) {
      const overtimeStartTime =
        schedule.scheduleEndAt.getTime() +
        schedule.overtimeStartAfterMinutes * 60000;
      if (checkOutAt.getTime() > overtimeStartTime) {
        overtimeMinutes = Math.floor(
          (checkOutAt.getTime() - overtimeStartTime) / 60000,
        );
      }
    }

    if (!schedule.allowOvertime && !schedule.isHoliday && !schedule.isOffDay) {
      overtimeMinutes = 0;
    }

    // Work on holiday/off-day counts entirely as overtime
    if ((schedule.isHoliday || schedule.isOffDay) && workMinutes > 0) {
      overtimeMinutes = workMinutes;
    }

    if (schedule.maxOvertimeMinutes > 0) {
      overtimeMinutes = Math.min(overtimeMinutes, schedule.maxOvertimeMinutes);
    }

    // OVERTIME overrides PRESENT only (other statuses have higher priority)
    if (
      overtimeMinutes > 0 &&
      attendanceStatus === AttendanceDailyStatusEnum.PRESENT
    ) {
      attendanceStatus = AttendanceDailyStatusEnum.OVERTIME;
    }

    const shouldPersist =
      eventCount > 0 ||
      hasApprovedLeave ||
      hasApprovedBusinessTrip ||
      schedule.isHoliday ||
      schedule.isOffDay ||
      noScheduleFound ||
      (hasScheduleExpectation && !schedule.isHoliday && !schedule.isOffDay);

    return {
      shouldPersist,
      attendanceStatus,
      lateMinutes,
      earlyDepartureMinutes,
      breakMinutes: Math.max(0, breakMinutes),
      workMinutes,
      overtimeMinutes,
      flags: {
        hasApprovedLeave,
        leaveStatus,
        hasApprovedBusinessTrip,
        isHoliday: schedule.isHoliday,
        isOffDay: schedule.isOffDay,
        eventCount,
        hasScheduleExpectation,
        noScheduleFound,
        requiresCheckout: schedule.requiresCheckout,
        scheduleSource: schedule.source,
        lateAfterMinutes: schedule.lateAfterMinutes,
        halfDayAfterMinutes: schedule.halfDayAfterMinutes,
        absentAfterMinutes: schedule.absentAfterMinutes,
        autoAbsentIfNoCheckin: schedule.autoAbsentIfNoCheckin,
        allowEarlyCheckin: schedule.allowEarlyCheckin,
        allowLateCheckout: schedule.allowLateCheckout,
      },
    };
  }

  private applyAdjustmentToSummary(
    base: SummaryCalculationResult,
    schedule: ResolvedAttendanceSchedule,
    punches: {
      checkInAt: Date | null;
      checkOutAt: Date | null;
      breakMinutes: number;
    },
    context: Omit<
      SummaryCalculationInput,
      'schedule' | 'checkInAt' | 'checkOutAt' | 'breakMinutes'
    >,
    adjustment: AttendanceDailySummaryAdjustment | null,
  ) {
    if (!adjustment) {
      return {
        ...base,
        checkInAt: punches.checkInAt,
        checkOutAt: punches.checkOutAt,
      };
    }

    const adjustedPunches = {
      checkInAt:
        adjustment.checkInAtOverride !== null
          ? adjustment.checkInAtOverride
          : punches.checkInAt,
      checkOutAt:
        adjustment.checkOutAtOverride !== null
          ? adjustment.checkOutAtOverride
          : punches.checkOutAt,
      breakMinutes:
        adjustment.breakMinutesOverride !== null
          ? adjustment.breakMinutesOverride
          : punches.breakMinutes,
    };

    const recalculated = this.calculateSummaryValues({
      schedule,
      checkInAt: adjustedPunches.checkInAt,
      checkOutAt: adjustedPunches.checkOutAt,
      breakMinutes: adjustedPunches.breakMinutes,
      ...context,
    });

    // When the admin supplied an explicit status, use it; otherwise mark as
    // MANUAL_CORRECTION so the record is distinguishable from a naturally-computed one.
    const resolvedStatus =
      (adjustment.statusOverride as AttendanceDailyStatusEnum | null) ??
      AttendanceDailyStatusEnum.MANUAL_CORRECTION;

    return {
      shouldPersist: true,
      attendanceStatus: resolvedStatus,
      lateMinutes:
        adjustment.lateMinutesOverride ?? recalculated.lateMinutes,
      earlyDepartureMinutes:
        adjustment.earlyDepartureMinutesOverride ??
        recalculated.earlyDepartureMinutes,
      breakMinutes:
        adjustment.breakMinutesOverride ?? recalculated.breakMinutes,
      workMinutes:
        adjustment.workMinutesOverride ?? recalculated.workMinutes,
      overtimeMinutes:
        adjustment.overtimeMinutesOverride ?? recalculated.overtimeMinutes,
      flags: {
        ...recalculated.flags,
        manualAdjustment: {
          id: adjustment.id,
          notes: adjustment.notes,
          appliedAt: adjustment.appliedAt,
          appliedByCompanyUserId: adjustment.appliedByCompanyUserId,
        },
      },
      checkInAt: adjustedPunches.checkInAt,
      checkOutAt: adjustedPunches.checkOutAt,
    };
  }

  private buildSummaryExceptionDrafts(input: {
    companyId: number;
    employeeId: number;
    branchId: number | null;
    deviceId: number | null;
    attendanceDate: string;
    employeeNo: string;
    summaryId: number;
    punchAnalysis: PreparedPunchAnalysis;
    schedule: ResolvedAttendanceSchedule;
    hasScheduleExpectation: boolean;
    noScheduleFound: boolean;
  }) {
    const drafts: Array<{
      companyId: number;
      branchId: number | null;
      employeeId: number | null;
      summaryId: number | null;
      deviceId: number | null;
      attendanceDate: string;
      employeeNo: string;
      exceptionType: AttendanceExceptionTypeEnum;
      message: string;
      metadata?: Record<string, unknown>;
    }> = [];

    if (input.noScheduleFound) {
      drafts.push({
        companyId: input.companyId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        summaryId: input.summaryId,
        deviceId: input.deviceId,
        attendanceDate: input.attendanceDate,
        employeeNo: input.employeeNo,
        exceptionType: AttendanceExceptionTypeEnum.NO_SCHEDULE_FOUND,
        message: 'Employee had attendance activity or a schedule expectation but no usable schedule could be resolved.',
        metadata: {
          schedule_source: input.schedule.source,
          has_schedule_expectation: input.hasScheduleExpectation,
        },
      });
    }

    if (input.punchAnalysis.duplicatePunches.length > 0) {
      drafts.push({
        companyId: input.companyId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        summaryId: input.summaryId,
        deviceId: input.deviceId,
        attendanceDate: input.attendanceDate,
        employeeNo: input.employeeNo,
        exceptionType: AttendanceExceptionTypeEnum.DUPLICATE_PUNCH,
        message: 'Duplicate punches were detected within the same attendance window.',
        metadata: {
          punch_ids: input.punchAnalysis.duplicatePunches.map((item) => item.id),
          raw_log_ids: input.punchAnalysis.duplicatePunches
            .map((item) => item.rawLogId)
            .filter((item): item is number => typeof item === 'number'),
        },
      });
    }

    if (input.punchAnalysis.invalidPunches.length > 0) {
      drafts.push({
        companyId: input.companyId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        summaryId: input.summaryId,
        deviceId: input.deviceId,
        attendanceDate: input.attendanceDate,
        employeeNo: input.employeeNo,
        exceptionType: AttendanceExceptionTypeEnum.INVALID_PUNCH_TIME,
        message: 'One or more punches could not be used safely in attendance calculation.',
        metadata: {
          punch_ids: input.punchAnalysis.invalidPunches.map((item) => item.id),
          raw_log_ids: input.punchAnalysis.invalidPunches
            .map((item) => item.rawLogId)
            .filter((item): item is number => typeof item === 'number'),
        },
      });
    }

    if (!input.punchAnalysis.checkInAt && input.punchAnalysis.checkOutAt) {
      drafts.push({
        companyId: input.companyId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        summaryId: input.summaryId,
        deviceId: input.deviceId,
        attendanceDate: input.attendanceDate,
        employeeNo: input.employeeNo,
        exceptionType: AttendanceExceptionTypeEnum.MISSING_CHECK_IN,
        message: 'Attendance day has a usable check-out punch but no usable check-in punch.',
      });
    }

    if (
      input.punchAnalysis.checkInAt &&
      !input.punchAnalysis.checkOutAt &&
      input.schedule.requiresCheckout
    ) {
      drafts.push({
        companyId: input.companyId,
        branchId: input.branchId,
        employeeId: input.employeeId,
        summaryId: input.summaryId,
        deviceId: input.deviceId,
        attendanceDate: input.attendanceDate,
        employeeNo: input.employeeNo,
        exceptionType: AttendanceExceptionTypeEnum.MISSING_CHECK_OUT,
        message: 'Attendance day has a usable check-in punch but no usable check-out punch.',
      });
    }

    return drafts;
  }

  private async hasScheduleExpectation(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ): Promise<boolean> {
    const [shiftSchedule, shiftAssignment, timetableAssignment] = await Promise.all([
      this.shiftScheduleRepository.findOne({
        where: { companyId, employeeId, scheduleDate: attendanceDate },
        select: { id: true, isOffDay: true },
      }),
      this.shiftAssignmentRepository
        .createQueryBuilder('assignment')
        .select(['assignment.id'])
        .where('assignment.company_id = :companyId', { companyId })
        .andWhere('assignment.employee_id = :employeeId', { employeeId })
        .andWhere('assignment.status = :status', {
          status: ShiftAssignmentStatusEnum.ACTIVE,
        })
        .andWhere('assignment.effective_from <= :attendanceDate', {
          attendanceDate,
        })
        .andWhere('(assignment.effective_to IS NULL OR assignment.effective_to >= :attendanceDate)', {
          attendanceDate,
        })
        .getOne(),
      this.employeeTimetableRepository
        .createQueryBuilder('assignment')
        .select(['assignment.id'])
        .where('assignment.company_id = :companyId', { companyId })
        .andWhere('assignment.employee_id = :employeeId', { employeeId })
        .andWhere('assignment.status = :status', {
          status: EmployeeTimetableStatusEnum.ACTIVE,
        })
        .andWhere('assignment.effective_from <= :attendanceDate', {
          attendanceDate,
        })
        .andWhere('(assignment.effective_to IS NULL OR assignment.effective_to >= :attendanceDate)', {
          attendanceDate,
        })
        .getOne(),
    ]);

    if (shiftSchedule) {
      return !shiftSchedule.isOffDay;
    }

    return !!shiftAssignment || !!timetableAssignment;
  }

  private async findActiveAdjustment(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ) {
    return this.adjustmentRepository.findOne({
      where: {
        companyId,
        employeeId,
        attendanceDate,
        isActive: true,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  /**
   * Returns the leave status enum value for the employee on the given date,
   * or null if no approved leave exists.
   * The status is derived from the leave type's code and is_paid flag:
   *   - is_paid=false                          → UNPAID_LEAVE
   *   - code contains SICK / MEDICAL           → SICK
   *   - code contains ANNUAL / CASUAL / EARNED → ANNUAL_LEAVE
   *   - anything else                          → LEAVE
   */
  private async resolveApprovedLeave(
    companyId: number,
    employeeId: number,
    date: string,
  ): Promise<AttendanceDailyStatusEnum | null> {
    const leave = await this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .leftJoinAndSelect('leaveRequest.leave_type', 'leaveType')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leaveRequest.start_date <= :date', { date })
      .andWhere('leaveRequest.end_date >= :date', { date })
      .getOne();

    if (!leave) return null;

    return this.mapLeaveTypeToStatus(
      leave.leave_type?.code ?? null,
      leave.leave_type?.is_paid ?? null,
    );
  }

  private mapLeaveTypeToStatus(
    code: string | null,
    isPaid: boolean | null,
  ): AttendanceDailyStatusEnum {
    // Unpaid indicator is the most reliable signal — check it first
    if (isPaid === false) return AttendanceDailyStatusEnum.UNPAID_LEAVE;

    if (!code) return AttendanceDailyStatusEnum.LEAVE;

    const upper = code.toUpperCase();
    if (upper.includes('SICK') || upper.includes('MEDICAL')) {
      return AttendanceDailyStatusEnum.SICK;
    }
    if (upper.includes('ANNUAL') || upper.includes('CASUAL') || upper.includes('EARNED')) {
      return AttendanceDailyStatusEnum.ANNUAL_LEAVE;
    }

    return AttendanceDailyStatusEnum.LEAVE;
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

  private buildDateRange(startDate: string, endDate: string): string[] {
    return buildDateOnlyRange(startDate, endDate);
  }

  private normalizeDate(value: string, field: string): string {
    try {
      return normalizeDateInput(value, field);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private parseOptionalDate(value: string | null | undefined, field: string): Date | null {
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date-time`);
    }

    return parsed;
  }

  private getDayOfWeek(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
  }
}
