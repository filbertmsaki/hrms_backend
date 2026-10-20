import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportTemplateDateRangeStrategyEnum } from '../enums/report-template-date-range-strategy.enum';

export type ReportDateRange = { dateFrom: string; dateTo: string };

function dateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return dateOnly(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
  );
}

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return dateOnly(
    Number(values.year),
    Number(values.month),
    Number(values.day),
  );
}

function periodBounds(
  date: string,
  period: 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR',
): ReportDateRange {
  const [year, month, day] = date.split('-').map(Number);
  if (period === 'WEEK') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const offsetFromMonday = (weekday + 6) % 7;
    const dateFrom = shiftDate(date, -offsetFromMonday);
    return { dateFrom, dateTo: shiftDate(dateFrom, 6) };
  }
  if (period === 'MONTH') {
    const dateFrom = dateOnly(year, month, 1);
    return {
      dateFrom,
      dateTo: dateOnly(
        year,
        month,
        new Date(Date.UTC(year, month, 0)).getUTCDate(),
      ),
    };
  }
  if (period === 'QUARTER') {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const lastMonth = firstMonth + 2;
    return {
      dateFrom: dateOnly(year, firstMonth, 1),
      dateTo: dateOnly(
        year,
        lastMonth,
        new Date(Date.UTC(year, lastMonth, 0)).getUTCDate(),
      ),
    };
  }
  return { dateFrom: dateOnly(year, 1, 1), dateTo: dateOnly(year, 12, 31) };
}

export function resolveReportDateRange(
  strategy: ReportTemplateDateRangeStrategyEnum | null | undefined,
  scheduleType: ReportScheduleTypeEnum,
  now: Date,
  timezone: string,
): ReportDateRange {
  const today = localDate(now, timezone);
  const selectedStrategy =
    strategy ??
    (scheduleType === ReportScheduleTypeEnum.WEEKLY
      ? ReportTemplateDateRangeStrategyEnum.PREVIOUS_WEEK
      : scheduleType === ReportScheduleTypeEnum.MONTHLY
        ? ReportTemplateDateRangeStrategyEnum.PREVIOUS_MONTH
        : scheduleType === ReportScheduleTypeEnum.QUARTERLY
          ? ReportTemplateDateRangeStrategyEnum.PREVIOUS_QUARTER
          : scheduleType === ReportScheduleTypeEnum.ANNUAL
            ? ReportTemplateDateRangeStrategyEnum.PREVIOUS_YEAR
            : ReportTemplateDateRangeStrategyEnum.CURRENT_DAY);

  switch (selectedStrategy) {
    case ReportTemplateDateRangeStrategyEnum.CURRENT_DAY:
    case ReportTemplateDateRangeStrategyEnum.SCHEDULE_RELATIVE:
      return { dateFrom: today, dateTo: today };
    case ReportTemplateDateRangeStrategyEnum.PREVIOUS_DAY: {
      const previous = shiftDate(today, -1);
      return { dateFrom: previous, dateTo: previous };
    }
    case ReportTemplateDateRangeStrategyEnum.CURRENT_WEEK:
      return periodBounds(today, 'WEEK');
    case ReportTemplateDateRangeStrategyEnum.PREVIOUS_WEEK:
      return periodBounds(shiftDate(today, -7), 'WEEK');
    case ReportTemplateDateRangeStrategyEnum.CURRENT_MONTH:
      return periodBounds(today, 'MONTH');
    case ReportTemplateDateRangeStrategyEnum.PREVIOUS_MONTH: {
      const [year, month] = today.split('-').map(Number);
      const daysInCurrentMonth = new Date(
        Date.UTC(year, month, 0),
      ).getUTCDate();
      return periodBounds(shiftDate(today, -daysInCurrentMonth), 'MONTH');
    }
    case ReportTemplateDateRangeStrategyEnum.CURRENT_QUARTER:
      return periodBounds(today, 'QUARTER');
    case ReportTemplateDateRangeStrategyEnum.PREVIOUS_QUARTER: {
      const current = periodBounds(today, 'QUARTER');
      return periodBounds(shiftDate(current.dateFrom, -1), 'QUARTER');
    }
    case ReportTemplateDateRangeStrategyEnum.CURRENT_YEAR:
      return periodBounds(today, 'YEAR');
    case ReportTemplateDateRangeStrategyEnum.PREVIOUS_YEAR: {
      const previousYear = Number(today.slice(0, 4)) - 1;
      return periodBounds(`${previousYear}-01-01`, 'YEAR');
    }
    case ReportTemplateDateRangeStrategyEnum.CUSTOM:
    default:
      return { dateFrom: today, dateTo: today };
  }
}
