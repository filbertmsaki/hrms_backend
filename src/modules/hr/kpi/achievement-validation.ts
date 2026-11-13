import { BadRequestException } from '@nestjs/common';
import type { KpiMeasurement } from './kpi.entities';

export function validateActual(
  type: KpiMeasurement,
  actual: unknown,
  rubric: string[] = [],
): void {
  if (actual === undefined || actual === null)
    throw new BadRequestException('Actual achievement is required');
  if (['numeric', 'percentage', 'currency', 'duration'].includes(type)) {
    if (typeof actual !== 'number' || !Number.isFinite(actual))
      throw new BadRequestException('A finite numeric actual is required');
    if (type === 'percentage' && (actual < 0 || actual > 100))
      throw new BadRequestException(
        'Percentage actual must be between 0 and 100',
      );
    if ((type === 'currency' || type === 'duration') && actual < 0)
      throw new BadRequestException(
        'Negative actual is invalid for this measurement',
      );
    return;
  }
  if (type === 'binary' && typeof actual === 'boolean') return;
  if (
    type === 'milestone' &&
    actual &&
    typeof actual === 'object' &&
    !Array.isArray(actual) &&
    Object.keys(actual).length === 1 &&
    typeof (actual as { completed?: unknown }).completed === 'boolean'
  )
    return;
  if (
    type === 'qualitative' &&
    typeof actual === 'string' &&
    rubric.includes(actual)
  )
    return;
  throw new BadRequestException(
    'Actual does not match the published KPI measurement or configured rubric',
  );
}
