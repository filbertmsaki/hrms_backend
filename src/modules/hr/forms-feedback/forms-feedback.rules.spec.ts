import {
  nextOpening,
  validateAnswers,
  validateDefinition,
} from './forms-feedback.rules';
import { SaveFormDto, FormScheduleDto } from './forms-feedback.dto';
const schedule: FormScheduleDto = {
  frequency: 'monthly',
  timezone: 'Africa/Dar_es_Salaam',
  startDate: '2026-01-01',
  time: '09:00',
  dayOfMonth: 23,
  openDays: 7,
};
const definition: SaveFormDto = {
  title: 'Pulse',
  description: '',
  kind: 'survey',
  responseMode: 'anonymous',
  satisfaction: true,
  questions: [
    { id: 'q', label: 'How satisfied?', type: 'rating', required: true },
  ],
  audience: { type: 'all', ids: [] },
  schedule,
};
describe('Forms & Feedback rules', () => {
  it('opens on the 23rd at the chosen local time', () => {
    expect(
      nextOpening(schedule, new Date('2026-01-22T00:00:00Z'))?.toISOString(),
    ).toBe('2026-01-23T06:00:00.000Z');
  });
  it('moves to the next monthly round without replaying the same time', () => {
    expect(
      nextOpening(schedule, new Date('2026-01-23T06:00:00Z'))?.toISOString(),
    ).toBe('2026-02-23T06:00:00.000Z');
  });
  it('supports the shorter-month policy', () => {
    expect(
      nextOpening(
        { ...schedule, dayOfMonth: 31, useLastDay: true },
        new Date('2026-02-01T00:00Z'),
      )?.toISOString(),
    ).toBe('2026-02-28T06:00:00.000Z');
    expect(
      nextOpening(
        { ...schedule, dayOfMonth: 31 },
        new Date('2026-02-01T00:00Z'),
      )?.toISOString(),
    ).toBe('2026-03-31T06:00:00.000Z');
  });
  it('honours end dates and one-time expiry', () => {
    expect(
      nextOpening(
        { ...schedule, endDate: '2026-01-22' },
        new Date('2026-01-01'),
      ),
    ).toBeNull();
    expect(
      nextOpening({ ...schedule, frequency: 'once' }, new Date('2026-01-02')),
    ).toBeNull();
  });
  it('handles DST and skips nonexistent local times', () => {
    expect(
      nextOpening(
        {
          ...schedule,
          frequency: 'once',
          timezone: 'America/New_York',
          startDate: '2026-03-08',
          time: '02:30',
        },
        new Date('2026-03-01'),
      ),
    ).toBeNull();
    expect(
      nextOpening(
        { ...schedule, timezone: 'America/New_York' },
        new Date('2026-03-01'),
      )?.toISOString(),
    ).toBe('2026-03-23T13:00:00.000Z');
  });
  it('validates required questions, scales and unknown answers', () => {
    expect(() => validateAnswers(definition, {})).toThrow();
    expect(() => validateAnswers(definition, { q: 6 })).toThrow();
    expect(() =>
      validateAnswers(definition, { q: 4, employee_id: 1 }),
    ).toThrow();
    expect(validateAnswers(definition, { q: 4 })).toEqual({ q: 4 });
  });
  it('requires a rating question for satisfaction and validates real dates', () => {
    expect(() =>
      validateDefinition({
        ...definition,
        questions: [{ ...definition.questions[0], type: 'short_text' }],
      }),
    ).toThrow();
    expect(() =>
      validateDefinition({
        ...definition,
        schedule: { ...schedule, startDate: '2026-02-30' },
      }),
    ).toThrow();
  });
  it('validates choices, booleans, dates and text lengths', () => {
    const def = {
      ...definition,
      questions: [
        {
          id: 'a',
          label: 'A',
          type: 'multiple_choice',
          options: ['one', 'two'],
          required: true,
        },
      ],
    };
    expect(() => validateAnswers(def, { a: ['one', 'one'] })).toThrow();
    expect(validateAnswers(def, { a: ['one'] })).toEqual({ a: ['one'] });
  });
});
