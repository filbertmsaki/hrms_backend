import { ConflictException, ForbiddenException } from '@nestjs/common';
import { hasPermission } from '../../../common/utils/permission.util';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LetterStatusEnum } from './letter-catalogue';

export const DEFAULT_LETTER_TIMEZONE = 'Africa/Dar_es_Salaam';

export type LetterAction =
  | 'edit'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'issue'
  | 'cancel'
  | 'revise'
  | 'download';

const S = LetterStatusEnum;

/** Statuses each action may start from. */
export const LETTER_TRANSITIONS: Record<LetterAction, LetterStatusEnum[]> = {
  edit: [S.DRAFT, S.REJECTED],
  submit: [S.DRAFT, S.REJECTED],
  approve: [S.PENDING_APPROVAL],
  reject: [S.PENDING_APPROVAL],
  issue: [S.APPROVED],
  cancel: [S.DRAFT, S.PENDING_APPROVAL, S.APPROVED, S.ISSUED],
  revise: [S.ISSUED, S.APPROVED],
  download: [S.ISSUED],
};

const ACTION_PERMISSION: Record<LetterAction, string> = {
  edit: 'employee_letters:create',
  submit: 'employee_letters:create',
  approve: 'employee_letters:approve',
  reject: 'employee_letters:approve',
  issue: 'employee_letters:issue',
  cancel: 'employee_letters:cancel',
  revise: 'employee_letters:create',
  download: 'employee_letters:read',
};

const IMMUTABLE_MESSAGE: Partial<Record<LetterStatusEnum, string>> = {
  [S.APPROVED]:
    'Approved letters cannot be edited. Revise or cancel it instead.',
  [S.ISSUED]:
    'Issued letters cannot be edited. Revise it to issue a corrected letter.',
};

export function assertLetterTransition(
  status: string,
  action: LetterAction,
): void {
  if (LETTER_TRANSITIONS[action].includes(status as LetterStatusEnum)) return;
  const message =
    action === 'edit' && IMMUTABLE_MESSAGE[status as LetterStatusEnum]
      ? IMMUTABLE_MESSAGE[status as LetterStatusEnum]!
      : `A ${status.toLowerCase().replace(/_/g, ' ')} letter cannot be ${
          {
            edit: 'edited',
            submit: 'submitted',
            approve: 'approved',
            reject: 'rejected',
            issue: 'issued',
            cancel: 'cancelled',
            revise: 'revised',
            download: 'downloaded',
          }[action]
        }.`;
  throw new ConflictException(message);
}

/** Separation of duties: the person who submitted cannot approve or reject. */
export function assertNotSubmitter(
  actor: Pick<AuthenticatedUser, 'companyMembershipId'>,
  submittedBy: number | null,
): void {
  if (submittedBy && actor.companyMembershipId === submittedBy) {
    throw new ForbiddenException(
      'You submitted this letter, so another approver must review it.',
    );
  }
}

export function computeLetterCan(
  letter: { status: string; submitted_by_company_user_id: number | null },
  actor: Pick<AuthenticatedUser, 'permissions' | 'companyMembershipId'>,
): Record<LetterAction, boolean> {
  const result = {} as Record<LetterAction, boolean>;
  for (const action of Object.keys(LETTER_TRANSITIONS) as LetterAction[]) {
    result[action] =
      LETTER_TRANSITIONS[action].includes(letter.status as LetterStatusEnum) &&
      hasPermission(actor.permissions, ACTION_PERMISSION[action]);
  }
  if (
    letter.submitted_by_company_user_id &&
    letter.submitted_by_company_user_id === actor.companyMembershipId
  ) {
    result.approve = false;
    result.reject = false;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Reference numbers                                                   */
/* ------------------------------------------------------------------ */

export function formatLetterReference(year: number, value: number): string {
  return `LTR-${year}-${String(value).padStart(5, '0')}`;
}

type QueryRunnerLike = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Allocates the next reference for the company and year. The upsert takes a
 * row lock on the sequence row, so concurrent transactions queue and never
 * share a number; a rolled-back transaction releases its number.
 */
export async function allocateLetterReference(
  manager: QueryRunnerLike,
  companyId: number,
  year: number,
): Promise<string> {
  const rows = (await manager.query(
    `INSERT INTO "letter_reference_sequences" ("company_id", "year", "next_value")
     VALUES ($1, $2, 2)
     ON CONFLICT ("company_id", "year")
     DO UPDATE SET "next_value" = "letter_reference_sequences"."next_value" + 1
     RETURNING "next_value" - 1 AS "value"`,
    [companyId, year],
  )) as Array<{ value: number | string }>;
  const value = Number(rows[0]?.value);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error('Could not allocate a letter reference');
  }
  return formatLetterReference(year, value);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** "27 November 2026" in the company timezone (date-only strings as-is). */
export function formatLetterDate(
  value: string | Date | null | undefined,
  timezone = DEFAULT_LETTER_TIMEZONE,
): string {
  if (value === null || value === undefined || value === '') return '';
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) &&
    value.length <= 10
  ) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}

/** yyyy-mm-dd of `now` in the timezone. */
export function isoDateInTimezone(
  now: Date,
  timezone = DEFAULT_LETTER_TIMEZONE,
): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** "TZS 1,250,000" (decimals only when not whole). */
export function formatLetterMoney(
  amount: string | number | null | undefined,
  currency = 'TZS',
): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const numeric = Number(String(amount).replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return String(amount);
  const whole = Number.isInteger(numeric);
  const formatted = numeric.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${(currency || 'TZS').toUpperCase()} ${formatted}`;
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push('and');
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** Whole amount in English words: "one million two hundred and fifty thousand". */
export function amountInWords(
  amount: string | number | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Math.floor(Number(String(amount).replace(/,/g, '')));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'zero';
  const scales: Array<[number, string]> = [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  let rest = n;
  const words: string[] = [];
  for (const [size, name] of scales) {
    if (rest >= size) {
      words.push(`${belowThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest) words.push(belowThousand(rest));
  return words.join(' ');
}

export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '';
  const text = value.replace(/[_-]+/g, ' ').toLowerCase().trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whole years between two yyyy-mm-dd dates, as "3 years" / "1 year" / "Less than one year". */
export function yearsOfService(
  hireDate: string | null | undefined,
  today: string,
): string {
  if (!hireDate) return '';
  const [hy, hm, hd] = hireDate.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number);
  if (!hy || !ty) return '';
  let years = ty - hy;
  if (tm < hm || (tm === hm && td < hd)) years -= 1;
  if (years < 1) return 'Less than one year';
  return years === 1 ? '1 year' : `${years} years`;
}
