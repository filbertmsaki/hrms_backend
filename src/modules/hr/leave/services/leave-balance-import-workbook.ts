import { createHmac, timingSafeEqual } from 'crypto';
import ExcelJS from 'exceljs';

export const LEAVE_BALANCE_TEMPLATE_VERSION = '1.0';
export const LEAVE_BALANCE_DATA_SHEET = 'Leave Balances';
const INSTRUCTIONS_SHEET = 'Instructions';
const INFO_SHEET = 'Template Info';
const SUMMARY_SHEET = 'Import Summary';
const TOKEN_LABEL = 'template_token';
const HEADER_FILL = 'FF1F4E78';
const REFERENCE_FILL = 'FFF1F5F9';
const EDITABLE_FILL = 'FFFFF7D6';

export const LEAVE_BALANCE_MAX_ABSOLUTE_DAYS = 99999.99;
export const LEAVE_BALANCE_REASON_MAX_LENGTH = 500;

export type LeaveBalanceTemplateColumnKey =
  | 'employee_no'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'branch'
  | 'department'
  | 'position'
  | 'leave_year'
  | 'leave_type_code'
  | 'leave_type_name'
  | 'current_balance'
  | 'new_balance'
  | 'reason'
  | 'employee_ref'
  | 'leave_type_ref'
  | 'balance_version';

type TemplateColumn = {
  key: LeaveBalanceTemplateColumnKey;
  header: string;
  width: number;
  editable?: boolean;
  hidden?: boolean;
  numeric?: boolean;
};

/**
 * One row = one Employee + Leave Type balance. Only New Leave Balance and the
 * reason are meant to be edited; everything else is reference data that the
 * import re-validates against the database. The trailing hidden columns carry
 * stable identifiers so edited employee numbers or codes are detected.
 */
export const LEAVE_BALANCE_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: 'employee_no', header: 'Employee Number', width: 18 },
  { key: 'first_name', header: 'First Name', width: 18 },
  { key: 'middle_name', header: 'Middle Name', width: 16 },
  { key: 'last_name', header: 'Last Name', width: 18 },
  { key: 'branch', header: 'Branch', width: 20 },
  { key: 'department', header: 'Department', width: 22 },
  { key: 'position', header: 'Position', width: 24 },
  { key: 'leave_year', header: 'Leave Year', width: 11 },
  { key: 'leave_type_code', header: 'Leave Type Code', width: 17 },
  { key: 'leave_type_name', header: 'Leave Type Name', width: 24 },
  {
    key: 'current_balance',
    header: 'Current Leave Balance',
    width: 21,
    numeric: true,
  },
  {
    key: 'new_balance',
    header: 'New Leave Balance',
    width: 19,
    editable: true,
    numeric: true,
  },
  {
    key: 'reason',
    header: 'Adjustment Reason / Remarks',
    width: 42,
    editable: true,
  },
  { key: 'employee_ref', header: 'Employee Ref', width: 12, hidden: true },
  { key: 'leave_type_ref', header: 'Leave Type Ref', width: 12, hidden: true },
  {
    key: 'balance_version',
    header: 'Balance Version',
    width: 12,
    hidden: true,
  },
];

const HEADER_ALIASES: Record<string, LeaveBalanceTemplateColumnKey> = {
  employee_number: 'employee_no',
  employee_no: 'employee_no',
  first_name: 'first_name',
  middle_name: 'middle_name',
  last_name: 'last_name',
  branch: 'branch',
  department: 'department',
  position: 'position',
  leave_year: 'leave_year',
  leave_type_code: 'leave_type_code',
  leave_type_name: 'leave_type_name',
  current_leave_balance: 'current_balance',
  current_balance: 'current_balance',
  new_leave_balance: 'new_balance',
  new_balance: 'new_balance',
  adjustment_reason_remarks: 'reason',
  adjustment_reason: 'reason',
  reason: 'reason',
  remarks: 'reason',
  employee_ref: 'employee_ref',
  leave_type_ref: 'leave_type_ref',
  balance_version: 'balance_version',
};

