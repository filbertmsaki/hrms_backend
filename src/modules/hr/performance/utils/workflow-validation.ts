import { BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';

export function assertCalendarDate(value: string, field: string): void {
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
    if (to < from)
      throw new BadRequestException(
        `${label} end date cannot precede its start date.`,
      );
  }
}

export function assertWeightTotal(
  weights: readonly number[],
  label: string,
): void {
  if (
    !weights.length ||
    weights.some(
      (weight) =>
        !Number.isFinite(weight) ||
        weight <= 0 ||
        weight > 100 ||
        new Decimal(weight).decimalPlaces() > 2,
    )
  ) {
    throw new BadRequestException(
      `${label} weights must be finite, greater than zero, at most 100, and have no more than two decimal places.`,
    );
  }
  const total = weights.reduce((sum, value) => sum.plus(value), new Decimal(0));
  if (!total.eq(100))
    throw new BadRequestException(
      `${label} weights must total exactly 100%. Current total: ${total.toString()}%.`,
    );
}

export function assertUniqueValues(
  values: readonly (number | string)[],
  label: string,
): void {
  if (new Set(values).size !== values.length)
    throw new BadRequestException(`${label} cannot contain duplicate items.`);
}

export function assertTransition(
  current: string,
  allowed: readonly string[],
  action: string,
): void {
  if (!allowed.includes(current))
    throw new ConflictException(
      `Cannot ${action} while this review is ${current}. Complete the preceding review step or explicitly reopen an eligible completed review.`,
    );
}
