import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSelfActivityTaskDto } from '../../work-activities/dto/activity.dto';
import { BadRequestException } from '@nestjs/common';
import {
  assertCalendarDate,
  assertDateRange,
  assertWeightTotal,
} from './workflow-validation';

describe('workflow boundary validation', () => {
  it('accepts leap days only in leap years and rejects timestamp input for date-only fields', () => {
    expect(() => assertCalendarDate('2024-02-29', 'date')).not.toThrow();
    for (const value of [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-01-01T00:00:00Z',
    ])
      expect(() => assertCalendarDate(value, 'date')).toThrow(
        BadRequestException,
      );
    expect(() => assertDateRange('2026-03-01', '2026-02-28', 'Cycle')).toThrow(
      BadRequestException,
    );
  });
  it('accepts exact database-scale weights and rejects cancellation tricks or rounding shortcuts', () => {
    expect(() => assertWeightTotal([33.33, 33.33, 33.34], 'KPI')).not.toThrow();
    for (const values of [
      [101, -1],
      [50, 49.999],
      [NaN, 100],
      [Infinity],
      [],
      [100, 0],
    ])
      expect(() => assertWeightTotal(values, 'KPI')).toThrow(
        BadRequestException,
      );
  });
  it.each([
    [null],
    [
      { id: 'same', title: 'First' },
      { id: 'same', title: 'Second' },
    ],
  ])(
    'returns validation errors for malformed or duplicate checklist items without throwing',
    async (...items: unknown[]) => {
      const dto = plainToInstance(CreateSelfActivityTaskDto, {
        activity_date: '2026-10-12',
        title: 'Work',
        description: 'Description',
        checklist: items,
      });
      await expect(validate(dto)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'checklist' }),
        ]),
      );
    },
  );
});
