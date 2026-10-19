import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  EntityManager,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AttendanceProcessingException } from './entities/attendance-processing-exception.entity';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import {
  buildDateOnlyRange,
  buildPaginationMeta,
  normalizeDateInput,
} from '../../shared/hr.utils';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveType } from '../../leave/entities/leave-type.entity';
import { LeaveBalanceService } from '../../leave/services/leave-balance.service';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
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
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../timetable/timetables/enums/timetable-status.enum';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceDailySummaryAdjustment } from './entities/attendance-daily-summary-adjustment.entity';
import { AttendanceDailySummary } from './entities/attendance-daily-summary.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { ResolvedAttendanceSchedule } from './entities/resolved-attendance-schedule.type';
import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import { AttendanceDailyRemarkEnum } from './enums/attendance-daily-remark.enum';
import { QueryAttendanceDailySummariesDto } from './dtos/query-attendance-daily-summaries.dto';
import { QueryUnmatchedAttendanceLogsDto } from './dtos/query-unmatched-attendance-logs.dto';
import { UpsertAttendanceDailySummaryAdjustmentDto } from './dtos/upsert-attendance-daily-summary-adjustment.dto';
import { AttendanceExceptionTypeEnum } from './enums/attendance-exception-type.enum';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceScheduleResolverService } from './attendance-schedule-resolver.service';
import { AttendanceHolidayPolicyModeEnum } from '../policies/enums/attendance-holiday-policy-mode.enum';
import { AttendanceRoundingModeEnum } from '../policies/enums/attendance-rounding-mode.enum';
import { AttendanceProcessedEventDirectionEnum } from './enums/attendance-processed-event-direction.enum';
import { AttendancePunchTypeEnum } from '../mobile-punches/enums/attendance-punch-type.enum';
import {
  NormalizedAttendanceSummaryQuery,
  normalizeAttendanceSummaryQuery,
} from './attendance-summary-query.util';
import { HrAccessService } from '../../shared/hr-access.service';
import { AttendanceReportRow } from './reports/attendance-report.types';
import {
  buildEmployeeFullName,
  resolveReportLabel,
} from './reports/attendance-report.utils';

type AttendanceEventPoint = {
  id: string;
  eventTime: Date;
  rawLogId: number | null;
  source: 'processed' | 'mobile';
  direction: AttendanceProcessedEventDirectionEnum;
};

type PreparedPunchAnalysis = {
  effectivePunches: AttendanceEventPoint[];
  duplicatePunches: AttendanceEventPoint[];
  invalidPunches: AttendanceEventPoint[];
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakMinutes: number;
  hasSameTimeCheckInOut: boolean;
  usedDirectionAwarePairing: boolean;
  missingPunchCount: number;
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
  invalidPunchCount: number;
  duplicatePunchCount: number;
  hasSameTimeCheckInOut: boolean;
  hasMultiplePunches: boolean;
  usedDirectionAwarePairing: boolean;
  missingPunchCount: number;
};

