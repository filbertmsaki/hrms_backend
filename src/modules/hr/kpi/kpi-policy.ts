import { BadRequestException } from '@nestjs/common';
import type { KpiDirection, KpiMeasurement } from './kpi.entities';

export function validateMeasurement(
  type: KpiMeasurement,
  unit: string | null | undefined,
  direction: KpiDirection,
): void {
  const nonNumeric = ['binary', 'milestone', 'qualitative'].includes(type);
  if (nonNumeric && direction !== 'not_applicable')
    throw new BadRequestException(
      'Non-numeric KPIs require not_applicable direction',
    );
  if (!nonNumeric && direction === 'not_applicable')
    throw new BadRequestException(
      'Numeric KPIs require a performance direction',
    );
  if (type === 'percentage' && unit && unit !== '%')
    throw new BadRequestException('Percentage unit must be %');
  if (type === 'currency' && !unit)
    throw new BadRequestException('Currency requires an ISO currency unit');
  if (type === 'currency' && !/^[A-Z]{3}$/.test(unit ?? ''))
    throw new BadRequestException('Currency unit must be a three-letter code');
  if (
    type === 'duration' &&
    !['seconds', 'minutes', 'hours', 'days'].includes(unit ?? '')
  )
    throw new BadRequestException(
      'Duration requires seconds, minutes, hours, or days',
    );
  if (type === 'binary' && unit)
    throw new BadRequestException('Binary KPI cannot have a measurement unit');
}

export function validateTarget(
  type: KpiMeasurement,
  direction: KpiDirection,
  value: Record<string, unknown>,
): void {
  const keys = Object.keys(value);
  if (['numeric', 'percentage', 'currency', 'duration'].includes(type)) {
    if (direction === 'range') {
      if (
        keys.length !== 2 ||
        typeof value.min !== 'number' ||
        typeof value.max !== 'number' ||
        !Number.isFinite(value.min) ||
        !Number.isFinite(value.max) ||
        value.min > value.max
      )
        throw new BadRequestException(
          'Range target requires finite min and max',
        );
    } else if (
      keys.length !== 1 ||
      typeof value.value !== 'number' ||
      !Number.isFinite(value.value)
    )
      throw new BadRequestException('Numeric target requires one finite value');
    const numbers =
      direction === 'range'
        ? [value.min as number, value.max as number]
        : [value.value as number];
    if (type === 'percentage' && numbers.some((n) => n < 0 || n > 100))
      throw new BadRequestException(
        'Percentage target must be between 0 and 100',
      );
    if (['duration', 'currency'].includes(type) && numbers.some((n) => n < 0))
      throw new BadRequestException('Target cannot be negative');
    return;
  }
  if (
    type === 'binary' &&
    keys.length === 1 &&
    typeof value.value === 'boolean'
  )
    return;
  if (
    ['milestone', 'qualitative'].includes(type) &&
    keys.length === 1 &&
    typeof value.description === 'string' &&
    value.description.trim()
  )
    return;
  throw new BadRequestException('Target does not match measurement type');
}

export function validatePeriod(startDate: string, endDate: string): void {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    !Number.isFinite(start.valueOf()) ||
    !Number.isFinite(end.valueOf()) ||
    start > end ||
    start.toISOString().slice(0, 10) !== startDate ||
    end.toISOString().slice(0, 10) !== endDate
  )
    throw new BadRequestException('Invalid reporting period boundaries');
}
