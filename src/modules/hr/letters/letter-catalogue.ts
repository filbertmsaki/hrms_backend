/**
 * Letter types, their extra (typed) fields and the placeholder catalogue.
 * Pure data + pure helpers so they can be unit tested without Nest.
 */
export enum LetterTypeEnum {
  OFFER = 'OFFER',
  APPOINTMENT = 'APPOINTMENT',
  CONFIRMATION = 'CONFIRMATION',
  PROBATION_EXTENSION = 'PROBATION_EXTENSION',
  PROBATION_NOT_CONFIRMED = 'PROBATION_NOT_CONFIRMED',
  PROMOTION = 'PROMOTION',
  SALARY_INCREMENT = 'SALARY_INCREMENT',
  TRANSFER = 'TRANSFER',
  EMPLOYMENT_VERIFICATION = 'EMPLOYMENT_VERIFICATION',
  CONTRACT_RENEWAL = 'CONTRACT_RENEWAL',
  ACTING_APPOINTMENT = 'ACTING_APPOINTMENT',
  WARNING = 'WARNING',
  TERMINATION = 'TERMINATION',
  CERTIFICATE_OF_SERVICE = 'CERTIFICATE_OF_SERVICE',
  CUSTOM = 'CUSTOM',
}

export enum LetterStatusEnum {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum LetterEventActionEnum {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ISSUED = 'ISSUED',
  EMAILED = 'EMAILED',
  CANCELLED = 'CANCELLED',
  REVISED = 'REVISED',
  SUPERSEDED = 'SUPERSEDED',
  DOWNLOADED = 'DOWNLOADED',
  VERIFICATION_REVOKED = 'VERIFICATION_REVOKED',
}

export const LETTER_TYPE_LABELS: Record<LetterTypeEnum, string> = {
  OFFER: 'Employment offer letter',
  APPOINTMENT: 'Appointment letter',
  CONFIRMATION: 'Employment confirmation letter',
  PROBATION_EXTENSION: 'Probation extension letter',
  PROBATION_NOT_CONFIRMED: 'Probation outcome letter (not confirmed)',
  PROMOTION: 'Promotion letter',
  SALARY_INCREMENT: 'Salary increment letter',
  TRANSFER: 'Employee transfer letter',
  EMPLOYMENT_VERIFICATION: 'Employment verification letter',
  CONTRACT_RENEWAL: 'Contract renewal letter',
  ACTING_APPOINTMENT: 'Acting appointment letter',
  WARNING: 'Warning letter',
  TERMINATION: 'Termination letter',
  CERTIFICATE_OF_SERVICE: 'Certificate of service',
  CUSTOM: 'Custom letter',
};

export const APPROVAL_DEFAULT_TYPES: ReadonlySet<LetterTypeEnum> = new Set([
  LetterTypeEnum.OFFER,
  LetterTypeEnum.TERMINATION,
  LetterTypeEnum.WARNING,
  LetterTypeEnum.SALARY_INCREMENT,
  LetterTypeEnum.PROMOTION,
  LetterTypeEnum.PROBATION_NOT_CONFIRMED,
]);

export type ExtraFieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'money'
  | 'number'
  | 'select';

export type ExtraFieldDef = {
  key: string;
  label: string;
  kind: ExtraFieldKind;
  required: boolean;
  options?: string[];
};

/** Every letter extra key and its input kind (labels for the catalogue). */
const EXTRA: Record<string, Omit<ExtraFieldDef, 'required'>> = {
  offer_start_date: {
    key: 'offer_start_date',
    label: 'Proposed start date',
    kind: 'date',
  },
  offer_salary: { key: 'offer_salary', label: 'Offered salary', kind: 'money' },
  offer_expiry_date: {
    key: 'offer_expiry_date',
    label: 'Offer valid until',
    kind: 'date',
  },
  effective_date: {
    key: 'effective_date',
    label: 'Effective date',
    kind: 'date',
  },
  new_position: { key: 'new_position', label: 'New position', kind: 'text' },
  new_department: {
    key: 'new_department',
    label: 'New department',
    kind: 'text',
  },
  new_branch: {
    key: 'new_branch',
    label: 'New branch / duty station',
    kind: 'text',
  },
  previous_salary: {
    key: 'previous_salary',
    label: 'Previous salary',
    kind: 'money',
  },
  new_salary: { key: 'new_salary', label: 'New salary', kind: 'money' },
  increment_percentage: {
    key: 'increment_percentage',
    label: 'Increment (%)',
    kind: 'number',
  },
  extension_end_date: {
    key: 'extension_end_date',
    label: 'Extended probation end date',
    kind: 'date',
  },
  extension_reason: {
    key: 'extension_reason',
    label: 'Reason for extension',
    kind: 'textarea',
  },
  acting_position: {
    key: 'acting_position',
    label: 'Acting position',
    kind: 'text',
  },
  acting_start_date: {
    key: 'acting_start_date',
    label: 'Acting start date',
    kind: 'date',
  },
  acting_end_date: {
    key: 'acting_end_date',
    label: 'Acting end date',
    kind: 'date',
  },
  renewal_start_date: {
    key: 'renewal_start_date',
    label: 'Renewal start date',
    kind: 'date',
  },
  renewal_end_date: {
    key: 'renewal_end_date',
    label: 'Renewal end date',
    kind: 'date',
  },
  warning_reason: {
    key: 'warning_reason',
    label: 'Reason for warning',
    kind: 'textarea',
  },
  warning_level: {
    key: 'warning_level',
    label: 'Warning level',
    kind: 'select',
    options: [
      'First written warning',
      'Second written warning',
      'Final written warning',
    ],
  },
  incident_date: {
    key: 'incident_date',
    label: 'Date of incident',
    kind: 'date',
  },
  termination_date: {
    key: 'termination_date',
    label: 'Termination date',
    kind: 'date',
  },
  last_working_day: {
    key: 'last_working_day',
    label: 'Last working day',
    kind: 'date',
  },
  termination_reason: {
    key: 'termination_reason',
    label: 'Reason for termination',
    kind: 'textarea',
  },
  notice_period: { key: 'notice_period', label: 'Notice period', kind: 'text' },
  verification_purpose: {
    key: 'verification_purpose',
    label: 'Purpose of the letter',
    kind: 'text',
  },
  addressee: { key: 'addressee', label: 'Addressed to', kind: 'text' },
  custom_note: {
    key: 'custom_note',
    label: 'Additional note',
    kind: 'textarea',
  },
};

export const EXTRA_FIELD_KEYS = Object.keys(EXTRA);

function fields(spec: Array<[string, boolean]>): ExtraFieldDef[] {
  return spec.map(([key, required]) => ({ ...EXTRA[key], required }));
}

export const LETTER_EXTRA_FIELDS: Record<LetterTypeEnum, ExtraFieldDef[]> = {
  OFFER: fields([
    ['offer_start_date', true],
    ['offer_salary', true],
    ['offer_expiry_date', true],
  ]),
  APPOINTMENT: fields([['effective_date', true]]),
  CONFIRMATION: fields([['effective_date', true]]),
  PROBATION_EXTENSION: fields([
    ['extension_end_date', true],
    ['extension_reason', true],
  ]),
  PROBATION_NOT_CONFIRMED: fields([
    ['effective_date', true],
    ['last_working_day', true],
    ['custom_note', false],
  ]),
  PROMOTION: fields([
    ['new_position', true],
    ['effective_date', true],
    ['new_department', false],
    ['new_salary', false],
  ]),
  SALARY_INCREMENT: fields([
    ['previous_salary', true],
    ['new_salary', true],
    ['effective_date', true],
    ['increment_percentage', false],
  ]),
  TRANSFER: fields([
    ['new_branch', true],
    ['effective_date', true],
    ['new_department', false],
    ['new_position', false],
  ]),
  EMPLOYMENT_VERIFICATION: fields([
    ['verification_purpose', true],
    ['addressee', false],
  ]),
  CONTRACT_RENEWAL: fields([
    ['renewal_start_date', true],
    ['renewal_end_date', true],
  ]),
  ACTING_APPOINTMENT: fields([
    ['acting_position', true],
    ['acting_start_date', true],
    ['acting_end_date', false],
  ]),
  WARNING: fields([
    ['warning_level', true],
    ['incident_date', true],
    ['warning_reason', true],
  ]),
  TERMINATION: fields([
    ['termination_date', true],
    ['last_working_day', true],
    ['termination_reason', true],
    ['notice_period', false],
  ]),
  CERTIFICATE_OF_SERVICE: fields([['last_working_day', true]]),
  CUSTOM: fields([
    ['addressee', false],
    ['custom_note', false],
  ]),
};

export type PlaceholderGroup =
  | 'Employee'
  | 'Employment'
  | 'Salary'
  | 'Company'
  | 'Contract'
  | 'Dates'
  | 'Signatory'
  | 'Letter details';

export type PlaceholderDef = {
  key: string;
  label: string;
  group: PlaceholderGroup;
  confidential: boolean;
};

const p = (
  key: string,
  label: string,
  group: PlaceholderGroup,
  confidential = false,
): PlaceholderDef => ({ key, label, group, confidential });

const CONFIDENTIAL_EXTRAS = new Set([
  'offer_salary',
  'previous_salary',
  'new_salary',
  'increment_percentage',
]);

export const PLACEHOLDERS: PlaceholderDef[] = [
  p('employee_name', 'Full name', 'Employee'),
  p('employee_first_name', 'First name', 'Employee'),
  p('employee_title', 'Title (Mr/Ms)', 'Employee'),
  p('employee_number', 'Employee number', 'Employee'),
  p('employee_email', 'Email', 'Employee'),
  p('employee_phone', 'Phone', 'Employee'),
  p('employee_address', 'Address', 'Employee'),
  p('national_id', 'National ID', 'Employee', true),
  p('gender', 'Gender', 'Employee'),
  p('position', 'Position', 'Employment'),
  p('department', 'Department', 'Employment'),
  p('branch', 'Branch', 'Employment'),
  p('hire_date', 'Hire date', 'Employment'),
  p('employment_type', 'Employment type', 'Employment'),
  p('grade', 'Grade', 'Employment'),
  p('manager_name', 'Reporting manager', 'Employment'),
  p('probation_start_date', 'Probation start date', 'Employment'),
  p('probation_end_date', 'Probation end date', 'Employment'),
  p('confirmation_date', 'Confirmation date', 'Employment'),
  p('years_of_service', 'Years of service', 'Employment'),
  p('salary', 'Basic salary', 'Salary', true),
  p('currency', 'Currency', 'Salary', true),
  p('pay_frequency', 'Pay frequency', 'Salary', true),
  p('salary_in_words', 'Salary in words', 'Salary', true),
  p('company_name', 'Company name', 'Company'),
  p('company_address', 'Company address', 'Company'),
  p('company_phone', 'Company phone', 'Company'),
  p('company_email', 'Company email', 'Company'),
  p('company_website', 'Company website', 'Company'),
  p('contract_type', 'Contract type', 'Contract'),
  p('contract_start_date', 'Contract start date', 'Contract'),
  p('contract_end_date', 'Contract end date', 'Contract'),
  p('issue_date', 'Letter date', 'Dates'),
  p('today', 'Today', 'Dates'),
  p('signatory_name', 'Signatory name', 'Signatory'),
  p('signatory_title', 'Signatory designation', 'Signatory'),
  ...EXTRA_FIELD_KEYS.map((key) =>
    p(key, EXTRA[key].label, 'Letter details', CONFIDENTIAL_EXTRAS.has(key)),
  ),
];

export const PLACEHOLDER_KEYS: ReadonlySet<string> = new Set(
  PLACEHOLDERS.map((item) => item.key),
);
export const CONFIDENTIAL_KEYS: ReadonlySet<string> = new Set(
  PLACEHOLDERS.filter((item) => item.confidential).map((item) => item.key),
);

export function letterTypeLabel(type: string): string {
  return LETTER_TYPE_LABELS[type as LetterTypeEnum] ?? type;
}

export function isLetterType(value: unknown): value is LetterTypeEnum {
  return (
    typeof value === 'string' &&
    (Object.values(LetterTypeEnum) as string[]).includes(value)
  );
}

export function extraFieldDef(
  key: string,
): Omit<ExtraFieldDef, 'required'> | null {
  return EXTRA[key] ?? null;
}

export function buildCatalogue() {
  return {
    letter_types: Object.values(LetterTypeEnum).map((type) => ({
      type,
      label: LETTER_TYPE_LABELS[type],
      recipient:
        type === LetterTypeEnum.OFFER ? 'candidate_or_employee' : 'employee',
      default_requires_approval: APPROVAL_DEFAULT_TYPES.has(type),
      extra_fields: LETTER_EXTRA_FIELDS[type],
    })),
    placeholders: PLACEHOLDERS,
  };
}

/* ------------------------------------------------------------------ */
/* Template text helpers                                               */
/* ------------------------------------------------------------------ */

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Distinct placeholder keys used in the given texts, in order of appearance. */
export function extractPlaceholders(
  ...texts: Array<string | null | undefined>
): string[] {
  const keys = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(TOKEN)) keys.add(match[1].trim());
  }
  return [...keys];
}

