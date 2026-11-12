import { BadRequestException } from '@nestjs/common';

function assertCalendarDate(value: string, field: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(
      `${field} must be a valid calendar date in YYYY-MM-DD format.`,
    );
  }
}

export function assertDateRange(
  from: string,
  to: string | undefined,
  label: string,
): void {
  assertCalendarDate(from, `${label} start date`);
  if (to !== undefined) {
    assertCalendarDate(to, `${label} end date`);
    if (to < from) {
      throw new BadRequestException(
        `${label} end date cannot precede its start date.`,
      );
    }
  }
}

export function assertUniqueValues(
  values: readonly (number | string)[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new BadRequestException(`${label} cannot contain duplicate items.`);
  }
}
