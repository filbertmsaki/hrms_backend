import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

type PeriodShape = {
  periodType: PerformancePeriodTypeEnum;
  sequenceNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  status: PerformancePeriodStatusEnum;
  generationSnapshot: Record<string, unknown>;
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function firstDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function lastDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function monthName(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}

export class PerformancePeriodFactory {
  buildMonthlyPeriods(startDate: string, endDate: string): PeriodShape[] {
    const yearStart = parseDateOnly(startDate);
    const yearEnd = parseDateOnly(endDate);
    const periods: PeriodShape[] = [];

    let cursor = firstDayOfMonth(yearStart);
    let sequence = 1;

    while (cursor <= yearEnd) {
      const monthStart = cursor < yearStart ? yearStart : cursor;
      const monthEndCandidate = lastDayOfMonth(cursor);
      const monthEnd =
        monthEndCandidate > yearEnd ? yearEnd : monthEndCandidate;

      periods.push({
        periodType: PerformancePeriodTypeEnum.MONTHLY,
        sequenceNumber: sequence,
        name: `${monthName(cursor)} ${cursor.getUTCFullYear()}`,
        startDate: toDateOnly(monthStart),
        endDate: toDateOnly(monthEnd),
        status: PerformancePeriodStatusEnum.DRAFT,
        generationSnapshot: {
          generator: 'PerformancePeriodFactory',
          source: 'monthly',
        },
      });

      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
      sequence += 1;
    }

    return periods;
  }

  buildQuarterlyPeriods(monthlyPeriods: PeriodShape[]): PeriodShape[] {
    const periods: PeriodShape[] = [];

    for (let index = 0; index < monthlyPeriods.length; index += 3) {
      const quarterMonths = monthlyPeriods.slice(index, index + 3);
      if (!quarterMonths.length) {
        continue;
      }

      periods.push({
        periodType: PerformancePeriodTypeEnum.QUARTERLY,
        sequenceNumber: periods.length + 1,
        name: `Q${periods.length + 1} ${quarterMonths[0].startDate.slice(0, 4)}`,
        startDate: quarterMonths[0].startDate,
        endDate: quarterMonths[quarterMonths.length - 1].endDate,
        status: PerformancePeriodStatusEnum.DRAFT,
        generationSnapshot: {
          generator: 'PerformancePeriodFactory',
          source: 'quarterly',
          monthly_sequences: quarterMonths.map(
            (period) => period.sequenceNumber,
          ),
        },
      });
    }

    return periods;
  }
}
