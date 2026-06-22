import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttendanceScheduleResolverService } from '../processing/attendance-schedule-resolver.service';
import { ResolvedAttendanceSchedule } from '../processing/entities/resolved-attendance-schedule.type';
import { Shift } from '../shift/shifts/entities/shift.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { AttendanceSchedulePreviewQueryDto } from './dtos/attendance-schedule-preview-query.dto';
import { addDaysToDateOnly } from '../../shared/hr.utils';

type ScheduleSourcePriority = {
  priority: number;
  source: string;
  meaning: string;
};

@Injectable()
export class AttendanceSchedulePreviewService {
  constructor(
    private readonly scheduleResolver: AttendanceScheduleResolverService,

    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,

    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,
  ) {}

  async preview(companyId: number, query: AttendanceSchedulePreviewQueryDto) {
    const fromDate = query.from_date;
    const toDate = query.to_date;
    const maxDays = query.max_days ?? 62;

    this.validateDateRange(fromDate, toDate, maxDays);

    const dates = this.buildDateRange(fromDate, toDate);

    const resolvedSchedules = await Promise.all(
      dates.map((date) =>
        this.scheduleResolver.resolveForDate(
          companyId,
          query.employee_id,
          date,
          query.timezone,
        ),
      ),
    );

    const shiftMap = await this.loadShiftMap(companyId, resolvedSchedules);
    const timetableMap = await this.loadTimetableMap(
      companyId,
      resolvedSchedules,
    );

    return {
      employee_id: query.employee_id,
      period: {
        from_date: fromDate,
        to_date: toDate,
        total_days: dates.length,
      },
      timezone:
        query.timezone ??
        resolvedSchedules.find((item) => item.timezone)?.timezone ??
        'Africa/Dar_es_Salaam',
      source_priority:
        query.include_source_priority === false
          ? undefined
          : this.getSourcePriority(),
      summary: this.buildSummary(resolvedSchedules),
      data: resolvedSchedules.map((resolved) =>
        this.mapResolvedSchedule({
          resolved,
          shift: resolved.shiftId
            ? shiftMap.get(resolved.shiftId) ?? null
            : null,
          timetable: resolved.timetableId
            ? timetableMap.get(resolved.timetableId) ?? null
            : null,
          includePolicy: query.include_policy ?? false,
        }),
      ),
    };
  }

  private validateDateRange(
    fromDate: string,
    toDate: string,
    maxDays: number,
  ) {
    if (toDate < fromDate) {
      throw new BadRequestException(
        'to_date cannot be earlier than from_date.',
      );
    }

    const totalDays = this.diffDays(fromDate, toDate) + 1;

    if (totalDays > maxDays) {
      throw new BadRequestException(
        `Schedule preview range is too large. Maximum allowed days is ${maxDays}.`,
      );
    }
  }

  private buildDateRange(fromDate: string, toDate: string): string[] {
    const dates: string[] = [];
    let current = fromDate;

    while (current <= toDate) {
      dates.push(current);
      current = addDaysToDateOnly(current, 1);
    }

    return dates;
  }

  private diffDays(fromDate: string, toDate: string): number {
    const from = new Date(`${fromDate}T00:00:00Z`).getTime();
    const to = new Date(`${toDate}T00:00:00Z`).getTime();

    return Math.floor((to - from) / 86400000);
  }

  private async loadShiftMap(
    companyId: number,
    schedules: ResolvedAttendanceSchedule[],
  ): Promise<Map<number, Shift>> {
    const ids = Array.from(
      new Set(
        schedules
          .map((item) => item.shiftId)
          .filter((value): value is number => Boolean(value)),
      ),
    );

    if (!ids.length) {
      return new Map();
    }

    const shifts = await this.shiftRepository.find({
      where: {
        id: In(ids),
        companyId,
      },
    });

    return new Map(shifts.map((shift) => [shift.id, shift]));
  }

  private async loadTimetableMap(
    companyId: number,
    schedules: ResolvedAttendanceSchedule[],
  ): Promise<Map<number, Timetable>> {
    const ids = Array.from(
      new Set(
        schedules
          .map((item) => item.timetableId)
          .filter((value): value is number => Boolean(value)),
      ),
    );

    if (!ids.length) {
      return new Map();
    }

    const timetables = await this.timetableRepository.find({
      where: {
        id: In(ids),
        companyId,
      },
    });

    return new Map(
      timetables.map((timetable) => [timetable.id, timetable]),
    );
  }

