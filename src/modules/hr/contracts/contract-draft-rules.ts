import { BadRequestException } from '@nestjs/common';
import {
  ContractSection,
  EmploymentContract,
} from './entities/employment-contract.entity';
import {
  REF_KEYS,
  REF_TOKEN,
  readRefs,
  readStringMap,
} from './contract-live-values';

/**
 * Columns a live draft derives from HR records. The redesigned editor changes
 * them only through `field_overrides` (with a reason) or `refs`.
 */
export const LIVE_DERIVED_DTO_FIELDS = [
  'job_title',
  'work_location',
  'place_of_work',
  'hours_of_work',
  'probation_months',
  'salary_amount',
  'salary_currency',
  'pay_frequency',
  'remuneration',
  'remuneration_method',
  'employee_age',
  'permanent_address',
] as const;

const MIN_REASON = 3;

/** Keys that currently differ from HR data and therefore need a reason. */
export function activeOverrideKeys(particulars: Record<string, unknown>) {
  const overrides = Object.keys(readStringMap(particulars.field_overrides));
  const refs = Object.keys(readRefs(particulars)).map(
    (key) => REF_TOKEN[key as (typeof REF_KEYS)[number]],
  );
  return [...new Set([...overrides, ...refs])];
}

/**
 * Rules for live drafts (decisions D2/D3 and clause flags). Throws 400 with
 * `field_errors` so the editor can show each message next to its field.
 */
export function assertLiveDraftRules(input: {
  dto: Record<string, unknown>;
  particulars: Record<string, unknown>;
  previousSections: ContractSection[];
  nextSections: ContractSection[];
}) {
  const errors: Record<string, string> = {};
  for (const field of LIVE_DERIVED_DTO_FIELDS) {
    if (input.dto[field] !== undefined)
      errors[field] =
        'This value comes from HR records. Override it for this contract with a reason instead.';
  }

  const overrides = readStringMap(input.particulars.field_overrides);
  const reasons = readStringMap(input.particulars.override_reasons);
  for (const key of activeOverrideKeys(input.particulars)) {
    if ((reasons[key] ?? '').trim().length < MIN_REASON)
      errors[key] =
        'Give a reason for using a different value on this contract.';
  }
  if (
    overrides.salary !== undefined &&
    !/^\d{1,12}(\.\d{1,2})?$/.test(overrides.salary)
  )
    errors.salary = 'Enter the salary as a number, e.g. 1500000 or 1500000.50.';
  if (
    overrides.currency !== undefined &&
    !/^[A-Z]{3}$/.test(overrides.currency)
  )
    errors.currency = 'Use a three-letter currency code, e.g. TZS.';
  if (overrides.probation_months !== undefined) {
    const months = Number(overrides.probation_months);
    if (!Number.isInteger(months) || months < 0 || months > 24)
      errors.probation_months =
        'Enter the probation period as whole months between 0 and 24.';
  }

  Object.assign(
    errors,
    sectionRuleErrors(input.previousSections, input.nextSections),
  );

  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Some contract values need attention',
      field_errors: errors,
    });
}

/**
 * Template clause flags, for every draft: required clauses stay, locked
 * wording stays, only optional clauses can be switched off. Clauses without
 * flags (older templates and contracts) are unrestricted.
 */
export function sectionRuleErrors(
  previousSections: ContractSection[],
  nextSections: ContractSection[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const previous = new Map(previousSections.map((s) => [s.id, s]));
  const next = new Map(nextSections.map((s) => [s.id, s]));
  for (const [id, before] of previous) {
    const after = next.get(id);
    const label = before.heading || id;
    if (!after) {
      if (before.editable === false || before.optional === false)
        errors[`sections.${id}`] =
          `"${label}" is a required clause and cannot be removed.`;
      continue;
    }
    if (
      before.editable === false &&
      (after.heading !== before.heading || after.body !== before.body)
    )
      errors[`sections.${id}`] =
        `The template does not allow "${label}" to be changed.`;
    if (after.enabled === false && before.optional !== true)
      errors[`sections.${id}`] =
        `"${label}" is a required clause and cannot be switched off.`;
  }
  return errors;
}

export function assertSectionRules(
  previousSections: ContractSection[],
  nextSections: ContractSection[],
) {
  const errors = sectionRuleErrors(previousSections, nextSections);
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Some clauses cannot be changed this way',
      field_errors: errors,
    });
}