type ReportColumnKey =
  | 'source_row'
  | 'database_current_balance'
  | 'adjustment'
  | 'validation_status'
  | 'import_result'
  | 'error_code'
  | 'error_description'
  | 'all_issues';

/** Diagnostic columns appended to the error report; ignored on re-upload. */
const REPORT_COLUMNS: Array<{
  key: ReportColumnKey;
  header: string;
  width: number;
}> = [
  { key: 'source_row', header: 'Source Row', width: 11 },
  {
    key: 'database_current_balance',
    header: 'Database Current Balance',
    width: 23,
  },
  { key: 'adjustment', header: 'Adjustment', width: 13 },
  { key: 'validation_status', header: 'Validation Status', width: 18 },
  { key: 'import_result', header: 'Import Result', width: 15 },
  { key: 'error_code', header: 'Error Code', width: 30 },
  { key: 'error_description', header: 'Error Description', width: 70 },
  { key: 'all_issues', header: 'All Issues', width: 70 },
];
const IGNORED_HEADERS = new Set<string>(REPORT_COLUMNS.map((c) => c.key));

export type LeaveBalanceTemplateToken = {
  v: number;
  /** Template/export identifier. */
  tid: string;
  /** Company the template was generated for. */
  cid: number;
  /** Leave (fiscal) year of every balance in the template. */
  fy: string;
  /** Generation timestamp (ISO). */
  gat: string;
};

export type LeaveBalanceTemplateRow = Record<
  LeaveBalanceTemplateColumnKey,
  string | number | null
>;

export type ParsedLeaveBalanceRow = {
  rowNumber: number;
  values: Record<LeaveBalanceTemplateColumnKey, string>;
};

export type ParsedLeaveBalanceWorkbook = {
  token: string;
  rows: ParsedLeaveBalanceRow[];
};

export class LeaveBalanceWorkbookError extends Error {
  constructor(
    readonly code: 'INVALID_TEMPLATE' | 'INVALID_FILE',
    message: string,
  ) {
    super(message);
  }
}