export function unknownPlaceholders(
  ...texts: Array<string | null | undefined>
): string[] {
  return extractPlaceholders(...texts).filter(
    (key) => !PLACEHOLDER_KEYS.has(key),
  );
}

/**
 * Keys that block submit/issue: used placeholders that resolve to an empty
 * value, plus required extra fields of the letter type left blank.
 */
export function missingPlaceholders(
  texts: Array<string | null | undefined>,
  values: Record<string, string | null | undefined>,
  letterType?: string,
): string[] {
  const missing = new Set<string>();
  for (const key of extractPlaceholders(...texts)) {
    if (!String(values[key] ?? '').trim()) missing.add(key);
  }
  const defs = letterType
    ? LETTER_EXTRA_FIELDS[letterType as LetterTypeEnum]
    : undefined;
  for (const def of defs ?? []) {
    if (def.required && !String(values[def.key] ?? '').trim())
      missing.add(def.key);
  }
  return [...missing];
}

/**
 * Substitutes `{{key}}` with values. Unresolved keys become `[[key]]` (draft
 * preview) — callers block submit/issue with `missingPlaceholders` first.
 */
export function renderPlaceholders(
  text: string | null | undefined,
  values: Record<string, string | null | undefined>,
): string {
  if (!text) return '';
  return text.replace(TOKEN, (_match, raw: string) => {
    const key = raw.trim();
    const value = String(values[key] ?? '').trim();
    return value ? value : `[[${key}]]`;
  });
}
