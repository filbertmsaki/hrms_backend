import { BadRequestException } from '@nestjs/common';
import type { FormScheduleDto, SaveFormDto } from './forms-feedback.dto';

export const QUESTION_LIBRARY = [
  {
    id: 'culture',
    category: 'work_culture',
    label: 'How comfortable do you feel sharing ideas at work?',
    type: 'rating',
    required: true,
  },
  {
    id: 'support',
    category: 'management_support',
    label: 'How satisfied are you with the support from your manager?',
    type: 'rating',
    required: true,
  },
  {
    id: 'balance',
    category: 'work_life_balance',
    label: 'How satisfied are you with your work-life balance?',
    type: 'rating',
    required: true,
  },
  {
    id: 'growth',
    category: 'career_growth',
    label: 'How satisfied are you with opportunities to develop your skills?',
    type: 'rating',
    required: true,
  },
  {
    id: 'compensation',
    category: 'compensation',
    label: 'How satisfied are you with your compensation and benefits?',
    type: 'rating',
    required: true,
  },
  {
    id: 'suggestion',
    label: 'What one change would most improve your experience at work?',
    type: 'long_text',
    required: false,
  },
  {
    id: 'preference',
    label: 'Which option do you prefer?',
    type: 'single_choice',
    required: true,
    options: ['Option A', 'Option B'],
  },
];

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}
function zonedDate(day: string, time: string, timezone: string) {
  const target = Date.parse(`${day}T${time}:00Z`);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (represented === target) return new Date(guess);
    guess += target - represented;
  }
  // A non-existent local clock time (DST gap) is skipped, never silently shifted.
  return null;
}
export function nextOpening(
  schedule: FormScheduleDto,
  after: Date,
): Date | null {
  const start = Date.parse(`${schedule.startDate}T00:00:00Z`);
  if (!Number.isFinite(start))
    throw new BadRequestException('Invalid start date');
  const firstOffset =
    schedule.frequency === 'once'
      ? 0
      : Math.max(0, Math.floor((after.getTime() - start) / 86400000) - 2);
  for (let offset = firstOffset; offset <= firstOffset + 370; offset++) {
    const date = new Date(start + offset * 86400000);
    const day = date.toISOString().slice(0, 10);
    if (schedule.endDate && day > schedule.endDate) return null;
    if (schedule.frequency === 'once' && offset > 0) return null;
    if (schedule.frequency === 'weekly' && offset % 7 !== 0) continue;
    if (schedule.frequency === 'monthly') {
      const last = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const wanted = schedule.useLastDay
        ? Math.min(schedule.dayOfMonth!, last)
        : schedule.dayOfMonth;
      if (date.getUTCDate() !== wanted) continue;
    }
    const result = zonedDate(day, schedule.time, schedule.timezone);
    if (result && result > after) return result;
  }
  return null;
}
/** On first publication, an elapsed opening today starts now, in the form's timezone. */
export function publicationOpening(
  schedule: FormScheduleDto,
  now: Date,
  roundCount: number,
): Date | null {
  if (roundCount === 0) {
    const parts = localParts(now, schedule.timezone);
    const day = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const midnight = zonedDate(day, '00:00', schedule.timezone);
    if (midnight) {
      const candidate = nextOpening(schedule, new Date(midnight.getTime() - 1));
      if (candidate && candidate <= now) return now;
    }
  }
  return nextOpening(schedule, now);
}

export function validateDefinition(def: SaveFormDto, draft = false) {
  if (!def.title?.trim() || !def.schedule || !def.audience)
    throw new BadRequestException('Title, audience and schedule are required');
  if (
    (!draft && !def.questions?.length) ||
    new Set(def.questions.map((q) => q.id)).size !== def.questions.length
  )
    throw new BadRequestException('Provide questions with unique IDs');
  for (const q of def.questions) {
    if (['__proto__', 'prototype', 'constructor'].includes(q.id))
      throw new BadRequestException('Invalid question ID');
    if (!draft && !q.label.trim())
      throw new BadRequestException('Question labels cannot be empty');
    if (
      !draft &&
      ['single_choice', 'multiple_choice'].includes(q.type) &&
      (!q.options || q.options.length < 2 || q.options.some((o) => !o.trim()))
    )
      throw new BadRequestException(
        'Choice questions need at least two distinct options',
      );
  }
  if (
    !draft &&
    def.satisfaction &&
    !def.questions.some((q) => q.type === 'rating' && q.required)
  )
    throw new BadRequestException(
      'Satisfaction forms require at least one required rating question',
    );
  if (def.audience.type !== 'all' && !def.audience.ids.length)
    throw new BadRequestException('Select an audience');
  try {
    localParts(new Date(), def.schedule.timezone);
  } catch {
    throw new BadRequestException('Invalid timezone');
  }
  for (const day of [def.schedule.startDate, def.schedule.endDate].filter(
    Boolean,
  ) as string[]) {
    if (
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    )
      throw new BadRequestException('Invalid calendar date');
  }
  if (def.schedule.endDate && def.schedule.endDate < def.schedule.startDate)
    throw new BadRequestException('End date must follow start date');
  if (def.schedule.frequency === 'monthly' && !def.schedule.dayOfMonth)
    throw new BadRequestException('Choose a monthly day');
}
export function validateAnswers(
  def: SaveFormDto,
  answers: Record<string, unknown>,
) {
  if (
    Object.keys(answers).some((id) => !def.questions.some((q) => q.id === id))
  )
    throw new BadRequestException('Unknown question');
  const clean: Record<string, unknown> = {};
  for (const q of def.questions) {
    const v = answers[q.id];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === 'string' && !v.trim()) ||
      (Array.isArray(v) && !v.length);
    if (empty) {
      if (q.required)
        throw new BadRequestException(`Answer required: ${q.label}`);
      continue;
    }
    let valid = false;
    switch (q.type) {
      case 'short_text':
      case 'long_text':
        valid =
          typeof v === 'string' &&
          v.length <= (q.type === 'short_text' ? 500 : 5000);
        break;
      case 'single_choice':
        valid = typeof v === 'string' && !!q.options?.includes(v);
        break;
      case 'multiple_choice':
        valid =
          Array.isArray(v) &&
          v.every((x) => typeof x === 'string' && q.options?.includes(x)) &&
          new Set(v).size === v.length;
        break;
      case 'yes_no':
        valid = typeof v === 'boolean';
        break;
      case 'rating':
        valid =
          typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
        break;
      case 'number':
        valid =
          typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12;
        break;
      case 'date':
        valid =
          typeof v === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(v) &&
          Number.isFinite(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v;
        break;
    }
    if (!valid) throw new BadRequestException(`Invalid answer: ${q.label}`);
    clean[q.id] = v;
  }
  return clean;
}
