import { AttendanceReportFormatEnum } from '../dtos/attendance-report-format.enum';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function buildEmployeeFullName(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export function resolveReportLabel(
  name: string | null | undefined,
  code: string | null | undefined,
): string {
  if (name?.trim()) {
    return name.trim();
  }

  if (code?.trim()) {
    return code.trim();
  }

  return '';
}

/**
 * Postgres DATE columns can arrive as "YYYY-MM-DD" strings or as JS Dates
 * (local midnight) depending on the driver's type parser. Reports always
 * use the calendar day as "YYYY-MM-DD".
 */
export function normalizeAttendanceDate(
  value: string | Date | null | undefined,
): string {
  if (value == null) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : text;
}

export function formatAttendanceDate(
  date: string | Date | null | undefined,
): string {
  return normalizeAttendanceDate(date);
}

/** Minutes for a report cell; blank when there is no value (e.g. "No record" rows). */
export function formatReportMinutes(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '' : String(value);
}

export function formatAttendanceTime(
  value: Date | null,
  timezone: string | null | undefined,
): string {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

export function toExcelDate(
  date: string | Date | null | undefined,
): Date | null {
  const day = normalizeAttendanceDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(`${day}T00:00:00.000Z`);
}

export function toExcelTime(
  value: Date | null,
  timezone: string | null | undefined,
): Date | null {
  if (!value) {
    return null;
  }

  const timeString = formatAttendanceTime(value, timezone);
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  return new Date(
    Date.UTC(
      1970,
      0,
      1,
      Number.isFinite(hours) ? hours : 0,
      Number.isFinite(minutes) ? minutes : 0,
      Number.isFinite(seconds) ? seconds : 0,
    ),
  );
}

export function escapeCsvCell(value: unknown): string {
  const normalized =
    value == null
      ? ''
      : typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  if (!/[",\r\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildAttendanceReportFilename(
  format: AttendanceReportFormatEnum,
  fromDate?: string,
  toDate?: string,
): string {
  const extension = format;

  if (fromDate && toDate) {
    const fromMonth = fromDate.slice(0, 7);
    const toMonth = toDate.slice(0, 7);
    if (fromMonth === toMonth) {
      return `attendance-report-${fromMonth}.${extension}`;
    }

    return `attendance-report-${fromDate}-to-${toDate}.${extension}`;
  }

  if (fromDate) {
    return `attendance-report-${fromDate}.${extension}`;
  }

  if (toDate) {
    return `attendance-report-${toDate}.${extension}`;
  }

  const now = new Date();
  const currentDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  return `attendance-report-${currentDate}.${extension}`;
}

export function buildReportingPeriodLabel(
  fromDate?: string,
  toDate?: string,
): string {
  if (fromDate && toDate) {
    return `${fromDate} to ${toDate}`;
  }

  if (fromDate) {
    return `From ${fromDate}`;
  }

  if (toDate) {
    return `Up to ${toDate}`;
  }

  return 'All attendance dates';
}