/**
 * Template flags belong to the template, not to the editor: carry them from
 * the stored clause so a client cannot unlock a clause by resending it.
 */
export function carrySectionFlags(
  previous: ContractSection[],
  incoming: ContractSection[],
): ContractSection[] {
  const byId = new Map(previous.map((section) => [section.id, section]));
  return incoming.map((section) => {
    const before = byId.get(section.id);
    const flags: Partial<ContractSection> = {};
    if (before?.optional !== undefined) flags.optional = before.optional;
    if (before?.editable !== undefined) flags.editable = before.editable;
    const result: ContractSection = {
      id: section.id,
      heading: section.heading,
      body: section.body,
      ...flags,
    };
    if (section.enabled === false) result.enabled = false;
    return result;
  });
}

/** Drops reasons for overrides that no longer exist. */
export function pruneOverrideReasons(
  particulars: Record<string, unknown>,
): Record<string, string> {
  const reasons = readStringMap(particulars.override_reasons);
  const active = new Set(activeOverrideKeys(particulars));
  return Object.fromEntries(
    Object.entries(reasons)
      .filter(([key]) => active.has(key))
      .map(([key, value]) => [key, value.trim().slice(0, 500)]),
  );
}

/**
 * Flat view of everything HR can change on a draft, for field-level audit
 * (old → new). Clause text is included so wording changes are traceable.
 */
export function draftAuditView(
  contract: EmploymentContract,
): Record<string, unknown> {
  const particulars = contract.particulars ?? {};
  const view: Record<string, unknown> = {
    title: contract.title,
    contract_type: contract.contractType,
    start_date: contract.startDate,
    end_date: contract.endDate,
    job_title: contract.jobTitle,
    department: contract.departmentName,
    reporting_manager: contract.reportingManagerName,
    work_location: contract.workLocation,
    probation_months: contract.probationMonths,
    hours_of_work: contract.hoursOfWork,
    salary_amount: contract.salaryAmount,
    salary_currency: contract.salaryCurrency,
    pay_frequency: contract.payFrequency,
    benefits: contract.benefits,
    assigned_signatory_id: contract.assignedSignatoryId,
    part_time: particulars.part_time === true,
  };
  for (const key of [
    'place_of_recruitment',
    'job_description',
    'remuneration_method',
    'permanent_address',
    'employee_age',
  ])
    view[key] = particulars[key] ?? null;
  for (const [key, value] of Object.entries(readRefs(particulars)))
    view[`ref.${key}`] = value;
  for (const [key, value] of Object.entries(
    readStringMap(particulars.field_overrides),
  ))
    view[`override.${key}`] = value;
  for (const [key, value] of Object.entries(
    readStringMap(particulars.override_reasons),
  ))
    view[`override_reason.${key}`] = value;
  for (const section of contract.sections ?? [])
    view[`clause.${section.id}`] = {
      heading: section.heading,
      body: section.body,
      enabled: section.enabled !== false,
    };
  return view;
}

/**
 * Live drafts: copies resolved values into the flat columns that lists,
 * renewals, reports and onboarding read, so they match the contract text.
 */
export function applyValuesToColumns(
  contract: EmploymentContract,
  values: Partial<Record<string, string>>,
) {
  const text = (value: string | undefined) => value?.trim() || null;
  contract.jobTitle = text(values.job_title);
  contract.departmentName = text(values.department);
  contract.reportingManagerName = text(values.reporting_manager);
  contract.workLocation = text(values.work_location);
  const months = Number(values.probation_months);
  contract.probationMonths =
    text(values.probation_months) && Number.isInteger(months) ? months : null;
  contract.hoursOfWork = text(values.hours_of_work);
  contract.salaryAmount =
    values.salary && /^\d+(\.\d+)?$/.test(values.salary) ? values.salary : null;
  contract.salaryCurrency =
    text(values.currency)?.slice(0, 3).toUpperCase() ?? null;
  contract.payFrequency = text(values.pay_frequency)?.toUpperCase() ?? null;
}
