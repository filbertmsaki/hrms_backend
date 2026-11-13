/**
 * Presentation formatting for the contract PDF. These helpers only change how
 * a stored value reads (dates in full, amounts with words, plurals); they
 * never change the stored value or the template wording.
 */
import { ContractToken } from './contract-templates.service';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-11-01" → "1 November 2026". Anything else is returned unchanged. */
export function formatLegalDate(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
  if (!match) return raw;
  const [, y, m, d] = match;
  const month = MONTHS[Number(m) - 1];
  if (!month || Number(d) < 1 || Number(d) > 31) return raw;
  return `${Number(d)} ${month} ${y}`;
}

const CURRENCY_NAMES: Record<string, [string, string]> = {
  TZS: ['Tanzanian Shillings', 'Cents'],
  KES: ['Kenyan Shillings', 'Cents'],
  UGX: ['Ugandan Shillings', 'Cents'],
  RWF: ['Rwandan Francs', 'Centimes'],
  USD: ['United States Dollars', 'Cents'],
  EUR: ['Euros', 'Cents'],
  GBP: ['Pounds Sterling', 'Pence'],
  ZAR: ['South African Rand', 'Cents'],
};

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
    if (n) parts.push('and');
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n) parts.push(ONES[n]);
  return parts.join(' ');
}

/** 1250000 → "One Million Two Hundred and Fifty Thousand". */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'Zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk)
      groups.unshift(
        `${underThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`,
      );
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}

/**
 * "1000000" + "TZS" → "1,000,000.00 (Tanzanian Shillings One Million Only)".
 * The currency code itself is not repeated, because templates write
 * "{{currency}} {{salary}}". Unparseable values are returned unchanged.
 */
export function formatAmountWithWords(
  value: string | null | undefined,
  currency: string | null | undefined,
): string {
  const raw = (value ?? '').trim();
  const amount = Number(raw.replace(/,/g, ''));
  if (!raw || !Number.isFinite(amount)) return raw;
  const figures = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const code = (currency ?? '').trim().toUpperCase();
  const [major, minor] = CURRENCY_NAMES[code] ?? [code || 'Currency', 'Cents'];
  const cents = Math.round((Math.abs(amount) % 1) * 100);
  const words = `${major} ${numberToWords(amount)}${
    cents ? ` and ${numberToWords(cents)} ${minor}` : ''
  } Only`;
  return `${figures} (${words})`;
}

/**
 * Title case only for values typed entirely in upper or lower case, so
 * deliberate casing ("P.O. Box", "Dar es Salaam", "McDonald") is kept.
 */
export function titleCaseIfFlat(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw || (raw !== raw.toUpperCase() && raw !== raw.toLowerCase()))
    return raw;
  if (!/[a-z]/i.test(raw)) return raw;
  return raw
    .toLowerCase()
    .replace(
      /(^|[\s\-'(/.,])([a-z])/g,
      (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`,
    )
    .replace(
      /(?<=\s)(Es|Wa|La|Na|Ya|Za|Of|And|The|De|Du|Van|Von)(?=\s)/g,
      (word: string) => word.toLowerCase(),
    );
}

/** "1 month(s)" → "1 month", "6 month(s)" → "6 months" (also day/week/year). */
export function fixPlurals(textValue: string): string {
  return textValue.replace(
    /\b(\d+(?:\.\d+)?)\s+(month|day|week|year|hour)\(s\)/gi,
    (_m, n: string, unit: string) =>
      `${n} ${unit}${Number(n) === 1 ? '' : 's'}`,
  );
}

/**
 * Display copy of the template values. The original values (frozen in the
 * snapshot and written back to columns) are not touched.
 */
export function displayValues(
  values: Partial<Record<ContractToken, string>>,
): Partial<Record<ContractToken, string>> {
  const out = { ...values };
  for (const key of [
    'start_date',
    'end_date',
    'issue_date',
    'employee_dob',
  ] as const)
    if (out[key]) out[key] = formatLegalDate(out[key]);
  if (out.salary) out.salary = formatAmountWithWords(out.salary, out.currency);
  if (out.currency) out.currency = out.currency.trim().toUpperCase();
  for (const key of [
    'employee_name',
    'employee_address',
    'place_of_recruitment',
    'work_location',
    'reporting_manager',
  ] as const)
    if (out[key]) out[key] = titleCaseIfFlat(out[key]);
  return out;
}