  private mapResolvedSchedule(params: {
    resolved: ResolvedAttendanceSchedule;
    shift: Shift | null;
    timetable: Timetable | null;
    includePolicy: boolean;
  }) {
    const { resolved, shift, timetable, includePolicy } = params;

    return {
      date: resolved.scheduleDate,
      day: this.getDayName(resolved.scheduleDate),
      source: resolved.source,
      source_label: this.getSourceLabel(resolved.source),
      branch_id: resolved.branchId,
      timezone: resolved.timezone,
      is_working_day:
        !resolved.isOffDay &&
        Boolean(resolved.scheduleStartAt && resolved.scheduleEndAt),
      is_off_day: resolved.isOffDay,
      is_holiday: resolved.isHoliday,
      holiday_id: resolved.holidayId,
      start_at: resolved.scheduleStartAt?.toISOString() ?? null,
      end_at: resolved.scheduleEndAt?.toISOString() ?? null,
      start_time: this.extractTime(
        resolved.scheduleStartAt,
        resolved.timezone,
      ),
      end_time: this.extractTime(resolved.scheduleEndAt, resolved.timezone),
      shift: shift
        ? this.mapShift(shift)
        : resolved.shiftId
          ? {
              id: resolved.shiftId,
              name: null,
              code: null,
              message:
                'Shift ID was resolved but shift details could not be loaded.',
            }
          : null,
      timetable: timetable
        ? {
            id: timetable.id,
            name: timetable.name,
            code: timetable.code,
            type: timetable.timetableType,
            is_default: timetable.isDefault,
            timezone: timetable.timezone,
          }
        : resolved.timetableId
          ? {
              id: resolved.timetableId,
              name: null,
              code: null,
              message:
                'Timetable ID was resolved but timetable details could not be loaded.',
            }
          : null,
      checkout_required: resolved.requiresCheckout,
      overtime_allowed: resolved.allowOvertime,
      policy: includePolicy
        ? {
            late_after_minutes: resolved.lateAfterMinutes,
            half_day_after_minutes: resolved.halfDayAfterMinutes,
            absent_after_minutes: resolved.absentAfterMinutes,
            grace_in_minutes: resolved.graceInMinutes,
            grace_out_minutes: resolved.graceOutMinutes,
            early_leave_after_minutes: resolved.earlyLeaveAfterMinutes,
            allow_early_checkin: resolved.allowEarlyCheckin,
            allow_late_checkout: resolved.allowLateCheckout,
            auto_absent_if_no_checkin: resolved.autoAbsentIfNoCheckin,
            overtime_start_after_minutes:
              resolved.overtimeStartAfterMinutes,
            max_overtime_minutes: resolved.maxOvertimeMinutes,
            ignore_missing_checkout_if_hours_valid:
              resolved.ignoreMissingCheckoutIfHoursValid,
          }
        : undefined,
    };
  }

  private mapShift(shift: Shift) {
    return {
      id: shift.id,
      name: shift.name,
      code: shift.code,
      type: shift.shiftType,
      status: shift.status,
      start_time: shift.startTime,
      end_time: shift.endTime,
      expected_work_minutes: shift.expectedWorkMinutes,
      minimum_work_minutes: shift.minimumWorkMinutes,
      half_day_minutes: shift.halfDayMinutes,
      crosses_midnight: shift.crossesMidnight,
      requires_checkout: shift.requiresCheckout,
      allow_overtime: shift.allowOvertime,
      allow_mobile_attendance: shift.allowMobileAttendance,
      require_geofence: shift.requireGeofence,
      require_biometric: shift.requireBiometric,
    };
  }

  private buildSummary(schedules: ResolvedAttendanceSchedule[]) {
    const bySource = schedules.reduce<Record<string, number>>((acc, item) => {
      acc[item.source] = (acc[item.source] ?? 0) + 1;
      return acc;
    }, {});

    return {
      working_days: schedules.filter(
        (item) =>
          !item.isOffDay && Boolean(item.scheduleStartAt && item.scheduleEndAt),
      ).length,
      off_days: schedules.filter((item) => item.isOffDay).length,
      holidays: schedules.filter((item) => item.isHoliday).length,
      missing_schedule_days: schedules.filter(
        (item) =>
          item.source === 'NONE' ||
          (!item.isOffDay && !item.scheduleStartAt && !item.scheduleEndAt),
      ).length,
      by_source: bySource,
    };
  }

  private getSourcePriority(): ScheduleSourcePriority[] {
    return [
      {
        priority: 1,
        source: 'SHIFT_SCHEDULE',
        meaning:
          'Specific manual schedule override. This is the highest priority.',
      },
      {
        priority: 2,
        source: 'SHIFT_ASSIGNMENT',
        meaning:
          'Direct employee shift assignment or rotation assignment. Overrides timetable.',
      },
      {
        priority: 3,
        source: 'EMPLOYEE_TIMETABLE',
        meaning: 'Employee assigned timetable. Normal employee work plan.',
      },
      {
        priority: 4,
        source: 'COMPANY_DEFAULT_TIMETABLE',
        meaning:
          'Company default timetable used when employee has no direct timetable.',
      },
      {
        priority: 5,
        source: 'NONE',
        meaning: 'No schedule was found. Policy fallback only.',
      },
    ];
  }

  private getSourceLabel(source: string) {
    const labels: Record<string, string> = {
      SHIFT_SCHEDULE: 'Manual shift schedule override',
      SHIFT_ASSIGNMENT: 'Direct shift assignment',
      EMPLOYEE_TIMETABLE: 'Employee timetable',
      COMPANY_DEFAULT_TIMETABLE: 'Company default timetable',
      NONE: 'No schedule',
    };

    return labels[source] ?? source;
  }

  private getDayName(date: string) {
    const dayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();

    const names: Record<number, string> = {
      0: 'Sunday',
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
    };

    return names[dayIndex] ?? `Day ${dayIndex}`;
  }

  private extractTime(date: Date | null, timezone: string) {
    if (!date) return null;

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
}