type SummaryCalculationResult = {
  shouldPersist: boolean;
  attendanceStatus: AttendanceDailyStatusEnum;
  remarks: AttendanceDailyRemarkEnum[];
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
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
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
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    private readonly scheduleResolver: AttendanceScheduleResolverService,
    private readonly exceptionService: AttendanceProcessingExceptionsService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly hrAccessService: HrAccessService,
  ) {}

  private transactionManager?: EntityManager;

  private inTransaction(manager: EntityManager): AttendanceDailySummaryService {
    const scoped = new AttendanceDailySummaryService(
      manager.getRepository(AttendanceProcessedEvent),
      manager.getRepository(AttendanceDailySummary),
      manager.getRepository(AttendanceDailySummaryAdjustment),
      manager.getRepository(AttendanceMobilePunch),
      manager.getRepository(LeaveRequest),
      manager.getRepository(LeaveType),
      manager.getRepository(AttendanceBusinessTrip),
      manager.getRepository(Employee),
      manager.getRepository(EmployeeDeviceAssignment),
      manager.getRepository(EmployeeTimetable),
      manager.getRepository(ShiftAssignment),
      manager.getRepository(ShiftSchedule),
      manager.getRepository(ShiftBreak),
      manager.getRepository(TimetableDay),
      manager.getRepository(Timetable),
      this.scheduleResolver,
      new AttendanceProcessingExceptionsService(
        manager.getRepository(AttendanceProcessingException),
      ),
      this.leaveBalanceService,
      this.hrAccessService,
    );
    scoped.transactionManager = manager;
    return scoped;
  }

  async rebuildSummariesForRange(input: {
    companyId: number;
    startDate: string;
    endDate: string;
    employeeId?: number;
    deviceId?: number;
    forceRebuild?: boolean;
  }) {
    const {
      companyId,
      startDate,
      endDate,
      employeeId,
      deviceId,
      forceRebuild = false,
    } = input;

    const employeeIds = await this.resolveTargetEmployees(
      companyId,
      startDate,
      endDate,
      employeeId,
      deviceId,
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
    const fiscalYearRefreshKeys = new Set<string>();

    for (const targetEmployeeId of employeeIds) {
      for (const date of dates) {
        const changed = await this.recomputeForEmployeeDate(
          companyId,
          targetEmployeeId,
          date,
          false,
        );
        if (changed) summariesUpserted += 1;
        fiscalYearRefreshKeys.add(
          `${targetEmployeeId}:${this.leaveBalanceService.getFiscalYearFromDate(
            date,
          )}`,
        );
      }
    }

    for (const key of fiscalYearRefreshKeys) {
      const [employeeIdToken, fiscalYear] = key.split(':');
      await this.refreshAttendanceAffectedLeaveBalances(
        companyId,
        Number(employeeIdToken),
        fiscalYear,
        'Attendance summary range rebuild',
      );
    }

    return {
      employeeCount: employeeIds.length,
      daysComputed: employeeIds.length * dates.length,
      summariesUpserted,
    };
  }

  async rebuildSummariesForEmployeeDates(input: {
    companyId: number;
    employeeDates: Array<{ employeeId: number; attendanceDate: string }>;
    refreshLeaveBalances?: boolean;
  }) {
    const { companyId, employeeDates, refreshLeaveBalances = true } = input;
    const uniquePairs = new Map<
      string,
      { employeeId: number; attendanceDate: string }
    >();

    for (const employeeDate of employeeDates) {
      if (!employeeDate?.employeeId) {
        continue;
      }

      const normalizedAttendanceDate = this.normalizeDate(
        employeeDate.attendanceDate,
        'attendanceDate',
      );
      uniquePairs.set(
        `${employeeDate.employeeId}:${normalizedAttendanceDate}`,
        {
          employeeId: employeeDate.employeeId,
          attendanceDate: normalizedAttendanceDate,
        },
      );
    }

    if (uniquePairs.size === 0) {
      return {
        employeeCount: 0,
        daysComputed: 0,
        summariesUpserted: 0,
      };
    }

    let summariesUpserted = 0;
    const uniqueEmployeeIds = new Set<number>();
    const fiscalYearRefreshKeys = new Set<string>();

    for (const employeeDate of uniquePairs.values()) {
      const changed = await this.recomputeForEmployeeDate(
        companyId,
        employeeDate.employeeId,
        employeeDate.attendanceDate,
        false,
      );
      if (changed) {
        summariesUpserted += 1;
      }

      uniqueEmployeeIds.add(employeeDate.employeeId);
      fiscalYearRefreshKeys.add(
        `${employeeDate.employeeId}:${this.leaveBalanceService.getFiscalYearFromDate(
          employeeDate.attendanceDate,
        )}`,
      );
    }

    if (refreshLeaveBalances) {
      for (const key of fiscalYearRefreshKeys) {
        const [employeeIdToken, fiscalYear] = key.split(':');
        await this.refreshAttendanceAffectedLeaveBalances(
          companyId,
          Number(employeeIdToken),
          fiscalYear,
          'Attendance summary incremental rebuild',
        );
      }
    }

    return {
      employeeCount: uniqueEmployeeIds.size,
      daysComputed: uniquePairs.size,
      summariesUpserted,
    };
  }

  async recomputeForEmployeeDate(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
    refreshLeaveBalances = true,
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

    if (!employee?.id) {
      return false;
    }

    const existing = await this.dailySummaryRepository.findOne({
      where: {
        companyId,
        employeeId,
        attendanceDate: normalizedAttendanceDate,
      },
    });

    if (employee?.exit_date && normalizedAttendanceDate > employee.exit_date) {
      if (existing) {
        await this.dailySummaryRepository.remove(existing);
        if (refreshLeaveBalances) {
          await this.refreshAttendanceAffectedLeaveBalances(
            companyId,
            employeeId,
            this.leaveBalanceService.getFiscalYearFromDate(
              normalizedAttendanceDate,
            ),
            'Attendance summary removed after employee exit date',
          );
        }
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

    const [
      processedEvents,
      mobilePunches,
      leaveStatus,
      hasApprovedBusinessTrip,
      scheduledBreakMinutes,
      activeAdjustment,
    ] = await Promise.all([
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
      this.resolveApprovedLeave(
        companyId,
        employeeId,
        normalizedAttendanceDate,
      ),
      this.hasApprovedBusinessTrip(
        companyId,
        employeeId,
        normalizedAttendanceDate,
      ),
      this.resolveScheduledBreakMinutes(schedule, normalizedAttendanceDate),
      this.findActiveAdjustment(
        companyId,
        employeeId,
        normalizedAttendanceDate,
      ),
    ]);

    const events = [
      ...processedEvents.map((event) => ({
        id: `processed:${event.id}`,
        eventTime: event.eventTime,
        rawLogId: event.rawLogId,
        source: 'processed' as const,
        direction:
          event.direction ?? AttendanceProcessedEventDirectionEnum.UNKNOWN,
      })),
      ...mobilePunches.map((punch) => ({
        id: `mobile:${punch.id}`,
        eventTime: punch.punchTime,
        rawLogId: null,
        source: 'mobile' as const,
        direction: this.mapMobilePunchDirection(punch.punchType),
      })),
    ].sort(
      (left, right) => left.eventTime.getTime() - right.eventTime.getTime(),
    );

    const punchAnalysis = this.preparePunches(events, schedule);
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
      invalidPunchCount: punchAnalysis.invalidPunches.length,
      duplicatePunchCount: punchAnalysis.duplicatePunches.length,
      hasSameTimeCheckInOut: punchAnalysis.hasSameTimeCheckInOut,
      hasMultiplePunches: punchAnalysis.effectivePunches.length > 2,
      usedDirectionAwarePairing: punchAnalysis.usedDirectionAwarePairing,
      missingPunchCount: punchAnalysis.missingPunchCount,
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
        invalidPunchCount: punchAnalysis.invalidPunches.length,
        duplicatePunchCount: punchAnalysis.duplicatePunches.length,
        hasSameTimeCheckInOut: punchAnalysis.hasSameTimeCheckInOut,
        hasMultiplePunches: punchAnalysis.effectivePunches.length > 2,
        usedDirectionAwarePairing: punchAnalysis.usedDirectionAwarePairing,
        missingPunchCount: punchAnalysis.missingPunchCount,
      },
      activeAdjustment,
    );

    const monthlyOvertimeLimit = schedule.maxOvertimeMinutesPerMonth;
    if (monthlyOvertimeLimit > 0) {
      const monthStart = `${normalizedAttendanceDate.slice(0, 7)}-01`;
      const previousDate = new Date(
        `${normalizedAttendanceDate}T00:00:00.000Z`,
      );
      previousDate.setUTCDate(previousDate.getUTCDate() - 1);
      const previousDateOnly = previousDate.toISOString().slice(0, 10);
      const previousSummaries =
        previousDateOnly >= monthStart
          ? await this.dailySummaryRepository.find({
              where: {
                companyId,
                employeeId,
                attendanceDate: Between(monthStart, previousDateOnly),
              },
              select: {
                attendanceDate: true,
                overtimeMinutes: true,
              },
            })
          : [];
      const overtimeBeforeDate = previousSummaries.reduce(
        (total, summary) => total + Math.max(0, summary.overtimeMinutes ?? 0),
        0,
      );
      const monthlyRemaining = Math.max(
        0,
        monthlyOvertimeLimit - overtimeBeforeDate,
      );
      const originalOvertimeMinutes = summaryValues.overtimeMinutes;
      summaryValues.overtimeMinutes = Math.min(
        originalOvertimeMinutes,
        monthlyRemaining,
      );
      summaryValues.flags = {
        ...summaryValues.flags,
        monthlyOvertimeLimitMinutes: monthlyOvertimeLimit,
        monthlyOvertimeUsedBeforeDateMinutes: overtimeBeforeDate,
        monthlyOvertimeCappedMinutes:
          originalOvertimeMinutes - summaryValues.overtimeMinutes,
      };
    }

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
      if (refreshLeaveBalances) {
        await this.refreshAttendanceAffectedLeaveBalances(
          companyId,
          employeeId,
          this.leaveBalanceService.getFiscalYearFromDate(
            normalizedAttendanceDate,
          ),
          'Attendance summary removed after recalculation',
        );
      }
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
      remarks: summaryValues.remarks,
      flags: summaryValues.flags,
      sourceFirstRawLogId: firstEvent?.rawLogId ?? null,
      sourceLastRawLogId: lastEvent?.rawLogId ?? null,
      calculationVersion: 2,
      isAdjusted: !!activeAdjustment,
      adjustedByCompanyUserId: activeAdjustment?.appliedByCompanyUserId ?? null,
      adjustedAt: activeAdjustment?.appliedAt ?? null,
      finalizedAt: null,
    };

    const savedSummary = await this.upsertDailySummary(payload, existing);

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

    if (refreshLeaveBalances) {
      await this.refreshAttendanceAffectedLeaveBalances(
        companyId,
        employeeId,
        this.leaveBalanceService.getFiscalYearFromDate(
          normalizedAttendanceDate,
        ),
        'Attendance summary recalculated',
      );
    }

    return true;
  }

  async upsertAdjustment(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
    dto: UpsertAttendanceDailySummaryAdjustmentDto,
    appliedByCompanyUserId: number | null,
    options?: {
      metadata?: Record<string, unknown> | null;
    },
    manager?: EntityManager,
  ): Promise<AttendanceDailySummary | null> {
    if (manager) {
      await manager.getRepository(Employee).findOneOrFail({
        where: { id: employeeId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      return this.inTransaction(manager).upsertAdjustment(
        companyId,
        employeeId,
        attendanceDate,
        dto,
        appliedByCompanyUserId,
        options,
      );
    }
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
        checkInAtOverride: this.parseOptionalDate(
          dto.check_in_at,
          'check_in_at',
        ),
        checkOutAtOverride: this.parseOptionalDate(
          dto.check_out_at,
          'check_out_at',
        ),
        breakMinutesOverride: dto.break_minutes ?? null,
        workMinutesOverride: dto.worked_minutes ?? null,
        lateMinutesOverride: dto.late_minutes ?? null,
        earlyDepartureMinutesOverride: dto.early_departure_minutes ?? null,
        overtimeMinutesOverride: dto.overtime_minutes ?? null,
        notes: dto.notes?.trim() || null,
        metadata: {
          source: 'MANUAL_ADJUSTMENT',
          ...(options?.metadata ?? {}),
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

  async findDailySummaries(
    companyId: number,
    query: QueryAttendanceDailySummariesDto,
    actor?: AuthenticatedUser,
  ) {
    const normalizedQuery = normalizeAttendanceSummaryQuery(query);
    const {
      page,
      limit,
      sortBy = 'attendance_date',
      sortOrder = SortDirection.DESC,
    } = normalizedQuery;

    const qb = this.dailySummaryRepository
      .createQueryBuilder('summary')
      .leftJoinAndSelect('summary.employee', 'employee')
      .leftJoinAndSelect('summary.shift', 'shift')
      .leftJoinAndSelect('summary.timetable', 'timetable');

    const isAccessible = await this.applyDailySummaryFilters(
      qb,
      companyId,
      normalizedQuery,
      actor,
    );

    if (!isAccessible) {
      return {
        data: [],
        meta: buildPaginationMeta(0, 0, limit, page),
      };
    }

    const sortableColumns = new Set([
      'attendance_date',
      'created_at',
      'updated_at',
      'employee_id',
      'attendance_status',
    ]);
    const columnPropertyMap: Record<string, string> = {
      attendance_date: 'attendanceDate',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
      employee_id: 'employeeId',
      attendance_status: 'attendanceStatus',
    };
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'attendance_date';
    const safeSortProperty = columnPropertyMap[safeSortBy] ?? safeSortBy;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`summary.${safeSortProperty}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  async streamReportRows(
    companyId: number,
    query: QueryAttendanceDailySummariesDto,
    actor: AuthenticatedUser | undefined,
    onBatch: (rows: AttendanceReportRow[]) => Promise<void>,
    batchSize = 1000,
  ): Promise<number> {
    const normalizedQuery = normalizeAttendanceSummaryQuery(query);
    let lastSummaryId = 0;
    let totalRows = 0;

    while (true) {
      const qb = this.dailySummaryRepository
        .createQueryBuilder('summary')
        .innerJoin('summary.employee', 'employee')
        .leftJoin('summary.shift', 'shift')
        .leftJoin('summary.timetable', 'timetable')
        .select('summary.id', 'summaryId')
        .addSelect('summary.attendance_date', 'attendanceDate')
        .addSelect('summary.attendance_status', 'attendanceStatus')
        .addSelect('summary.check_in_at', 'checkInAt')
        .addSelect('summary.check_out_at', 'checkOutAt')
        .addSelect('summary.timezone', 'timezone')
        .addSelect('employee.employee_no', 'employeeNumber')
        .addSelect('employee.first_name', 'employeeFirstName')
        .addSelect('employee.middle_name', 'employeeMiddleName')
        .addSelect('employee.last_name', 'employeeLastName')
        .addSelect('shift.name', 'shiftName')
        .addSelect('shift.code', 'shiftCode')
        .addSelect('timetable.name', 'timetableName')
        .addSelect('timetable.code', 'timetableCode');

      const isAccessible = await this.applyDailySummaryFilters(
        qb,
        companyId,
        normalizedQuery,
        actor,
      );

      if (!isAccessible) {
        return 0;
      }

      qb.andWhere('summary.id > :lastSummaryId', { lastSummaryId })
        .orderBy('summary.id', 'ASC')
        .take(batchSize);

      const rows = await qb.getRawMany<{
        summaryId: number | string;
        attendanceDate: string;
        attendanceStatus: string;
        checkInAt: Date | null;
        checkOutAt: Date | null;
        timezone: string;
        employeeNumber: string;
        employeeFirstName: string;
        employeeMiddleName: string | null;
        employeeLastName: string;
        shiftName: string | null;
        shiftCode: string | null;
        timetableName: string | null;
        timetableCode: string | null;
      }>();

      if (rows.length === 0) {
        break;
      }

      const mappedRows = rows.map((row) => ({
        summaryId: Number(row.summaryId),
        employeeName:
          buildEmployeeFullName([
            row.employeeFirstName,
            row.employeeMiddleName,
            row.employeeLastName,
          ]) || row.employeeNumber,
        employeeNumber: row.employeeNumber,
        attendanceDate: row.attendanceDate,
        shiftName: resolveReportLabel(row.shiftName, row.shiftCode),
        timetableName: resolveReportLabel(row.timetableName, row.timetableCode),
        attendanceStatus: row.attendanceStatus,
        checkInAt: row.checkInAt ? new Date(row.checkInAt) : null,
        checkOutAt: row.checkOutAt ? new Date(row.checkOutAt) : null,
        timezone: row.timezone,
      }));

      totalRows += mappedRows.length;
      lastSummaryId = mappedRows[mappedRows.length - 1].summaryId;
      await onBatch(mappedRows);

      if (rows.length < batchSize) {
        break;
      }
    }

    return totalRows;
  }

  async findUnmatchedLogs(
    companyId: number,
    query: QueryUnmatchedAttendanceLogsDto,
  ) {
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

    if (from_date)
      qb.andWhere('event.attendance_date >= :fromDate', {
        fromDate: from_date,
      });
    if (to_date)
      qb.andWhere('event.attendance_date <= :toDate', { toDate: to_date });
    if (device_id)
      qb.andWhere('event.device_id = :deviceId', { deviceId: device_id });

    const sortableColumns = new Set([
      'event_time',
      'attendance_date',
      'created_at',
    ]);
    const columnPropertyMap: Record<string, string> = {
      event_time: 'eventTime',
      attendance_date: 'attendanceDate',
      created_at: 'createdAt',
    };
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'event_time';
    const safeSortProperty = columnPropertyMap[safeSortBy] ?? safeSortBy;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [rows, total] = await qb
      .orderBy(`event.${safeSortProperty}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      meta: buildPaginationMeta(total, rows.length, limit, page),
    };
  }

  private async applyDailySummaryFilters(
    qb: SelectQueryBuilder<AttendanceDailySummary>,
    companyId: number,
    query: NormalizedAttendanceSummaryQuery,
    actor?: AuthenticatedUser,
  ): Promise<boolean> {
    qb.where('summary.company_id = :companyId', { companyId });

    if (query.employeeId) {
      qb.andWhere('summary.employee_id = :employeeId', {
        employeeId: query.employeeId,
      });
    }

    if (query.employeeNo) {
      qb.andWhere('employee.employee_no = :employeeNo', {
        employeeNo: query.employeeNo,
      });
    }

    if (query.fromDate) {
      qb.andWhere('summary.attendance_date >= :fromDate', {
        fromDate: query.fromDate,
      });
    }

    if (query.toDate) {
      qb.andWhere('summary.attendance_date <= :toDate', {
        toDate: query.toDate,
      });
    }

    if (query.branchId && actor) {
      await this.hrAccessService.assertCanAccessBranch(actor, query.branchId);
    }

    if (query.branchId) {
      qb.andWhere(
        `(
          summary.branch_id = :branchId
          OR employee.primary_branch_id = :branchId
          OR EXISTS (
            SELECT 1
            FROM employee_departments department_assignments
            INNER JOIN departments department
              ON department.id = department_assignments.department_id
            WHERE department_assignments.employee_id = employee.id
              AND department.branch_id = :branchId
          )
        )`,
        { branchId: query.branchId },
      );
    }

    if (query.departmentId) {
      qb.andWhere(
        `(
          employee.primary_department_id = :departmentId
          OR EXISTS (
            SELECT 1
            FROM employee_departments department_assignments
            WHERE department_assignments.employee_id = employee.id
              AND department_assignments.department_id = :departmentId
          )
        )`,
        { departmentId: query.departmentId },
      );
    }

    if (query.organizationId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM organization_employees organization_assignments
          INNER JOIN access_organizations organization
            ON organization.id = organization_assignments.organization_id
          WHERE organization_assignments.employee_id = employee.id
            AND organization_assignments.organization_id = :organizationId
            AND organization.company_id = :companyId
        )`,
        {
          organizationId: query.organizationId,
          companyId,
        },
      );
    }

    if (query.shiftId) {
      qb.andWhere('summary.shift_id = :shiftId', { shiftId: query.shiftId });
    }

    if (query.timetableId) {
      qb.andWhere('summary.timetable_id = :timetableId', {
        timetableId: query.timetableId,
      });
    }

    if (query.status) {
      qb.andWhere('summary.attendance_status = :status', {
        status: query.status,
      });
    }

    if (!actor) {
      return true;
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);

    if (accessibleBranchIds?.length === 0) {
      return false;
    }

    if (accessibleBranchIds) {
      qb.andWhere(
        `(
          summary.branch_id IN (:...branchIds)
          OR employee.primary_branch_id IN (:...branchIds)
          OR EXISTS (
            SELECT 1
            FROM employee_departments department_assignments
            INNER JOIN departments department
              ON department.id = department_assignments.department_id
            WHERE department_assignments.employee_id = employee.id
              AND department.branch_id IN (:...branchIds)
          )
        )`,
        { branchIds: accessibleBranchIds },
      );
    }

    return true;
  }

  private async resolveTargetEmployees(
    companyId: number,
    startDate: string,
    endDate: string,
    employeeId?: number,
    deviceId?: number,
  ): Promise<number[]> {
    if (employeeId) {
      return this.filterExistingEmployeeIds(companyId, [employeeId]);
    }

    if (deviceId) {
      const [assignmentRows, eventRows] = await Promise.all([
        this.employeeDeviceAssignmentRepository
          .createQueryBuilder('assignment')
          .select('DISTINCT assignment.employee_id', 'employeeId')
          .where('assignment.company_id = :companyId', { companyId })
          .andWhere('assignment.device_id = :deviceId', { deviceId })
          .andWhere('assignment.employee_id IS NOT NULL')
          .getRawMany<{ employeeId: string }>(),
        this.processedEventRepository
          .createQueryBuilder('event')
          .select('DISTINCT event.employee_id', 'employeeId')
          .where('event.company_id = :companyId', { companyId })
          .andWhere('event.device_id = :deviceId', { deviceId })
          .andWhere('event.employee_id IS NOT NULL')
          .andWhere('event.attendance_date >= :startDate', { startDate })
          .andWhere('event.attendance_date <= :endDate', { endDate })
          .getRawMany<{ employeeId: string }>(),
      ]);

      const deviceEmployeeIds = new Set<number>();
      for (const row of [...assignmentRows, ...eventRows]) {
        const value = Number(row.employeeId);
        if (Number.isInteger(value) && value > 0) {
          deviceEmployeeIds.add(value);
        }
      }

      return this.filterExistingEmployeeIds(companyId, [...deviceEmployeeIds]);
    }

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
      .andWhere(
        '(assignment.effective_to IS NULL OR assignment.effective_to >= :startDate)',
        {
          startDate,
        },
      )
      .getRawMany<{ employeeId: string }>();

    const shiftAssignmentRows = await this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .select('DISTINCT assignment.employee_id', 'employeeId')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :endDate', { endDate })
      .andWhere(
        '(assignment.effective_to IS NULL OR assignment.effective_to >= :startDate)',
        {
          startDate,
        },
      )
      .getRawMany<{ employeeId: string }>();

    const shiftScheduleRows = await this.shiftScheduleRepository
      .createQueryBuilder('schedule')
      .select('DISTINCT schedule.employee_id', 'employeeId')
      .where('schedule.company_id = :companyId', { companyId })
      .andWhere('schedule.effective_from <= :endDate', { endDate })
      .andWhere(
        '(schedule.effective_to IS NULL OR schedule.effective_to >= :startDate)',
        {
          startDate,
        },
      )
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

    const defaultTimetable = await this.timetableRepository.findOne({
      where: {
        companyId,
        isDefault: true,
        status: TimetableStatusEnum.ACTIVE,
      },
      select: { id: true },
    });
    if (defaultTimetable) {
      const employeeRows = await this.employeeRepository
        .createQueryBuilder('employee')
        .innerJoin('employee.company_user', 'companyUser')
        .select('employee.id', 'employeeId')
        .where('companyUser.company_id = :companyId', { companyId })
        .andWhere(
          '(employee.exit_date IS NULL OR employee.exit_date >= :startDate)',
          { startDate },
        )
        .getRawMany<{ employeeId: string }>();

      for (const row of employeeRows) {
        const value = Number(row.employeeId);
        if (Number.isInteger(value) && value > 0) {
          employeeIds.add(value);
        }
      }
    }

    return this.filterExistingEmployeeIds(companyId, [...employeeIds]);
  }

  private async filterExistingEmployeeIds(
    companyId: number,
    employeeIds: number[],
  ): Promise<number[]> {
    const uniqueIds = Array.from(
      new Set(
        employeeIds.filter((value) => Number.isInteger(value) && value > 0),
      ),
    );

    if (uniqueIds.length === 0) {
      return [];
    }

    const rows = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .select('employee.id', 'employeeId')
      .where('employee.id IN (:...employeeIds)', { employeeIds: uniqueIds })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getRawMany<{ employeeId: string }>();

    return rows
      .map((row) => Number(row.employeeId))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((left, right) => left - right);
  }

  private async upsertDailySummary(
    payload: Partial<AttendanceDailySummary>,
    existing: AttendanceDailySummary | null,
  ): Promise<AttendanceDailySummary> {
    const upsertFn = (
      this.dailySummaryRepository as Repository<AttendanceDailySummary> & {
        upsert?: Repository<AttendanceDailySummary>['upsert'];
      }
    ).upsert;

    if (typeof upsertFn !== 'function') {
      return existing
        ? await this.dailySummaryRepository.save(
            Object.assign(existing, payload),
          )
        : await this.dailySummaryRepository.save(
            this.dailySummaryRepository.create(payload),
          );
    }

    try {
      await upsertFn.call(this.dailySummaryRepository, payload, {
        conflictPaths: ['companyId', 'employeeId', 'attendanceDate'],
      });
    } catch (error) {
      if (!this.isDuplicateError(error)) {
        throw error;
      }
    }

    const saved = await this.dailySummaryRepository.findOne({
      where: {
        companyId: payload.companyId!,
        employeeId: payload.employeeId!,
        attendanceDate: payload.attendanceDate!,
      },
    });

    if (!saved) {
      throw new BadRequestException(
        'Attendance daily summary upsert completed without a readable record',
      );
    }

    return saved;
  }

  private isDuplicateError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const err = error as QueryFailedError & { code?: string; errno?: number };
    return (
      err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || err.code === '23505'
    );
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

    const window = this.buildEventWindow(schedule);
    if (window) {
      qb.andWhere('event.event_time >= :windowStart', {
        windowStart: window.start,
      });
      qb.andWhere('event.event_time <= :windowEnd', {
        windowEnd: window.end,
      });
    } else {
      qb.andWhere('event.attendance_date = :attendanceDate', {
        attendanceDate,
      });
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
      .andWhere('punch.is_processed = false')
      .andWhere('punch.validation_status IN (:...statuses)', {
        statuses: [
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ],
      });

    const window = this.buildEventWindow(schedule);
    if (window) {
      qb.andWhere('punch.punch_time >= :windowStart', {
        windowStart: window.start,
      });
      qb.andWhere('punch.punch_time <= :windowEnd', {
        windowEnd: window.end,
      });
    } else {
      qb.andWhere('punch.attendance_date = :attendanceDate', {
        attendanceDate,
      });
    }

    return qb.orderBy('punch.punch_time', 'ASC').getMany();
  }

  private buildEventWindow(
    schedule: ResolvedAttendanceSchedule,
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
      // Timetable day breaks are only a fallback when no shift-level break
      // definition exists for the resolved schedule.
      if (day?.breakRequired) {
        return Math.max(0, day.breakMinutes ?? 0);
      }
    }

    return 0;
  }

  private preparePunches(
    events: AttendanceEventPoint[],
    schedule: ResolvedAttendanceSchedule,
  ): PreparedPunchAnalysis {
    const effectivePunches: AttendanceEventPoint[] = [];
    const duplicatePunches: AttendanceEventPoint[] = [];
    const invalidPunches: AttendanceEventPoint[] = [];

    const sortedEvents = [...events].sort(
      (left, right) => left.eventTime.getTime() - right.eventTime.getTime(),
    );

    for (const event of sortedEvents) {
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
        hasSameTimeCheckInOut: false,
        usedDirectionAwarePairing: false,
        missingPunchCount: schedule.requiresCheckout ? 2 : 1,
      };
    }

    const hasAttendanceDirection = effectivePunches.some(
      (event) =>
        event.direction === AttendanceProcessedEventDirectionEnum.IN ||
        event.direction === AttendanceProcessedEventDirectionEnum.OUT,
    );

    if (!hasAttendanceDirection) {
      return this.preparePunchesByFallbackOrder(
        effectivePunches,
        duplicatePunches,
        invalidPunches,
        schedule,
      );
    }

    const inPunches = effectivePunches.filter(
      (event) => event.direction === AttendanceProcessedEventDirectionEnum.IN,
    );

    const outPunches = effectivePunches.filter(
      (event) => event.direction === AttendanceProcessedEventDirectionEnum.OUT,
    );

    const checkInAt: Date | null = inPunches[0]?.eventTime ?? null;
    let checkOutAt: Date | null = null;
    let hasSameTimeCheckInOut = false;

    if (checkInAt) {
      const validOutAfterCheckIn = outPunches.filter(
        (event) => event.eventTime.getTime() > checkInAt.getTime(),
      );

      checkOutAt =
        validOutAfterCheckIn.length > 0
          ? validOutAfterCheckIn[validOutAfterCheckIn.length - 1].eventTime
          : null;

      const invalidOutBeforeCheckIn = outPunches.filter(
        (event) => event.eventTime.getTime() <= checkInAt.getTime(),
      );

      invalidPunches.push(...invalidOutBeforeCheckIn);
    } else if (outPunches.length > 0) {
      checkOutAt = outPunches[outPunches.length - 1].eventTime;
    }

    if (
      checkInAt &&
      checkOutAt &&
      checkInAt.getTime() === checkOutAt.getTime()
    ) {
      hasSameTimeCheckInOut = true;
      invalidPunches.push(...effectivePunches);
      checkOutAt = null;
    }

    const breakMinutes = this.calculateBreakMinutesFromDirectedPunches(
      effectivePunches,
      checkInAt,
      checkOutAt,
    );

    const missingPunchCount = Number(!checkInAt) + Number(!checkOutAt);

    return {
      effectivePunches,
      duplicatePunches,
      invalidPunches,
      checkInAt,
      checkOutAt,
      breakMinutes,
      hasSameTimeCheckInOut,
      usedDirectionAwarePairing: true,
      missingPunchCount,
    };
  }

  private preparePunchesByFallbackOrder(
    effectivePunches: AttendanceEventPoint[],
    duplicatePunches: AttendanceEventPoint[],
    invalidPunches: AttendanceEventPoint[],
    schedule: ResolvedAttendanceSchedule,
  ): PreparedPunchAnalysis {
    let checkInAt: Date | null = null;
    let checkOutAt: Date | null = null;
    let hasSameTimeCheckInOut = false;

    if (effectivePunches.length === 1) {
      const onlyPunch = effectivePunches[0];

      if (
        this.shouldTreatSinglePunchAsCheckout(schedule, onlyPunch.eventTime)
      ) {
        checkOutAt = onlyPunch.eventTime;
      } else {
        checkInAt = onlyPunch.eventTime;
      }
    } else {
      checkInAt = effectivePunches[0].eventTime;
      checkOutAt = effectivePunches[effectivePunches.length - 1].eventTime;

      if (checkOutAt.getTime() === checkInAt.getTime()) {
        hasSameTimeCheckInOut = true;
        invalidPunches.push(...effectivePunches);
        checkOutAt = null;
      } else if (checkOutAt.getTime() < checkInAt.getTime()) {
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

    const missingPunchCount = Number(!checkInAt) + Number(!checkOutAt);

    return {
      effectivePunches,
      duplicatePunches,
      invalidPunches,
      checkInAt,
      checkOutAt,
      breakMinutes,
      hasSameTimeCheckInOut,
      usedDirectionAwarePairing: false,
      missingPunchCount,
    };
  }

  private calculateBreakMinutesFromDirectedPunches(
    punches: AttendanceEventPoint[],
    checkInAt: Date | null,
    checkOutAt: Date | null,
  ): number {
    if (!checkInAt || !checkOutAt) {
      return 0;
    }

    const internalPunches = punches.filter(
      (event) =>
        event.eventTime.getTime() > checkInAt.getTime() &&
        event.eventTime.getTime() < checkOutAt.getTime(),
    );

    let breakMinutes = 0;
    let breakStart: AttendanceEventPoint | null = null;

    for (const punch of internalPunches) {
      const startsBreak =
        punch.direction === AttendanceProcessedEventDirectionEnum.BREAK_OUT ||
        punch.direction === AttendanceProcessedEventDirectionEnum.OUT;
      const endsBreak =
        punch.direction === AttendanceProcessedEventDirectionEnum.BREAK_IN ||
        punch.direction === AttendanceProcessedEventDirectionEnum.IN;

      if (startsBreak) {
        breakStart = punch;
        continue;
      }

      if (
        breakStart &&
        endsBreak &&
        punch.eventTime.getTime() > breakStart.eventTime.getTime()
      ) {
        breakMinutes += Math.floor(
          (punch.eventTime.getTime() - breakStart.eventTime.getTime()) / 60000,
        );
        breakStart = null;
      }
    }

    return Math.max(0, breakMinutes);
  }

  private mapMobilePunchDirection(
    punchType: AttendancePunchTypeEnum,
  ): AttendanceProcessedEventDirectionEnum {
    if (punchType === AttendancePunchTypeEnum.CHECK_IN) {
      return AttendanceProcessedEventDirectionEnum.IN;
    }

    if (punchType === AttendancePunchTypeEnum.CHECK_OUT) {
      return AttendanceProcessedEventDirectionEnum.OUT;
    }

    return AttendanceProcessedEventDirectionEnum.UNKNOWN;
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
      invalidPunchCount,
      duplicatePunchCount,
      hasSameTimeCheckInOut,
      hasMultiplePunches,
      usedDirectionAwarePairing,
      missingPunchCount,
    } = input;

    const hasApprovedLeave = leaveStatus !== null;

    let attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
    const remarks: AttendanceDailyRemarkEnum[] = [];
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
    } else if (
      schedule.isHoliday &&
      !(
        schedule.holidayPolicyMode ===
          AttendanceHolidayPolicyModeEnum.OPTIONAL && eventCount > 0
      )
    ) {
      attendanceStatus = AttendanceDailyStatusEnum.HOLIDAY;

      // ── Priority 4: Off day ──────────────────────────────────────────────────
    } else if (schedule.isOffDay) {
      attendanceStatus = AttendanceDailyStatusEnum.OFF_DAY;

      // ── Priority 5: No usable schedule when schedule was expected ────────────
    } else if (noScheduleFound) {
      attendanceStatus = AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE;

      // ── Priority 6: Check-out exists but no check-in (orphan punch) ──────────
    } else if (!checkInAt && checkOutAt) {
      attendanceStatus = AttendanceDailyStatusEnum.PRESENT;
      remarks.push(AttendanceDailyRemarkEnum.MISSING_CHECK_IN);
      remarks.push(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED);

      // ── Priority 7: No punches at all on a working day ───────────────────────
    } else if (
      eventCount === 0 &&
      hasScheduleExpectation &&
      schedule.autoAbsentIfNoCheckin
    ) {
      attendanceStatus = AttendanceDailyStatusEnum.ABSENT;
      remarks.push(
        AttendanceDailyRemarkEnum.MISSING_BOTH_CHECK_IN_AND_CHECK_OUT,
      );

      // ── Priority 8+: At least one valid check-in punch ───────────────────────
    } else if (checkInAt) {
      if (!checkOutAt && schedule.requiresCheckout) {
        // Only flag MISSING_CHECK_OUT after the shift end time has passed.
        // Before the shift ends the employee may still be working — keep PRESENT.
        const shiftHasEnded =
          !schedule.scheduleEndAt || new Date() > schedule.scheduleEndAt;
        if (shiftHasEnded) {
          remarks.push(AttendanceDailyRemarkEnum.MISSING_CHECK_OUT);
          remarks.push(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED);
        }
      }
      attendanceStatus = AttendanceDailyStatusEnum.PRESENT;
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
      const baseline =
        schedule.scheduleStartAt.getTime() + schedule.graceInMinutes * 60000;
      const lateThreshold = baseline + schedule.lateAfterMinutes * 60000;
      const halfDayThreshold = baseline + schedule.halfDayAfterMinutes * 60000;
      const absentThreshold = baseline + schedule.absentAfterMinutes * 60000;

      if (
        schedule.lateAfterMinutes > 0 &&
        checkInAt.getTime() > lateThreshold
      ) {
        lateMinutes = Math.floor((checkInAt.getTime() - lateThreshold) / 60000);
      }

      // Absent-by-lateness overrides PRESENT
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

        // LATE overrides PRESENT only
      } else if (
        lateMinutes > 0 &&
        attendanceStatus === AttendanceDailyStatusEnum.PRESENT
      ) {
        attendanceStatus = AttendanceDailyStatusEnum.LATE;
      }
    }

    // ── Early departure (only when both check-in and check-out are present) ──
    if (checkInAt && checkOutAt && schedule.scheduleEndAt) {
      const allowedEarlyLeaveTime =
        schedule.scheduleEndAt.getTime() -
        (schedule.graceOutMinutes + schedule.earlyLeaveAfterMinutes) * 60000;
      if (checkOutAt.getTime() < allowedEarlyLeaveTime) {
        earlyDepartureMinutes = Math.floor(
          (allowedEarlyLeaveTime - checkOutAt.getTime()) / 60000,
        );
      }
    }

    // EARLY_DEPARTURE combined with LATE produces LATE_AND_EARLY_DEPARTURE
    if (earlyDepartureMinutes > 0) {
      if (attendanceStatus === AttendanceDailyStatusEnum.LATE) {
        attendanceStatus = AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE;
      } else if (attendanceStatus === AttendanceDailyStatusEnum.PRESENT) {
        attendanceStatus = AttendanceDailyStatusEnum.EARLY_DEPARTURE;
      }
    }

    // ── Overtime ─────────────────────────────────────────────────────────────
    if (checkInAt && checkOutAt && schedule.scheduleEndAt) {
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

    workMinutes = this.applyRounding(workMinutes, schedule.roundingMode);
    overtimeMinutes = this.applyRounding(
      overtimeMinutes,
      schedule.roundingMode,
    );

    if (overtimeMinutes > 0 && schedule.overtimeRequiresApproval) {
      if (!remarks.includes(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED)) {
        remarks.push(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED);
      }
    }

    if (
      schedule.isOffDay &&
      eventCount > 0 &&
      attendanceStatus === AttendanceDailyStatusEnum.OFF_DAY
    ) {
      attendanceStatus = AttendanceDailyStatusEnum.OFF_DAY_PRESENT;
    }

    // OVERTIME overrides PRESENT only (other statuses have higher priority)
    if (
      overtimeMinutes > 0 &&
      attendanceStatus === AttendanceDailyStatusEnum.PRESENT
    ) {
      attendanceStatus = AttendanceDailyStatusEnum.OVERTIME;
    }

    // ── Punch quality remarks ────────────────────────────────────────────────
    if (hasSameTimeCheckInOut) {
      remarks.push(AttendanceDailyRemarkEnum.CHECK_IN_OUT_SAME_TIME);
      if (!remarks.includes(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED)) {
        remarks.push(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED);
      }
    }

    if (invalidPunchCount > 0 && !hasSameTimeCheckInOut) {
      remarks.push(AttendanceDailyRemarkEnum.INVALID_PUNCH_SEQUENCE);
      if (!remarks.includes(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED)) {
        remarks.push(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED);
      }
    }

    if (hasMultiplePunches) {
      remarks.push(AttendanceDailyRemarkEnum.MULTIPLE_PUNCHES);
    }

    if (
      missingPunchCount > schedule.maxMissingPunchAllowed &&
      attendanceStatus !== AttendanceDailyStatusEnum.ABSENT &&
      attendanceStatus !== AttendanceDailyStatusEnum.HOLIDAY &&
      attendanceStatus !== AttendanceDailyStatusEnum.OFF_DAY &&
      attendanceStatus !== AttendanceDailyStatusEnum.OFF_DAY_PRESENT &&
      !hasApprovedLeave &&
      !hasApprovedBusinessTrip
    ) {
      if (missingPunchCount >= 2) {
        if (
          !remarks.includes(
            AttendanceDailyRemarkEnum.MISSING_BOTH_CHECK_IN_AND_CHECK_OUT,
          )
        ) {
          remarks.push(
            AttendanceDailyRemarkEnum.MISSING_BOTH_CHECK_IN_AND_CHECK_OUT,
          );
        }
      } else if (!checkInAt) {
        if (!remarks.includes(AttendanceDailyRemarkEnum.MISSING_CHECK_IN)) {
          remarks.push(AttendanceDailyRemarkEnum.MISSING_CHECK_IN);
        }
      } else if (schedule.requiresCheckout && !checkOutAt) {
        if (!remarks.includes(AttendanceDailyRemarkEnum.MISSING_CHECK_OUT)) {
          remarks.push(AttendanceDailyRemarkEnum.MISSING_CHECK_OUT);
        }
      }

      if (!remarks.includes(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED)) {
        remarks.push(AttendanceDailyRemarkEnum.MANUAL_REVIEW_REQUIRED);
      }
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
      remarks,
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
        duplicatePunchCount,
        invalidPunchCount,
        missingPunchCount,
        usedDirectionAwarePairing,
        hasScheduleExpectation,
        noScheduleFound,
        requiresCheckout: schedule.requiresCheckout,
        missingCheckout: remarks.includes(
          AttendanceDailyRemarkEnum.MISSING_CHECK_OUT,
        ),
        scheduleSource: schedule.source,
        lateAfterMinutes: schedule.lateAfterMinutes,
        halfDayAfterMinutes: schedule.halfDayAfterMinutes,
        absentAfterMinutes: schedule.absentAfterMinutes,
        autoAbsentIfNoCheckin: schedule.autoAbsentIfNoCheckin,
        allowEarlyCheckin: schedule.allowEarlyCheckin,
        allowLateCheckout: schedule.allowLateCheckout,
        roundingMode: schedule.roundingMode,
        maxMissingPunchAllowed: schedule.maxMissingPunchAllowed,
        holidayPolicyMode: schedule.holidayPolicyMode,
        overtimeRequiresApproval: schedule.overtimeRequiresApproval,
      },
    };
  }

  private applyRounding(
    minutes: number,
    roundingMode: AttendanceRoundingModeEnum,
  ): number {
    if (minutes <= 0) return 0;

    const interval = 5;
    const remainder = minutes % interval;

    if (remainder === 0) return minutes;

    switch (roundingMode) {
      case AttendanceRoundingModeEnum.UP:
        return minutes + (interval - remainder);

      case AttendanceRoundingModeEnum.DOWN:
        return minutes - remainder;

      case AttendanceRoundingModeEnum.NEAREST:
      default:
        return remainder >= interval / 2
          ? minutes + (interval - remainder)
          : minutes - remainder;
    }
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
      leaveStatus: context.leaveStatus,
      hasApprovedBusinessTrip: context.hasApprovedBusinessTrip,
      eventCount: context.eventCount,
      hasScheduleExpectation: context.hasScheduleExpectation,
      noScheduleFound: context.noScheduleFound,
      invalidPunchCount: context.invalidPunchCount,
      duplicatePunchCount: context.duplicatePunchCount,
      hasSameTimeCheckInOut: context.hasSameTimeCheckInOut,
      hasMultiplePunches: context.hasMultiplePunches,
      usedDirectionAwarePairing: context.usedDirectionAwarePairing,
      missingPunchCount:
        Number(!adjustedPunches.checkInAt) +
        Number(!adjustedPunches.checkOutAt),
    });

    // When the admin supplied an explicit status, use it; otherwise mark as
    // MANUAL_CORRECTION so the record is distinguishable from a naturally-computed one.
    const resolvedStatus =
      (adjustment.statusOverride as AttendanceDailyStatusEnum | null) ??
      AttendanceDailyStatusEnum.MANUAL_CORRECTION;

    const adjustmentRemarks: AttendanceDailyRemarkEnum[] = [
      ...recalculated.remarks,
      AttendanceDailyRemarkEnum.MANUALLY_CORRECTED,
    ];

    return {
      shouldPersist: true,
      attendanceStatus: resolvedStatus,
      remarks: adjustmentRemarks,
      lateMinutes: adjustment.lateMinutesOverride ?? recalculated.lateMinutes,
      earlyDepartureMinutes:
        adjustment.earlyDepartureMinutesOverride ??
        recalculated.earlyDepartureMinutes,
      breakMinutes:
        adjustment.breakMinutesOverride ?? recalculated.breakMinutes,
      workMinutes: adjustment.workMinutesOverride ?? recalculated.workMinutes,
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
        message:
          'Employee had attendance activity or a schedule expectation but no usable schedule could be resolved.',
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
        message:
          'Duplicate punches were detected within the same attendance window.',
        metadata: {
          punch_ids: input.punchAnalysis.duplicatePunches.map(
            (item) => item.id,
          ),
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
        message:
          'One or more punches could not be used safely in attendance calculation.',
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
        message:
          'Attendance day has a usable check-out punch but no usable check-in punch.',
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
        message:
          'Attendance day has a usable check-in punch but no usable check-out punch.',
      });
    }

    return drafts;
  }

  private async hasScheduleExpectation(
    companyId: number,
    employeeId: number,
    attendanceDate: string,
  ): Promise<boolean> {
    const [
      shiftSchedule,
      shiftAssignment,
      timetableAssignment,
      defaultTimetable,
    ] = await Promise.all([
      this.shiftScheduleRepository
        .createQueryBuilder('schedule')
        .select(['schedule.id', 'schedule.isOffDay'])
        .where('schedule.company_id = :companyId', { companyId })
        .andWhere('schedule.employee_id = :employeeId', { employeeId })
        .andWhere('schedule.effective_from <= :attendanceDate', {
          attendanceDate,
        })
        .andWhere(
          '(schedule.effective_to IS NULL OR schedule.effective_to >= :attendanceDate)',
          {
            attendanceDate,
          },
        )
        .orderBy('schedule.effectiveFrom', 'DESC')
        .addOrderBy('schedule.scheduleDate', 'DESC')
        .getOne(),
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
        .andWhere(
          '(assignment.effective_to IS NULL OR assignment.effective_to >= :attendanceDate)',
          {
            attendanceDate,
          },
        )
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
        .andWhere(
          '(assignment.effective_to IS NULL OR assignment.effective_to >= :attendanceDate)',
          {
            attendanceDate,
          },
        )
        .getOne(),
      this.timetableRepository.findOne({
        where: {
          companyId,
          isDefault: true,
          status: TimetableStatusEnum.ACTIVE,
        },
        select: { id: true },
      }),
    ]);

    if (shiftSchedule) {
      return !shiftSchedule.isOffDay;
    }

    return !!shiftAssignment || !!timetableAssignment || !!defaultTimetable;
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
      .andWhere('leaveRequest.status = :status', {
        status: LeaveStatusEnum.APPROVED,
      })
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
      return AttendanceDailyStatusEnum.SICK_LEAVE;
    }
    if (
      upper.includes('ANNUAL') ||
      upper.includes('CASUAL') ||
      upper.includes('EARNED')
    ) {
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

  private async refreshAttendanceAffectedLeaveBalances(
    companyId: number,
    employeeId: number,
    fiscalYear: string,
    reason: string,
  ): Promise<void> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      select: {
        id: true,
        primary_branch_id: true,
        primary_department_id: true,
        primary_position_id: true,
      },
    });

    if (!employee) {
      return;
    }

    await this.leaveBalanceService.synchronizeAttendanceImpactForEmployeeYear(
      companyId,
      employee,
      fiscalYear,
      this.transactionManager,
      reason,
    );
  }

  private normalizeDate(value: string, field: string): string {
    try {
      return normalizeDateInput(value, field);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private parseOptionalDate(
    value: string | null | undefined,
    field: string,
  ): Date | null {
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
