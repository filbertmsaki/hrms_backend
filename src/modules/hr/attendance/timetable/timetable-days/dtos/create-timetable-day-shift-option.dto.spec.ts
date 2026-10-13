import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTimetableDayShiftOptionDto } from './create-timetable-day-shift-option.dto';

describe('CreateTimetableDayShiftOptionDto capacity', () => {
  it.each(['', null, undefined])(
    'treats empty capacity %p as unlimited',
    (value) => {
      const dto = plainToInstance(CreateTimetableDayShiftOptionDto, {
        timetable_day_id: 2,
        shift_id: 5,
        max_employees: value,
      });

      expect(dto.max_employees).toBeNull();
      expect(validateSync(dto)).toEqual([]);
    },
  );

  it('transforms and validates a configured positive capacity', () => {
    const dto = plainToInstance(CreateTimetableDayShiftOptionDto, {
      timetable_day_id: '2',
      shift_id: '5',
      max_employees: '12',
    });

    expect(dto.max_employees).toBe(12);
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects a zero capacity', () => {
    const dto = plainToInstance(CreateTimetableDayShiftOptionDto, {
      timetable_day_id: 2,
      shift_id: 5,
      max_employees: 0,
    });

    expect(
      validateSync(dto).some((error) => error.property === 'max_employees'),
    ).toBe(true);
  });
});
