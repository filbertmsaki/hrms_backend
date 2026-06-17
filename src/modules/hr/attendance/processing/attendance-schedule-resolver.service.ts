import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceHoliday } from '../holidays/entities/holiday.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../../access-control/attendance-devices/enums/attendance-device-status.enum';
import { ShiftAssignmentStatusEnum } from '../shift/shift-assignments/enums/shift-assignment-status.enum';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAttendanceRule } from '../shift/shift-attendance-rules/entities/shift-attendance-rule.entity';
import { ShiftOvertimeRule } from '../shift/shift-overtime-rules/entities/shift-overtime-rule.entity';
import { ShiftRotationGroup } from '../shift/shift-rotation-groups/entities/shift-rotation-group.entity';
import { ShiftRotationRule } from '../shift/shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceSetting } from '../settings/entities/attendance-setting.entity';
import { EmployeeTimetableStatusEnum } from '../timetable/employee-timetables/enums/employee-timetable-status.enum';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { TimetableAttendanceRule } from '../timetable/timetable-attendance-rules/entities/timetable-attendance-rule.entity';
import { TimetableDay } from '../timetable/timetable-days/entities/timetable-day.entity';
import { TimetableGeneratedSchedule } from '../timetable/timetable-generated-schedules/entities/timetable-generated-schedule.entity';
import { TimetableShiftRule } from '../timetable/timetable-shift-rules/entities/timetable-shift-rule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { addDaysToDateOnly } from '../../shared/hr.utils';
import { ResolvedAttendanceSchedule } from './entities/resolved-attendance-schedule.type';
import { TimetableScheduleGenerationService } from './timetable-schedule-generation.service';

type GlobalAttendanceConfiguration = {
  absentAfterMinutes: number;
  allowEarlyCheckin: boolean;
  allowLateCheckout: boolean;
  allowOvertime: boolean;
  autoAbsentIfNoCheckin: boolean;
  autoMarkWeekendAsOff: boolean;
  graceInMinutes: number;
  halfDayAfterMinutes: number;
  ignoreMissingCheckoutIfHoursValid: boolean;
  lateAfterMinutes: number;
  maxOvertimeMinutes: number;
  overtimeStartAfterMinutes: number;
  weekendDayIndexes: Set<number>;
};

