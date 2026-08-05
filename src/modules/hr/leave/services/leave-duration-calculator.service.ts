import { createHash } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceHoliday } from '../../attendance/holidays/entities/holiday.entity';
import { AttendanceScheduleResolverService } from '../../attendance/processing/attendance-schedule-resolver.service';
import { Employee } from '../../employees/entities/employee.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveDayTreatmentEnum } from '../enums/leave-day-treatment.enum';
import { LeaveDurationTypeEnum } from '../enums/leave-duration-type.enum';

export interface LeaveDurationCalculation {
  totalDays: number;
  requestedMinutes: number | null;
  snapshot: {
    duration_type: LeaveDurationTypeEnum;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    included_dates: string[];
    excluded_dates: Array<{
      date: string;
      reason: string;
    }>;
    working_day_minutes: number;
    policy_id: number | null;
    calculated_at: string;
  };
  hash: string;
}

@Injectable()
export class LeaveDurationCalculatorService {
  constructor(
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
    private readonly scheduleResolver: AttendanceScheduleResolverService,
    private readonly configService: ConfigService,
  ) {}

  private dateRange(startDate: string, endDate: string): string[] {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const dates: string[] = [];
    for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
      dates.push(new Date(time).toISOString().slice(0, 10));
    }

    return dates;
  }

  private timeToMinutes(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private createHash(value: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isRecurringHolidayMatch(
    holiday: AttendanceHoliday,
    date: string,
  ): boolean {
    if (!holiday.isRecurring) {
      return holiday.date === date;
    }

    const [, holidayMonth, holidayDay] = holiday.date.split('-');
    const [, month, day] = date.split('-');
    return holidayMonth === month && holidayDay === day;
  }

  private isWeekend(date: string): boolean {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return day === 0 || day === 6;
  }

  private shouldExcludeWeeklyOff(
    treatment: LeaveDayTreatmentEnum,
    scheduleOffDay: boolean,
    date: string,
  ): boolean {
    switch (treatment) {
      case LeaveDayTreatmentEnum.INCLUDE:
        return false;
      case LeaveDayTreatmentEnum.EXCLUDE:
        return scheduleOffDay || this.isWeekend(date);
      case LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE:
      default:
        return scheduleOffDay;
    }
  }

  private shouldExcludeHoliday(
    treatment: LeaveDayTreatmentEnum,
    scheduleOffDay: boolean,
    isHoliday: boolean,
  ): boolean {
    if (!isHoliday) {
      return false;
    }

    switch (treatment) {
      case LeaveDayTreatmentEnum.INCLUDE:
        return false;
      case LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE:
        return scheduleOffDay;
      case LeaveDayTreatmentEnum.EXCLUDE:
      default:
        return true;
    }
  }

  async calculate(input: {
    companyId: number;
    employee: Employee;
    policy: LeavePolicy | null;
    durationType: LeaveDurationTypeEnum;
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
  }): Promise<LeaveDurationCalculation> {
    const defaultWorkingMinutes =
      this.configService.get<number>('LEAVE_DEFAULT_WORKING_DAY_MINUTES') ??
      480;

    if (input.durationType === LeaveDurationTypeEnum.HALF_DAY) {
      if (input.startDate !== input.endDate) {
        throw new BadRequestException(
          'Half-day leave must start and end on the same date.',
        );
      }

      if (!input.policy?.allow_half_day) {
        throw new BadRequestException(
          'Half-day leave is not allowed by the applicable leave policy.',
        );
      }

      const snapshot = {
        duration_type: input.durationType,
        start_date: input.startDate,
        end_date: input.endDate,
        start_time: null,
        end_time: null,
        included_dates: [input.startDate],
        excluded_dates: [],
        working_day_minutes: defaultWorkingMinutes,
        policy_id: input.policy?.id ?? null,
        calculated_at: new Date().toISOString(),
      };

      return {
        totalDays: 0.5,
        requestedMinutes: Math.round(defaultWorkingMinutes / 2),
        snapshot,
        hash: this.createHash(snapshot),
      };
    }

    if (input.durationType === LeaveDurationTypeEnum.SHORT_LEAVE) {
      if (input.startDate !== input.endDate) {
        throw new BadRequestException(
          'Short leave must start and end on the same date.',
        );
      }

      if (!input.policy?.allow_short_leave) {
        throw new BadRequestException(
          'Short leave is not allowed by the applicable leave policy.',
        );
      }

      if (!input.startTime || !input.endTime) {
        throw new BadRequestException(
          'start_time and end_time are required for short leave.',
        );
      }

      const startMinutes = this.timeToMinutes(input.startTime);
      const endMinutes = this.timeToMinutes(input.endTime);
      const requestedMinutes = endMinutes - startMinutes;

      if (requestedMinutes <= 0) {
        throw new BadRequestException(
          'Short leave end_time must be later than start_time.',
        );
      }

      if (
        input.policy.minimum_short_leave_minutes !== null &&
        input.policy.minimum_short_leave_minutes !== undefined &&
        requestedMinutes < input.policy.minimum_short_leave_minutes
      ) {
        throw new BadRequestException(
          `Short leave must be at least ${input.policy.minimum_short_leave_minutes} minute(s).`,
        );
      }

      if (
        input.policy.maximum_short_leave_minutes !== null &&
        input.policy.maximum_short_leave_minutes !== undefined &&
        requestedMinutes > input.policy.maximum_short_leave_minutes
      ) {
        throw new BadRequestException(
          `Short leave cannot exceed ${input.policy.maximum_short_leave_minutes} minute(s).`,
        );
      }

      const snapshot = {
        duration_type: input.durationType,
        start_date: input.startDate,
        end_date: input.endDate,
        start_time: input.startTime,
        end_time: input.endTime,
        included_dates: [input.startDate],
        excluded_dates: [],
        working_day_minutes: defaultWorkingMinutes,
        policy_id: input.policy?.id ?? null,
        calculated_at: new Date().toISOString(),
      };

      return {
        totalDays: Number(
          (requestedMinutes / defaultWorkingMinutes).toFixed(2),
        ),
        requestedMinutes,
        snapshot,
        hash: this.createHash(snapshot),
      };
    }

    const dates = this.dateRange(input.startDate, input.endDate);
    const holidays = await this.holidayRepository.find({
      where: {
        companyId: input.companyId,
      },
    });

    const includedDates: string[] = [];
    const excludedDates: Array<{ date: string; reason: string }> = [];

    for (const date of dates) {
      const schedule = await this.scheduleResolver.resolveForDate(
        input.companyId,
        input.employee.id,
        date,
      );
      const isHoliday =
        schedule.isHoliday ||
        holidays.some((holiday) => this.isRecurringHolidayMatch(holiday, date));

      if (
        this.shouldExcludeHoliday(
          input.policy?.holiday_treatment ?? LeaveDayTreatmentEnum.EXCLUDE,
          schedule.isOffDay,
          isHoliday,
        )
      ) {
        excludedDates.push({ date, reason: 'holiday' });
        continue;
      }

      if (
        this.shouldExcludeWeeklyOff(
          input.policy?.weekly_off_treatment ??
            LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE,
          schedule.isOffDay,
          date,
        )
      ) {
        excludedDates.push({ date, reason: 'weekly_off' });
        continue;
      }

      includedDates.push(date);
    }

    const snapshot = {
      duration_type: input.durationType,
      start_date: input.startDate,
      end_date: input.endDate,
      start_time: null,
      end_time: null,
      included_dates: includedDates,
      excluded_dates: excludedDates,
      working_day_minutes: defaultWorkingMinutes,
      policy_id: input.policy?.id ?? null,
      calculated_at: new Date().toISOString(),
    };

    return {
      totalDays: includedDates.length,
      requestedMinutes: null,
      snapshot,
      hash: this.createHash(snapshot),
    };
  }
}
