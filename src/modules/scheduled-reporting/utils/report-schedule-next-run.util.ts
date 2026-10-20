import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportWeekdayEnum } from '../enums/report-weekday.enum';

export type NextRunScheduleInput = {
  scheduleType: ReportScheduleTypeEnum;
  executionTime?: string | null;
  timezone?: string | null;
  dayOfMonth?: number | null;
  weekdays?: ReportWeekdayEnum[] | null;
};

const WEEKDAY_ORDER: ReportWeekdayEnum[] = [
  ReportWeekdayEnum.SUNDAY,
  ReportWeekdayEnum.MONDAY,
  ReportWeekdayEnum.TUESDAY,
  ReportWeekdayEnum.WEDNESDAY,
  ReportWeekdayEnum.THURSDAY,
  ReportWeekdayEnum.FRIDAY,
  ReportWeekdayEnum.SATURDAY,
];

const DEFAULT_TIMEZONE = 'Africa/Dar_es_Salaam';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (asUtc - date.getTime()) / 60000;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDaysToDateOnly(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
  );
}

function dateOnlyToWeekday(dateStr: string): ReportWeekdayEnum {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAY_ORDER[d.getUTCDay()];
}

function dateOnlyToDayOfMonth(dateStr: string): number {
  return Number(dateStr.split('-')[2]);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Converts a local calendar date + wall time in a given IANA timezone into
 * the corresponding UTC Date instant. Uses an Intl-based offset lookup
 * (see AttendanceScheduleResolverService for a similar pattern), sufficient
 * for the fixed/slow-moving offsets used by report scheduling timezones.
 */
function zonedDateTimeToUtc(
  dateStr: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const naiveUtcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, naiveUtcGuess);
  return new Date(naiveUtcGuess.getTime() - offsetMinutes * 60000);
}

function parseExecutionTime(executionTime?: string | null): {
  hour: number;
  minute: number;
  second: number;
} {
  const trimmed = executionTime?.trim();
  if (!trimmed) {
    return { hour: 0, minute: 0, second: 0 };
  }

  const [hourStr, minuteStr, secondStr] = trimmed.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr ?? '0');
  const second = Number(secondStr ?? '0');

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    second: Number.isFinite(second) ? second : 0,
  };
}

/**
 * Computes the next UTC instant a recurring report schedule should fire,
 * honoring the schedule's executionTime, IANA timezone, selected weekdays
 * (for WEEKLY) and dayOfMonth (for MONTHLY). Returns null for schedule
 * types without a computed recurrence (ONE_TIME, MANUAL) or when no valid
 * occurrence can be found.
 */
export function computeNextScheduleRunAt(
  schedule: NextRunScheduleInput,
  from: Date,
): Date | null {
  if (
    schedule.scheduleType === ReportScheduleTypeEnum.ONE_TIME ||
    schedule.scheduleType === ReportScheduleTypeEnum.MANUAL
  ) {
    return null;
  }

  const timezone = schedule.timezone?.trim() || DEFAULT_TIMEZONE;
  const { hour, minute, second } = parseExecutionTime(schedule.executionTime);
  const weekdays = schedule.weekdays ?? [];

  const fromParts = getZonedParts(from, timezone);
  const fromDateOnly = formatDateOnly(
    fromParts.year,
    fromParts.month,
    fromParts.day,
  );
  const fromSeconds =
    fromParts.hour * 3600 + fromParts.minute * 60 + fromParts.second;
  const targetSeconds = hour * 3600 + minute * 60 + second;

  let candidateDate =
    fromSeconds >= targetSeconds
      ? addDaysToDateOnly(fromDateOnly, 1)
      : fromDateOnly;

  const maxIterations = 400;

  for (let i = 0; i < maxIterations; i += 1) {
    if (
      isValidOccurrence(
        schedule.scheduleType,
        candidateDate,
        weekdays,
        schedule.dayOfMonth,
      )
    ) {
      return zonedDateTimeToUtc(candidateDate, hour, minute, second, timezone);
    }
    candidateDate = addDaysToDateOnly(candidateDate, 1);
  }

  return null;
}

function isValidOccurrence(
  scheduleType: ReportScheduleTypeEnum,
  dateStr: string,
  weekdays: ReportWeekdayEnum[],
  dayOfMonth?: number | null,
): boolean {
  if (scheduleType === ReportScheduleTypeEnum.DAILY) {
    if (!weekdays.length) {
      return true;
    }
    return weekdays.includes(dateOnlyToWeekday(dateStr));
  }

  if (scheduleType === ReportScheduleTypeEnum.WEEKLY) {
    if (!weekdays.length) {
      // No explicit selection: fall back to matching any day rather than
      // never firing.
      return true;
    }
    return weekdays.includes(dateOnlyToWeekday(dateStr));
  }

  if (scheduleType === ReportScheduleTypeEnum.MONTHLY) {
    const [year, month] = dateStr.split('-').map(Number);
    const requestedDay = dayOfMonth && dayOfMonth > 0 ? dayOfMonth : 1;
    const effectiveDay = Math.min(requestedDay, daysInMonth(year, month));
    return dateOnlyToDayOfMonth(dateStr) === effectiveDay;
  }

  if (scheduleType === ReportScheduleTypeEnum.QUARTERLY) {
    const [year, month] = dateStr.split('-').map(Number);
    const requestedDay = dayOfMonth && dayOfMonth > 0 ? dayOfMonth : 1;
    const effectiveDay = Math.min(requestedDay, daysInMonth(year, month));
    return (
      [1, 4, 7, 10].includes(month) &&
      dateOnlyToDayOfMonth(dateStr) === effectiveDay
    );
  }

  if (scheduleType === ReportScheduleTypeEnum.ANNUAL) {
    const [year, month] = dateStr.split('-').map(Number);
    const requestedDay = dayOfMonth && dayOfMonth > 0 ? dayOfMonth : 1;
    const effectiveDay = Math.min(requestedDay, daysInMonth(year, month));
    return month === 1 && dateOnlyToDayOfMonth(dateStr) === effectiveDay;
  }

  return false;
}
