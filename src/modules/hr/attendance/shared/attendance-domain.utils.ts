import { BadRequestException, ConflictException } from '@nestjs/common';
import { Employee } from '../../employees/entities/employee.entity';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

export const OPEN_ENDED_DATE_ONLY = '9999-12-31';

export function compareDateOnly(a: string, b: string): number {
  return a.localeCompare(b);
}

export function minDateOnly(
  ...values: Array<string | null | undefined>
): string | null {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((min, current) =>
    compareDateOnly(current, min) < 0 ? current : min,
  );
}

export function maxDateOnly(
  ...values: Array<string | null | undefined>
): string | null {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (!filtered.length) {
    return null;
  }

  return filtered.reduce((max, current) =>
    compareDateOnly(current, max) > 0 ? current : max,
  );
}

export function ensureDateRangeOrder(
  effectiveFrom: string,
  effectiveTo?: string | null,
  message = 'effective_to cannot be before effective_from',
): void {
  if (!effectiveTo) {
    return;
  }

  if (effectiveTo < effectiveFrom) {
    throw new BadRequestException(message);
  }
}

export function normalizeTrimmedText(value: string): string {
  return value.trim();
}

export function normalizeNullableText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = normalizeTrimmedText(value);
  return normalized.length ? normalized : null;
}

export function normalizeNonBlankText(
  value: string | undefined,
  message = 'Text fields cannot be blank',
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeTrimmedText(value);
  if (!normalized.length) {
    throw new BadRequestException(message);
  }

  return normalized;
}

export function validateAttendanceThresholdProgression(
  lateAfterMinutes: number,
  halfDayAfterMinutes: number,
  absentAfterMinutes: number,
): void {
  if (lateAfterMinutes > halfDayAfterMinutes) {
    throw new BadRequestException(
      'late_after_minutes must be less than or equal to half_day_after_minutes',
    );
  }

  if (halfDayAfterMinutes > absentAfterMinutes) {
    throw new BadRequestException(
      'half_day_after_minutes must be less than or equal to absent_after_minutes',
    );
  }
}

export async function ensureCompanyOwnedEntity<T extends ObjectLiteral>(
  repository: Repository<T>,
  where: Partial<T>,
  message: string,
): Promise<void> {
  const item = await repository.findOne({
    where: where as object,
  });
  if (!item) {
    throw new BadRequestException(message);
  }
}

export async function ensureUniqueEntity<T extends ObjectLiteral & { id?: number }>(
  repository: Repository<T>,
  where: Partial<T>,
  message: string,
  ignoreId?: number,
): Promise<void> {
  const existing = await repository.findOne({
    where: where as object,
  });

  if (existing && existing.id !== ignoreId) {
    throw new ConflictException(message);
  }
}

export async function ensureEmployeeBelongsToCompany(
  employeeRepository: Repository<Employee>,
  companyId: number,
  employeeId: number,
  message = 'employee_id does not belong to the active company',
): Promise<void> {
  const employee = await employeeRepository
    .createQueryBuilder('employee')
    .innerJoin('employee.company_user', 'companyUser')
    .where('employee.id = :employeeId', { employeeId })
    .andWhere('companyUser.company_id = :companyId', { companyId })
    .getOne();

  if (!employee) {
    throw new BadRequestException(message);
  }
}

export function applyActiveAssignmentOverlapFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  input: {
    companyId: number;
    employeeId: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    ignoreId?: number;
  },
): SelectQueryBuilder<T> {
  qb.where(`${alias}.company_id = :companyId`, { companyId: input.companyId })
    .andWhere(`${alias}.employee_id = :employeeId`, {
      employeeId: input.employeeId,
    })
    .andWhere(`${alias}.effective_from <= :candidateEnd`, {
      candidateEnd: input.effectiveTo ?? OPEN_ENDED_DATE_ONLY,
    })
    .andWhere(
      `(${alias}.effective_to IS NULL OR ${alias}.effective_to >= :candidateStart)`,
      {
        candidateStart: input.effectiveFrom,
      },
    );

  if (input.ignoreId) {
    qb.andWhere(`${alias}.id != :ignoreId`, { ignoreId: input.ignoreId });
  }

  return qb;
}

export function ensureRotationRuleAssignment(
  shiftId: number | null | undefined,
  isOffDay: boolean,
  message = 'shift_id is required when is_off_day is false',
): void {
  if (!shiftId && !isOffDay) {
    throw new BadRequestException(message);
  }
}