@Injectable()
export class AttendanceScheduleResolverService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,
    @InjectRepository(AttendanceSetting)
    private readonly attendanceSettingRepository: Repository<AttendanceSetting>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(TimetableGeneratedSchedule)
    private readonly timetableGeneratedScheduleRepository: Repository<TimetableGeneratedSchedule>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(ShiftRotationGroup)
    private readonly shiftRotationGroupRepository: Repository<ShiftRotationGroup>,
    @InjectRepository(ShiftRotationRule)
    private readonly shiftRotationRuleRepository: Repository<ShiftRotationRule>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(TimetableDay)
    private readonly timetableDayRepository: Repository<TimetableDay>,
    @InjectRepository(TimetableShiftRule)
    private readonly timetableShiftRuleRepository: Repository<TimetableShiftRule>,
    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(ShiftAttendanceRule)
    private readonly shiftAttendanceRuleRepository: Repository<ShiftAttendanceRule>,
    @InjectRepository(ShiftOvertimeRule)
    private readonly shiftOvertimeRuleRepository: Repository<ShiftOvertimeRule>,
    @InjectRepository(TimetableAttendanceRule)
    private readonly timetableAttendanceRuleRepository: Repository<TimetableAttendanceRule>,
    private readonly timetableScheduleGenerationService: TimetableScheduleGenerationService,
  ) {}

  async resolveForDate(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    preferredTimezone?: string,
  ): Promise<ResolvedAttendanceSchedule> {
    const employee = await this.findEmployee(companyId, employeeId);
    const branchId = employee?.primary_branch_id ?? null;
    const globalConfig = await this.resolveGlobalConfiguration(companyId);

    const fallbackTimezone =
      preferredTimezone ||
      (await this.resolveDefaultDeviceTimezone(companyId)) ||
      'UTC';

    const fromShiftSchedule = await this.resolveFromShiftSchedule(
      companyId,
      employeeId,
      scheduleDate,
      fallbackTimezone,
      branchId,
      globalConfig,
    );
    if (fromShiftSchedule) return fromShiftSchedule;

    const fromShiftAssignment = await this.resolveFromShiftAssignment(
      companyId,
      employeeId,
      scheduleDate,
      fallbackTimezone,
      branchId,
      globalConfig,
    );
    if (fromShiftAssignment) return fromShiftAssignment;

    const fromGenerated = await this.resolveFromTimetableGeneratedSchedule(
      companyId,
      employeeId,
      scheduleDate,
      fallbackTimezone,
      branchId,
      globalConfig,
    );
    if (fromGenerated) return fromGenerated;

    await this.timetableScheduleGenerationService.ensureGeneratedSchedule(
      companyId,
      employeeId,
      scheduleDate,
    );

    const generatedOnDemand = await this.resolveFromTimetableGeneratedSchedule(
      companyId,
      employeeId,
      scheduleDate,
      fallbackTimezone,
      branchId,
      globalConfig,
    );
    if (generatedOnDemand) return generatedOnDemand;

    const fromEmployeeTimetable =
      await this.resolveFromEmployeeTimetableDefinition(
        companyId,
        employeeId,
        scheduleDate,
        fallbackTimezone,
        branchId,
        globalConfig,
      );
    if (fromEmployeeTimetable) return fromEmployeeTimetable;

    const holiday = await this.resolveHoliday(
      companyId,
      branchId,
      scheduleDate,
    );
    const isWeekendOff =
      globalConfig.autoMarkWeekendAsOff &&
      globalConfig.weekendDayIndexes.has(this.getDayOfWeek(scheduleDate));

    return {
      employeeId,
      scheduleDate,
      source: 'NONE',
      timezone: fallbackTimezone,
      shiftId: null,
      timetableId: null,
      branchId,
      isOffDay: isWeekendOff,
      isHoliday: !!holiday,
      holidayId: holiday?.id ?? null,
      scheduleStartAt: null,
      scheduleEndAt: null,
      lateAfterMinutes: globalConfig.lateAfterMinutes,
      halfDayAfterMinutes: globalConfig.halfDayAfterMinutes,
      absentAfterMinutes: globalConfig.absentAfterMinutes,
      graceInMinutes: globalConfig.graceInMinutes,
      graceOutMinutes: 0,
      earlyLeaveAfterMinutes: 0,
      allowEarlyCheckin: globalConfig.allowEarlyCheckin,
      allowLateCheckout: globalConfig.allowLateCheckout,
      autoAbsentIfNoCheckin: globalConfig.autoAbsentIfNoCheckin,
      allowOvertime: globalConfig.allowOvertime,
      overtimeStartAfterMinutes: globalConfig.overtimeStartAfterMinutes,
      maxOvertimeMinutes: globalConfig.maxOvertimeMinutes,
      requiresCheckout: true,
      ignoreMissingCheckoutIfHoursValid:
        globalConfig.ignoreMissingCheckoutIfHoursValid,
    };
  }

  private async resolveFromShiftSchedule(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    fallbackTimezone: string,
    branchId: number | null,
    globalConfig: GlobalAttendanceConfiguration,
  ): Promise<ResolvedAttendanceSchedule | null> {
    const schedule = await this.shiftScheduleRepository.findOne({
      where: { companyId, employeeId, scheduleDate },
    });
    if (!schedule) return null;

    const holidayId =
      schedule.holidayId ??
      (await this.resolveHoliday(companyId, branchId, scheduleDate))?.id ??
      null;

    if (schedule.isOffDay) {
      return this.buildResolvedWithoutShift({
        employeeId,
        scheduleDate,
        source: 'SHIFT_SCHEDULE',
        timezone: fallbackTimezone,
        shiftId: null,
        timetableId: null,
        branchId,
        isOffDay: true,
        holidayId,
        globalConfig,
      });
    }

    const shiftId = schedule.overrideShiftId ?? schedule.shiftId;
    const base = await this.resolveWithShift(
      companyId,
      employeeId,
      scheduleDate,
      shiftId,
      fallbackTimezone,
      'SHIFT_SCHEDULE',
      branchId,
      globalConfig,
    );

    base.holidayId = holidayId;
    base.isHoliday = !!holidayId;
    return base;
  }

  private async resolveFromTimetableGeneratedSchedule(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    fallbackTimezone: string,
    branchId: number | null,
    globalConfig: GlobalAttendanceConfiguration,
  ): Promise<ResolvedAttendanceSchedule | null> {
    const generated = await this.timetableGeneratedScheduleRepository.findOne({
      where: { companyId, employeeId, scheduleDate },
    });
    if (!generated) return null;

    const timetable = await this.timetableRepository.findOne({
      where: { id: generated.timetableId, companyId },
    });
    const timezone = timetable?.timezone || fallbackTimezone;
    const holidayId =
      generated.holidayId ??
      (await this.resolveHoliday(companyId, branchId, scheduleDate))?.id ??
      null;

    if (!generated.shiftId) {
      const definition = !generated.isOffDay
        ? await this.timetableScheduleGenerationService.buildScheduleDefinition(
            companyId,
            employeeId,
            scheduleDate,
          )
        : null;
      const attendanceRule =
        await this.timetableAttendanceRuleRepository.findOne({
          where: { timetableId: generated.timetableId },
        });
      return this.buildResolvedWithoutShift({
        employeeId,
        scheduleDate,
        source: 'TIMETABLE_GENERATED',
        timezone,
        shiftId: null,
        timetableId: generated.timetableId,
        branchId,
        isOffDay: generated.isOffDay,
        holidayId,
        globalConfig,
        scheduleStartAt:
          definition?.expectedCheckInTime && definition.expectedCheckOutTime
            ? this.buildDateWithTime(
                scheduleDate,
                definition.expectedCheckInTime,
                timezone,
              )
            : null,
        scheduleEndAt:
          definition?.expectedCheckInTime && definition.expectedCheckOutTime
            ? this.buildDateWithTime(
                scheduleDate,
                definition.expectedCheckOutTime,
                timezone,
                definition.expectedCheckOutTime <=
                  definition.expectedCheckInTime,
              )
            : null,
        lateAfterMinutes:
          attendanceRule?.lateAfterMinutes ?? globalConfig.lateAfterMinutes,
        halfDayAfterMinutes:
          attendanceRule?.halfDayAfterMinutes ??
          globalConfig.halfDayAfterMinutes,
        absentAfterMinutes:
          attendanceRule?.absentAfterMinutes ?? globalConfig.absentAfterMinutes,
        allowEarlyCheckin:
          attendanceRule?.allowEarlyCheckin ?? globalConfig.allowEarlyCheckin,
        allowLateCheckout:
          attendanceRule?.allowLateCheckout ?? globalConfig.allowLateCheckout,
        autoAbsentIfNoCheckin:
          attendanceRule?.autoAbsentIfNoCheckin ??
          globalConfig.autoAbsentIfNoCheckin,
        allowOvertime:
          definition?.overtimeAllowed ?? globalConfig.allowOvertime,
        overtimeStartAfterMinutes: globalConfig.overtimeStartAfterMinutes,
        maxOvertimeMinutes:
          attendanceRule?.maxOvertimeMinutes ?? globalConfig.maxOvertimeMinutes,
      });
    }

    const base = await this.resolveWithShift(
      companyId,
      employeeId,
      scheduleDate,
      generated.shiftId,
      timezone,
      'TIMETABLE_GENERATED',
      branchId,
      globalConfig,
    );

    base.timetableId = generated.timetableId;
    base.isOffDay = generated.isOffDay;
    base.holidayId = holidayId;
    base.isHoliday = !!holidayId;
    return base;
  }

  private async resolveFromShiftAssignment(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    fallbackTimezone: string,
    branchId: number | null,
    globalConfig: GlobalAttendanceConfiguration,
  ): Promise<ResolvedAttendanceSchedule | null> {
    const assignment = await this.shiftAssignmentRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.employee_id = :employeeId', { employeeId })
      .andWhere('assignment.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      })
      .andWhere('assignment.effective_from <= :scheduleDate', { scheduleDate })
      .andWhere(
        '(assignment.effective_to IS NULL OR assignment.effective_to >= :scheduleDate)',
        {
          scheduleDate,
        },
      )
      .orderBy('assignment.is_primary', 'DESC')
      .addOrderBy('assignment.effective_from', 'DESC')
      .getOne();

    if (!assignment) return null;

    let resolvedShiftId = assignment.shiftId;
    let isOffDay = false;
    if (assignment.rotationGroupId) {
      const rotationGroup = await this.shiftRotationGroupRepository.findOne({
        where: { id: assignment.rotationGroupId, companyId },
      });
      if (rotationGroup && rotationGroup.cycleDays > 0) {
        const dayIndex = this.computeCycleDayIndex(
          assignment.effectiveFrom,
          scheduleDate,
          rotationGroup.cycleDays,
        );
        const rotationRule = await this.shiftRotationRuleRepository.findOne({
          where: { rotationGroupId: rotationGroup.id, dayIndex },
        });
        if (rotationRule) {
          isOffDay = rotationRule.isOffDay;
          if (rotationRule.shiftId) {
            resolvedShiftId = rotationRule.shiftId;
          } else if (rotationRule.isOffDay) {
            resolvedShiftId = 0;
          }
        }
      }
    }

    const holiday = await this.resolveHoliday(
      companyId,
      branchId,
      scheduleDate,
    );

    if (isOffDay || !resolvedShiftId) {
      return this.buildResolvedWithoutShift({
        employeeId,
        scheduleDate,
        source: 'SHIFT_ASSIGNMENT',
        timezone: fallbackTimezone,
        shiftId: null,
        timetableId: null,
        branchId,
        isOffDay,
        holidayId: holiday?.id ?? null,
        globalConfig,
      });
    }

    const base = await this.resolveWithShift(
      companyId,
      employeeId,
      scheduleDate,
      resolvedShiftId,
      fallbackTimezone,
      'SHIFT_ASSIGNMENT',
      branchId,
      globalConfig,
    );

    base.isHoliday = !!holiday;
    base.holidayId = holiday?.id ?? null;
    return base;
  }

  private async resolveFromEmployeeTimetableDefinition(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    fallbackTimezone: string,
    branchId: number | null,
    globalConfig: GlobalAttendanceConfiguration,
  ): Promise<ResolvedAttendanceSchedule | null> {
    const definition =
      await this.timetableScheduleGenerationService.buildScheduleDefinition(
        companyId,
        employeeId,
        scheduleDate,
      );
    if (!definition) {
      return null;
    }

    const timezone = definition.timezone || fallbackTimezone;
    const attendanceRule =
      await this.timetableScheduleGenerationService.findTimetableAttendanceRule(
        definition.timetableId,
      );

    if (!definition.shiftId) {
      const scheduleStartAt =
        !definition.isOffDay &&
        definition.expectedCheckInTime &&
        definition.expectedCheckOutTime
          ? this.buildDateWithTime(
              scheduleDate,
              definition.expectedCheckInTime,
              timezone,
            )
          : null;
      const scheduleEndAt =
        !definition.isOffDay &&
        definition.expectedCheckInTime &&
        definition.expectedCheckOutTime
          ? this.buildDateWithTime(
              scheduleDate,
              definition.expectedCheckOutTime,
              timezone,
              definition.expectedCheckOutTime <= definition.expectedCheckInTime,
            )
          : null;

      return this.buildResolvedWithoutShift({
        employeeId,
        scheduleDate,
        source: 'EMPLOYEE_TIMETABLE',
        timezone,
        shiftId: null,
        timetableId: definition.timetableId,
        branchId: definition.branchId,
        isOffDay: definition.isOffDay,
        holidayId: definition.holidayId,
        globalConfig,
        scheduleStartAt,
        scheduleEndAt,
        lateAfterMinutes:
          attendanceRule?.lateAfterMinutes ?? globalConfig.lateAfterMinutes,
        halfDayAfterMinutes:
          attendanceRule?.halfDayAfterMinutes ??
          globalConfig.halfDayAfterMinutes,
        absentAfterMinutes:
          attendanceRule?.absentAfterMinutes ?? globalConfig.absentAfterMinutes,
        allowEarlyCheckin:
          attendanceRule?.allowEarlyCheckin ?? globalConfig.allowEarlyCheckin,
        allowLateCheckout:
          attendanceRule?.allowLateCheckout ?? globalConfig.allowLateCheckout,
        autoAbsentIfNoCheckin:
          attendanceRule?.autoAbsentIfNoCheckin ??
          globalConfig.autoAbsentIfNoCheckin,
        allowOvertime: definition.overtimeAllowed ?? globalConfig.allowOvertime,
        overtimeStartAfterMinutes: globalConfig.overtimeStartAfterMinutes,
        maxOvertimeMinutes:
          attendanceRule?.maxOvertimeMinutes ?? globalConfig.maxOvertimeMinutes,
      });
    }

    const base = await this.resolveWithShift(
      companyId,
      employeeId,
      scheduleDate,
      definition.shiftId,
      timezone,
      'EMPLOYEE_TIMETABLE',
      definition.branchId,
      globalConfig,
    );

    base.timetableId = definition.timetableId;
    base.isHoliday = !!definition.holidayId;
    base.holidayId = definition.holidayId;
    base.isOffDay = definition.isOffDay;
    return base;
  }

  private async resolveWithShift(
    companyId: number,
    employeeId: number,
    scheduleDate: string,
    shiftId: number,
    timezone: string,
    source: string,
    branchId: number | null,
    globalConfig: GlobalAttendanceConfiguration,
  ): Promise<ResolvedAttendanceSchedule> {
    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, companyId },
    });
    const holiday = await this.resolveHoliday(
      companyId,
      branchId,
      scheduleDate,
    );

    if (!shift) {
      return {
        employeeId,
        scheduleDate,
        source,
        timezone,
        shiftId,
        timetableId: null,
        branchId,
        isOffDay: false,
        isHoliday: !!holiday,
        holidayId: holiday?.id ?? null,
        scheduleStartAt: null,
        scheduleEndAt: null,
        lateAfterMinutes: globalConfig.lateAfterMinutes,
        halfDayAfterMinutes: globalConfig.halfDayAfterMinutes,
        absentAfterMinutes: globalConfig.absentAfterMinutes,
        graceInMinutes: globalConfig.graceInMinutes,
        graceOutMinutes: 0,
        earlyLeaveAfterMinutes: 0,
        allowEarlyCheckin: globalConfig.allowEarlyCheckin,
        allowLateCheckout: globalConfig.allowLateCheckout,
        autoAbsentIfNoCheckin: globalConfig.autoAbsentIfNoCheckin,
        allowOvertime: globalConfig.allowOvertime,
        overtimeStartAfterMinutes: globalConfig.overtimeStartAfterMinutes,
        maxOvertimeMinutes: globalConfig.maxOvertimeMinutes,
        requiresCheckout: true,
        ignoreMissingCheckoutIfHoursValid:
          globalConfig.ignoreMissingCheckoutIfHoursValid,
      };
    }

    const attendanceRule = await this.shiftAttendanceRuleRepository.findOne({
      where: { shiftId: shift.id },
    });
    const overtimeRule = await this.shiftOvertimeRuleRepository.findOne({
      where: { shiftId: shift.id },
    });

    const scheduleStartAt = this.buildDateWithTime(
      scheduleDate,
      shift.startTime,
      timezone,
    );
    const scheduleEndAt = this.buildDateWithTime(
      scheduleDate,
      shift.endTime,
      timezone,
      shift.crossesMidnight || shift.endTime <= shift.startTime,
    );

    return {
      employeeId,
      scheduleDate,
      source,
      timezone,
      shiftId: shift.id,
      timetableId: null,
      branchId: shift.branchId ?? branchId,
      isOffDay: false,
      isHoliday: !!holiday,
      holidayId: holiday?.id ?? null,
      scheduleStartAt,
      scheduleEndAt,
      lateAfterMinutes:
        attendanceRule?.lateAfterMinutes ??
        shift.lateAfterMinutes ??
        globalConfig.lateAfterMinutes,
      halfDayAfterMinutes:
        attendanceRule?.halfDayAfterMinutes ?? globalConfig.halfDayAfterMinutes,
      absentAfterMinutes:
        attendanceRule?.absentAfterMinutes ?? globalConfig.absentAfterMinutes,
      graceInMinutes: shift.graceInMinutes ?? globalConfig.graceInMinutes,
      graceOutMinutes: shift.graceOutMinutes ?? 0,
      earlyLeaveAfterMinutes: shift.earlyLeaveAfterMinutes ?? 0,
      allowEarlyCheckin:
        shift.allowEarlyCheckin ?? globalConfig.allowEarlyCheckin,
      allowLateCheckout:
        shift.allowLateCheckout ?? globalConfig.allowLateCheckout,
      autoAbsentIfNoCheckin:
        attendanceRule?.autoMarkAbsent ?? globalConfig.autoAbsentIfNoCheckin,
      allowOvertime: shift.allowOvertime,
      overtimeStartAfterMinutes:
        overtimeRule?.overtimeStartAfterMinutes ??
        globalConfig.overtimeStartAfterMinutes,
      maxOvertimeMinutes:
        overtimeRule?.maxDailyOvertimeMinutes ??
        shift.maxOvertimeMinutes ??
        globalConfig.maxOvertimeMinutes,
      requiresCheckout: shift.requiresCheckout,
      ignoreMissingCheckoutIfHoursValid:
        globalConfig.ignoreMissingCheckoutIfHoursValid,
    };
  }

  private buildResolvedWithoutShift(input: {
    employeeId: number;
    scheduleDate: string;
    source: string;
    timezone: string;
    shiftId: number | null;
    timetableId: number | null;
    branchId: number | null;
    isOffDay: boolean;
    holidayId: number | null;
    globalConfig: GlobalAttendanceConfiguration;
    scheduleStartAt?: Date | null;
    scheduleEndAt?: Date | null;
    lateAfterMinutes?: number;
    halfDayAfterMinutes?: number;
    absentAfterMinutes?: number;
    allowEarlyCheckin?: boolean;
    allowLateCheckout?: boolean;
    autoAbsentIfNoCheckin?: boolean;
    allowOvertime?: boolean;
    overtimeStartAfterMinutes?: number;
    maxOvertimeMinutes?: number;
    requiresCheckout?: boolean;
  }): ResolvedAttendanceSchedule {
    return {
      employeeId: input.employeeId,
      scheduleDate: input.scheduleDate,
      source: input.source,
      timezone: input.timezone,
      shiftId: input.shiftId,
      timetableId: input.timetableId,
      branchId: input.branchId,
      isOffDay: input.isOffDay,
      isHoliday: !!input.holidayId,
      holidayId: input.holidayId,
      scheduleStartAt: input.scheduleStartAt ?? null,
      scheduleEndAt: input.scheduleEndAt ?? null,
      lateAfterMinutes:
        input.lateAfterMinutes ?? input.globalConfig.lateAfterMinutes,
      halfDayAfterMinutes:
        input.halfDayAfterMinutes ?? input.globalConfig.halfDayAfterMinutes,
      absentAfterMinutes:
        input.absentAfterMinutes ?? input.globalConfig.absentAfterMinutes,
      graceInMinutes: input.globalConfig.graceInMinutes,
      graceOutMinutes: 0,
      earlyLeaveAfterMinutes: 0,
      allowEarlyCheckin:
        input.allowEarlyCheckin ?? input.globalConfig.allowEarlyCheckin,
      allowLateCheckout:
        input.allowLateCheckout ?? input.globalConfig.allowLateCheckout,
      autoAbsentIfNoCheckin:
        input.autoAbsentIfNoCheckin ?? input.globalConfig.autoAbsentIfNoCheckin,
      allowOvertime: input.allowOvertime ?? input.globalConfig.allowOvertime,
      overtimeStartAfterMinutes:
        input.overtimeStartAfterMinutes ??
        input.globalConfig.overtimeStartAfterMinutes,
      maxOvertimeMinutes:
        input.maxOvertimeMinutes ?? input.globalConfig.maxOvertimeMinutes,
      requiresCheckout: input.requiresCheckout ?? true,
      ignoreMissingCheckoutIfHoursValid:
        input.globalConfig.ignoreMissingCheckoutIfHoursValid,
    };
  }

  private async resolveGlobalConfiguration(
    companyId: number,
  ): Promise<GlobalAttendanceConfiguration> {
    const [policy, setting] = await Promise.all([
      this.attendancePolicyRepository.findOne({
        where: { company_id: companyId, is_active: true },
      }),
      this.attendanceSettingRepository.findOne({
        where: { companyId },
        order: { updatedAt: 'DESC' },
      }),
    ]);

    return {
      absentAfterMinutes: policy?.absent_after_minutes ?? 0,
      allowEarlyCheckin: policy?.allow_early_checkin ?? true,
      allowLateCheckout: policy?.allow_late_checkout ?? true,
      allowOvertime:
        (setting?.maxOvertimeMinutesPerDay ?? 0) > 0 ||
        (setting?.overtimeStartAfterMinutes ?? 0) > 0,
      autoAbsentIfNoCheckin: policy?.auto_absent_if_no_checkin ?? true,
      autoMarkWeekendAsOff: policy?.auto_mark_weekend_as_off ?? false,
      graceInMinutes: policy?.grace_period_minutes ?? 0,
      halfDayAfterMinutes: policy?.half_day_after_minutes ?? 0,
      ignoreMissingCheckoutIfHoursValid:
        policy?.ignore_missing_checkout_if_hours_valid ?? false,
      lateAfterMinutes: policy?.late_after_minutes ?? 0,
      maxOvertimeMinutes: setting?.maxOvertimeMinutesPerDay ?? 0,
      overtimeStartAfterMinutes: setting?.overtimeStartAfterMinutes ?? 0,
      weekendDayIndexes: this.parseWeekendDays(policy?.weekend_days),
    };
  }

  private async resolveHoliday(
    companyId: number,
    branchId: number | null,
    scheduleDate: string,
  ): Promise<AttendanceHoliday | null> {
    const [, month, day] = scheduleDate.split('-');
    const monthDay = `${month}-${day}`;
    const qb = this.holidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.company_id = :companyId', { companyId })
      .andWhere(
        "(holiday.date = :scheduleDate OR (holiday.is_recurring = :isRecurring AND DATE_FORMAT(holiday.date, '%m-%d') = :monthDay))",
        {
          scheduleDate,
          isRecurring: true,
          monthDay,
        },
      );

    if (branchId === null) {
      qb.andWhere('holiday.branch_id IS NULL');
    } else {
      qb.andWhere(
        '(holiday.branch_id = :branchId OR holiday.branch_id IS NULL)',
        { branchId },
      );
    }

    return qb
      .orderBy('CASE WHEN holiday.branch_id IS NULL THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy(
        'CASE WHEN holiday.date = :scheduleDate THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('holiday.branch_id', 'DESC')
      .setParameter('scheduleDate', scheduleDate)
      .getOne();
  }

  private async resolveDefaultDeviceTimezone(
    companyId: number,
  ): Promise<string | null> {
    const device = await this.deviceRepository.findOne({
      where: { companyId, status: AttendanceDeviceStatusEnum.ACTIVE },
      order: { updatedAt: 'DESC' },
    });

    return device?.timezone || null;
  }

  private async findEmployee(
    companyId: number,
    employeeId: number,
  ): Promise<Employee | null> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();
  }

  private computeCycleDayIndex(
    startDate: string,
    targetDate: string,
    cycleDays: number,
  ): number {
    const start = new Date(`${startDate}T00:00:00Z`);
    const target = new Date(`${targetDate}T00:00:00Z`);
    const diff = Math.max(
      0,
      Math.floor((target.getTime() - start.getTime()) / 86400000),
    );
    return (diff % cycleDays) + 1;
  }

  private buildDateWithTime(
    date: string,
    time: string,
    timezone: string,
    nextDay = false,
  ): Date {
    const datePart = nextDay ? this.addDays(date, 1) : date;
    const offset = this.resolveOffsetForDate(timezone, datePart);
    return new Date(`${datePart}T${time}${offset}`);
  }

  private addDays(date: string, days: number): string {
    return addDaysToDateOnly(date, days);
  }

  private getDayOfWeek(date: string): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
  }

  private parseWeekendDays(value?: string | null): Set<number> {
    const dayMap: Record<string, number> = {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    };

    return new Set(
      String(value ?? '')
        .split(',')
        .map((item) => dayMap[item.trim().toUpperCase()])
        .filter((item): item is number => Number.isInteger(item)),
    );
  }

  private resolveOffsetForDate(timezone: string, date: string): string {
    try {
      const probe = new Date(`${date}T12:00:00Z`);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'shortOffset',
        hour: '2-digit',
      }).formatToParts(probe);
      const zonePart =
        parts.find((part) => part.type === 'timeZoneName')?.value ||
        'GMT+00:00';
      const normalized = zonePart.replace('GMT', '').trim() || '+00:00';
      const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
      if (!match) return '+00:00';
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      const minutes = (match[3] || '00').padStart(2, '0');
      return `${sign}${hours}:${minutes}`;
    } catch {
      return '+00:00';
    }
  }
}