export function signLeaveBalanceTemplateToken(
  payload: LeaveBalanceTemplateToken,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${templateSignature(body, secret).toString('base64url')}`;
}

/** Returns the payload only when the token was signed by this server. */
export function verifyLeaveBalanceTemplateToken(
  token: string,
  secret: string,
): LeaveBalanceTemplateToken | null {
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const expected = templateSignature(parts[0], secret);
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString('utf8'),
    ) as Partial<LeaveBalanceTemplateToken>;
    if (
      typeof payload.v !== 'number' ||
      typeof payload.tid !== 'string' ||
      typeof payload.cid !== 'number' ||
      typeof payload.fy !== 'string' ||
      !/^\d{4}$/.test(payload.fy) ||
      typeof payload.gat !== 'string' ||
      Number.isNaN(Date.parse(payload.gat))
    ) {
      return null;
    }
    return payload as LeaveBalanceTemplateToken;
  } catch {
    return null;
  }
}

function templateSignature(body: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(`leave-balance-template:${body}`)
    .digest();
}

export function normalizeLeaveBalanceHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Reads the value Excel saved for a cell. Formula cells contribute their
 * cached result only; formulas are never evaluated.
 */
export function readLeaveBalanceCellText(
  value: ExcelJS.CellValue | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return readLeaveBalanceCellText(value.result as ExcelJS.CellValue);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((item) => item.text)
        .join('')
        .trim();
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
  }
  return '';
}

export type ParsedDecimal =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'precision'; value: number }
  | { kind: 'value'; value: number };

/** Leave balances are stored with two decimal places (numeric(8,2)). */
export function parseLeaveBalanceDecimal(text: string): ParsedDecimal {
  const trimmed = text.trim();
  if (!trimmed) {
    return { kind: 'empty' };
  }
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) {
    return { kind: 'invalid' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { kind: 'invalid' };
  }
  const hundredths = value * 100;
  if (Math.abs(hundredths - Math.round(hundredths)) > 1e-6) {
    return { kind: 'precision', value };
  }
  return { kind: 'value', value: Math.round(hundredths) / 100 };
}

export function toLeaveBalanceCents(value: number): number {
  return Math.round(value * 100);
}

export async function buildLeaveBalanceTemplateWorkbook(params: {
  token: string;
  fiscalYear: string;
  companyName: string | null;
  generatedAt: Date;
  rows: LeaveBalanceTemplateRow[];
}): Promise<Buffer> {
  const workbook = createWorkbook(params.generatedAt);

  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET, {
    views: [{ showGridLines: false }],
  });
  instructions.columns = [
    { header: 'Topic', key: 'topic', width: 30 },
    { header: 'Details', key: 'details', width: 110 },
  ];
  instructions.addRows([
    [
      'Leave balance bulk import',
      `Current balances for leave year ${params.fiscalYear}${params.companyName ? ` at ${params.companyName}` : ''}, generated ${params.generatedAt.toISOString()} from the same balances shown in Leave Management.`,
    ],
    [
      'One row per balance',
      'Each row is one Employee + Leave Type balance. Changing one leave type never affects another leave type of the same employee.',
    ],
    [
      'What to edit',
      'Enter the corrected figure in New Leave Balance. Leave it blank to keep the current balance. Add an Adjustment Reason / Remarks for every changed balance, or provide a default reason when uploading.',
    ],
    [
      'Do not edit',
      'Employee, organisation, leave type and Current Leave Balance columns are reference data. They are checked against the database on upload, and changed values are reported as mismatches.',
    ],
    [
      'Precision',
      'Balances are in days with up to two decimal places, for example 12.5 or 7.25. Negative balances are accepted only where the leave policy allows them.',
    ],
    [
      'Outdated templates',
      'If leave is taken or a balance changes after this template was downloaded, that row is rejected as a balance mismatch instead of being overwritten. Download a new template to correct it.',
    ],
    [
      'Before anything is saved',
      'Uploading only validates the file. Balances change after you review the preview and confirm the import; every change is recorded as a leave balance adjustment.',
    ],
    [
      'This template',
      'The template is tied to your company and leave year. Do not rename sheets, reorder columns or copy rows into another workbook.',
    ],
  ]);
  styleHeaderRow(instructions.getRow(1));
  instructions.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const sheet = workbook.addWorksheet(LEAVE_BALANCE_DATA_SHEET, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });
  sheet.columns = templateColumnDefinitions();
  styleHeaderRow(sheet.getRow(1));
  params.rows.forEach((row) => sheet.addRow(row));
  applyDataGrid(sheet, params.rows.length);

  const info = workbook.addWorksheet(INFO_SHEET, { state: 'veryHidden' });
  info.columns = [
    { header: 'key', key: 'key', width: 22 },
    { header: 'value', key: 'value', width: 80 },
  ];
  info.addRows([
    [TOKEN_LABEL, params.token],
    ['template_version', LEAVE_BALANCE_TEMPLATE_VERSION],
    ['fiscal_year', params.fiscalYear],
    ['generated_at', params.generatedAt.toISOString()],
    ['row_count', params.rows.length],
  ]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseLeaveBalanceImportWorkbook(
  buffer: Buffer,
): Promise<ParsedLeaveBalanceWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    throw new LeaveBalanceWorkbookError(
      'INVALID_FILE',
      'The uploaded file could not be read. Make sure it is a valid .xlsx workbook that is not password protected.',
    );
  }

  const sheet = workbook.getWorksheet(LEAVE_BALANCE_DATA_SHEET);
  if (!sheet) {
    throw new LeaveBalanceWorkbookError(
      'INVALID_TEMPLATE',
      `The "${LEAVE_BALANCE_DATA_SHEET}" worksheet was not found. Upload the template downloaded from Leave Balance Bulk Import.`,
    );
  }

  const token = readTemplateToken(workbook);
  if (!token) {
    throw new LeaveBalanceWorkbookError(
      'INVALID_TEMPLATE',
      'This workbook is not a leave balance template generated by the HRMS. Download a new template and enter the balances there.',
    );
  }

  const columnKeys = new Map<number, LeaveBalanceTemplateColumnKey>();
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const unexpected: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const label = readLeaveBalanceCellText(cell.value);
    const normalized = normalizeLeaveBalanceHeader(label);
    if (!normalized || IGNORED_HEADERS.has(normalized)) {
      return;
    }
    const key = HEADER_ALIASES[normalized];
    if (!key) {
      unexpected.push(label);
      return;
    }
    if (seen.has(key)) {
      duplicates.push(label);
      return;
    }
    seen.add(key);
    columnKeys.set(columnNumber, key);
  });
  const missing = LEAVE_BALANCE_TEMPLATE_COLUMNS.filter(
    (column) => !seen.has(column.key),
  ).map((column) => column.header);
  const problems = [
    missing.length ? `missing columns: ${missing.join(', ')}` : null,
    duplicates.length ? `duplicate columns: ${duplicates.join(', ')}` : null,
    unexpected.length ? `unexpected columns: ${unexpected.join(', ')}` : null,
  ].filter((item): item is string => Boolean(item));
  if (problems.length) {
    throw new LeaveBalanceWorkbookError(
      'INVALID_TEMPLATE',
      `The worksheet columns do not match the leave balance template (${problems.join('; ')}). Download a new template and do not add, remove or rename columns.`,
    );
  }

  const rows: ParsedLeaveBalanceRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const values = Object.fromEntries(
      LEAVE_BALANCE_TEMPLATE_COLUMNS.map((column) => [column.key, '']),
    ) as Record<LeaveBalanceTemplateColumnKey, string>;
    let hasValue = false;
    columnKeys.forEach((key, columnNumber) => {
      const text = readLeaveBalanceCellText(row.getCell(columnNumber).value);
      values[key] = text;
      if (text) {
        hasValue = true;
      }
    });
    if (hasValue) {
      rows.push({ rowNumber, values });
    }
  });

  return { token, rows };
}

export type LeaveBalanceReportRow = {
  rowNumber: number;
  rawData: Record<string, string>;
  databaseCurrentBalance: string | null;
  adjustment: string | null;
  validationStatus: string;
  resultStatus: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  allIssues: string;
};

export async function buildLeaveBalanceReportWorkbook(params: {
  token: string;
  generatedAt: Date;
  summary: Array<[string, string | number]>;
  rows: LeaveBalanceReportRow[];
}): Promise<Buffer> {
  const workbook = createWorkbook(params.generatedAt);

  const summarySheet = workbook.addWorksheet(SUMMARY_SHEET, {
    views: [{ showGridLines: false }],
  });
  summarySheet.columns = [
    { header: 'Item', key: 'item', width: 34 },
    { header: 'Value', key: 'value', width: 70 },
  ];
  styleHeaderRow(summarySheet.getRow(1));
  params.summary.forEach(([item, value]) =>
    summarySheet.addRow({ item, value: exportSafeText(value) }),
  );

  const sheet = workbook.addWorksheet(LEAVE_BALANCE_DATA_SHEET, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });
  sheet.columns = [
    ...templateColumnDefinitions(),
    ...REPORT_COLUMNS.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width,
    })),
  ];
  styleHeaderRow(sheet.getRow(1));

  params.rows.forEach((row) => {
    const values: Record<string, string | number> = {};
    LEAVE_BALANCE_TEMPLATE_COLUMNS.forEach((column) => {
      const text = row.rawData[column.key] ?? '';
      const parsed = column.numeric ? parseLeaveBalanceDecimal(text) : null;
      values[column.key] =
        parsed && parsed.kind === 'value' ? parsed.value : exportSafeText(text);
    });
    values.source_row = row.rowNumber;
    values.database_current_balance =
      row.databaseCurrentBalance === null
        ? ''
        : Number(row.databaseCurrentBalance);
    values.adjustment = row.adjustment === null ? '' : Number(row.adjustment);
    values.validation_status = row.validationStatus;
    values.import_result = row.resultStatus ?? '';
    values.error_code = row.errorCode ?? '';
    values.error_description = exportSafeText(row.errorDescription ?? '');
    values.all_issues = exportSafeText(row.allIssues);

    const added = sheet.addRow(values);
    const tone = reportRowFill(row.validationStatus, row.resultStatus);
    if (tone) {
      REPORT_COLUMNS.forEach((column) => {
        added.getCell(column.key).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: tone },
        };
      });
    }
  });
  applyDataGrid(sheet, params.rows.length);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: {
      row: 1,
      column: LEAVE_BALANCE_TEMPLATE_COLUMNS.length + REPORT_COLUMNS.length,
    },
  };

  const info = workbook.addWorksheet(INFO_SHEET, { state: 'veryHidden' });
  info.addRows([
    [TOKEN_LABEL, params.token],
    ['template_version', LEAVE_BALANCE_TEMPLATE_VERSION],
  ]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function createWorkbook(createdAt: Date): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HRMS';
  workbook.created = createdAt;
  return workbook;
}

function readTemplateToken(workbook: ExcelJS.Workbook): string | null {
  const info = workbook.getWorksheet(INFO_SHEET);
  if (!info) {
    return null;
  }
  let token: string | null = null;
  info.eachRow({ includeEmpty: false }, (row) => {
    if (readLeaveBalanceCellText(row.getCell(1).value) === TOKEN_LABEL) {
      token = readLeaveBalanceCellText(row.getCell(2).value) || null;
    }
  });
  return token;
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  };
  row.height = 24;
  row.alignment = { vertical: 'middle' };
}

function templateColumnDefinitions(): Array<Partial<ExcelJS.Column>> {
  return LEAVE_BALANCE_TEMPLATE_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    hidden: column.hidden ?? false,
    style: {
      ...(column.numeric ? { numFmt: '0.00' } : {}),
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: column.editable ? EDITABLE_FILL : REFERENCE_FILL },
      },
    },
  }));
}

function applyDataGrid(sheet: ExcelJS.Worksheet, rowCount: number): void {
  const newBalanceColumn = sheet.getColumn('new_balance').number;
  const reasonColumn = sheet.getColumn('reason').number;
  for (let rowNumber = 2; rowNumber <= rowCount + 1; rowNumber += 1) {
    sheet.getCell(rowNumber, newBalanceColumn).dataValidation = {
      type: 'decimal',
      operator: 'between',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid leave balance',
      error: `Enter a number of days between -${LEAVE_BALANCE_MAX_ABSOLUTE_DAYS} and ${LEAVE_BALANCE_MAX_ABSOLUTE_DAYS}, or leave blank for no change.`,
      formulae: [
        -LEAVE_BALANCE_MAX_ABSOLUTE_DAYS,
        LEAVE_BALANCE_MAX_ABSOLUTE_DAYS,
      ],
    };
    sheet.getCell(rowNumber, reasonColumn).dataValidation = {
      type: 'textLength',
      operator: 'lessThanOrEqual',
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Reason too long',
      error: `Use at most ${LEAVE_BALANCE_REASON_MAX_LENGTH} characters.`,
      formulae: [LEAVE_BALANCE_REASON_MAX_LENGTH],
    };
  }
  const editableHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF166534' },
  };
  sheet.getRow(1).getCell(newBalanceColumn).fill = editableHeaderFill;
  sheet.getRow(1).getCell(reasonColumn).fill = editableHeaderFill;
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: LEAVE_BALANCE_TEMPLATE_COLUMNS.length },
  };
}

function reportRowFill(
  validationStatus: string,
  resultStatus: string | null,
): string | null {
  if (resultStatus === 'FAILED' || validationStatus === 'INVALID') {
    return 'FFFEE2E2';
  }
  if (resultStatus === 'IMPORTED') {
    return 'FFDCFCE7';
  }
  if (validationStatus === 'WARNING') {
    return 'FFFEF3C7';
  }
  return null;
}

/** Neutralises spreadsheet formula injection in text written to reports. */
function exportSafeText(value: string | number): string | number {
  if (typeof value === 'number') {
    return value;
  }
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
