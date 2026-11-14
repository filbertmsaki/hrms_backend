type Rule =
  | 'boolean'
  | 'nonnegative'
  | 'nonnegative_integer'
  | 'positive'
  | 'positive_integer'
  | 'rate'
  | 'date'
  | 'events'
  | 'tiers'
  | 'warning_days'
  | 'code'
  | readonly string[]
  | { readonly [key: string]: Rule };

// This describes the draft document's shape. Values such as entitlements and
// thresholds remain data supplied by HR, rather than constants in the engine.
const schema: Record<string, Rule> = {
  jurisdiction: ['mainland_tanzania'],
  proposed_effective_date: 'date',
  annual: {
    entitlement_days: 'nonnegative',
    cycle_length_months: 'positive_integer',
    cycle_anchor: ['current_hire_date'],
    count_basis: ['calendar_days', 'working_days'],
    include_public_holidays: 'boolean',
    accrual_method: ['daily', 'monthly'],
    carry_over_expiry_months: 'nonnegative_integer',
    approved_extension_months: 'nonnegative_integer',
    expiry_action: ['flag', 'forfeit'],
    consumption_order: ['oldest_first'],
    advance_leave_enabled: 'boolean',
    advance_leave_requires_hr_approval: 'boolean',
    cash_out_while_employed: 'boolean',
    occasional_leave_deducts_annual: 'boolean',
  },
  sick: {
    entitlement_days: 'nonnegative',
    cycle_length_months: 'positive_integer',
    count_basis: ['calendar_days', 'working_days'],
    pay_tiers: 'tiers',
    beyond_tiers_pay_rate: 'rate',
    beyond_tiers_incapacity_flag: 'boolean',
    medical_certificate_required: 'boolean',
    hr_override_requires_reason: 'boolean',
    exclude_workers_compensation_days: 'boolean',
  },
  maternity: {
    count_basis: ['calendar_days', 'working_days'],
    single_birth_days: 'nonnegative',
    multiple_birth_days: 'nonnegative',
    child_death_extra_days: 'nonnegative',
    child_death_window_months: 'nonnegative_integer',
    maximum_paid_terms: 'nonnegative_integer',
    notice_months: 'nonnegative_integer',
    earliest_start_weeks_before_expected_birth: 'nonnegative_integer',
    early_start_requires_certificate: 'boolean',
    return_restriction_weeks_after_birth: 'nonnegative_integer',
    return_requires_fitness_certificate: 'boolean',
    override_requires_certificate_and_reason: 'boolean',
    record_nssf_reference: 'boolean',
  },
  paternity: {
    count_basis: ['calendar_days', 'working_days'],
    entitlement_days: 'nonnegative',
    start_window_days_after_birth: 'nonnegative_integer',
    company_benefit_enabled: 'boolean',
    company_benefit_days: 'nonnegative',
    company_benefit_start_window_days: 'nonnegative_integer',
  },
  compassionate: {
    entitlement_days: 'nonnegative',
    cycle_basis: ['annual'],
    count_basis: ['calendar_days', 'working_days'],
    retroactive_return_window_working_days: 'nonnegative_integer',
    events: 'events',
  },
  unpaid: {
    count_basis: ['calendar_days', 'working_days'],
    maximum_days_per_12_months: 'nonnegative',
    approval_required: 'boolean',
    pause_annual_accrual: 'boolean',
    pause_for_blocks_longer_than_calendar_days: 'nonnegative_integer',
    pause_whole_block: 'boolean',
  },
  early_service: {
    months: 'nonnegative_integer',
    annual_days_per_completed_month: 'nonnegative',
    sick_paid_days_per_employment_spell: 'nonnegative',
    true_up_to_first_cycle_accrual: 'boolean',
    rehire_exception_changes_cycle_anchor: 'boolean',
    rehire_lookback_months: 'nonnegative_integer',
  },
  part_time: { prorate_by_fte: 'boolean' },
  termination: {
    annual_payout_enabled: 'boolean',
    monthly_wage_divisor: 'positive',
    excess_recovery_status: ['draft'],
  },
  public_holiday_work: {
    pay_multiplier: 'nonnegative',
    fallback_monthly_hours: 'positive',
  },
  unauthorized_absence: {
    pay_rate: 'rate',
    flag_after_consecutive_working_days: 'nonnegative_integer',
  },
  carry_over_warning_days: 'warning_days',
  /** Maps each Mainland rule family to the company's leave type code. */
  leave_type_codes: {
    annual: 'code',
    occasional: 'code',
    sick: 'code',
    maternity: 'code',
    paternity: 'code',
    compassionate: 'code',
    unpaid: 'code',
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateMainlandPolicyDraft(
  rules: unknown,
  proposedEffectiveDate?: string,
): string[] {
  const errors: string[] = [];
  function check(value: unknown, rule: Rule, path: string): void {
    if (Array.isArray(rule)) {
      if (typeof value !== 'string' || !rule.includes(value))
        errors.push(`${path}: invalid option`);
      return;
    }
    if (typeof rule === 'object') {
      if (!isObject(value)) {
        errors.push(`${path}: expected object`);
        return;
      }
      for (const [key, child] of Object.entries(rule as Record<string, Rule>))
        check(value[key], child, path ? `${path}.${key}` : key);
      for (const key of Object.keys(value))
        if (!Object.hasOwn(rule, key))
          errors.push(`${path ? `${path}.` : ''}${key}: unknown field`);
      return;
    }
    if (rule === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
      return;
    }
    if (rule === 'date') {
      const parsed =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(`${value}T00:00:00.000Z`)
          : new Date(NaN);
      if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== value
      )
        errors.push(`${path}: expected valid ISO date`);
      return;
    }
    if (rule === 'events') {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some(
          (item: unknown) => typeof item !== 'string' || !item.trim(),
        ) ||
        new Set(value).size !== value.length
      )
        errors.push(`${path}: expected unique nonempty event codes`);
      return;
    }
    if (rule === 'code') {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(value))
        errors.push(`${path}: expected leave type code`);
      return;
    }
    if (rule === 'warning_days') {
      if (
        !Array.isArray(value) ||
        value.some(
          (item: unknown) =>
            typeof item !== 'number' || !Number.isInteger(item) || item < 0,
        ) ||
        new Set(value).size !== value.length
      )
        errors.push(`${path}: expected unique nonnegative whole days`);
      return;
    }
    if (rule === 'tiers') {
      if (!Array.isArray(value) || value.length === 0) {
        errors.push(`${path}: expected pay tiers`);
        return;
      }
      let last = 0;
      for (const [index, tier] of value.entries()) {
        if (
          !isObject(tier) ||
          Object.keys(tier).some(
            (key) => key !== 'through_days' && key !== 'pay_rate',
          ) ||
          typeof tier.through_days !== 'number' ||
          !Number.isFinite(tier.through_days) ||
          tier.through_days <= last ||
          typeof tier.pay_rate !== 'number' ||
          !Number.isFinite(tier.pay_rate) ||
          tier.pay_rate < 0 ||
          tier.pay_rate > 1
        ) {
          errors.push(`${path}[${index}]: invalid tier or cumulative limit`);
          continue;
        }
        last = tier.through_days;
      }
      return;
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      ((rule === 'positive' || rule === 'positive_integer') && value === 0) ||
      ((rule === 'positive_integer' || rule === 'nonnegative_integer') &&
        !Number.isInteger(value)) ||
      (rule === 'rate' && value > 1)
    )
      errors.push(`${path}: invalid number`);
  }
  check(rules, schema, '');
  if (
    isObject(rules) &&
    proposedEffectiveDate &&
    rules.proposed_effective_date !== proposedEffectiveDate
  )
    errors.push('proposed_effective_date: does not match revision date');
  if (errors.length === 0 && isObject(rules))
    errors.push(...crossFieldErrors(rules as unknown as DraftShape));
  return errors;
}

type DraftShape = {
  annual: {
    approved_extension_months: number;
    carry_over_expiry_months: number;
    cycle_length_months: number;
    include_public_holidays: boolean;
    count_basis: string;
  };
  sick: { entitlement_days: number; pay_tiers: { through_days: number }[] };
  maternity: { multiple_birth_days: number; single_birth_days: number };
  paternity: { company_benefit_days: number; entitlement_days: number };
  early_service: { months: number };
  leave_type_codes: Record<string, string>;
};

/** Cross-field consistency once the shape is valid. */
function crossFieldErrors(r: DraftShape): string[] {
  const e: string[] = [];
  const tiers = r.sick.pay_tiers;
  if (tiers[tiers.length - 1].through_days !== r.sick.entitlement_days)
    e.push('sick.pay_tiers: last tier must end at sick.entitlement_days');
  if (r.maternity.multiple_birth_days < r.maternity.single_birth_days)
    e.push('maternity.multiple_birth_days: must be at least single_birth_days');
  if (r.annual.approved_extension_months < r.annual.carry_over_expiry_months)
    e.push(
      'annual.approved_extension_months: must be at least carry_over_expiry_months',
    );
  if (r.early_service.months >= r.annual.cycle_length_months)
    e.push('early_service.months: must be shorter than the annual cycle');
  if (r.paternity.company_benefit_days < r.paternity.entitlement_days)
    e.push(
      'paternity.company_benefit_days: must be at least the statutory entitlement',
    );
  const { occasional, ...distinct } = r.leave_type_codes;
  const codes = Object.values(distinct);
  if (new Set(codes).size !== codes.length)
    e.push('leave_type_codes: each rule family needs a distinct leave type');
  if (
    occasional &&
    Object.values(distinct).includes(occasional) &&
    occasional !== r.leave_type_codes.annual
  )
    e.push('leave_type_codes.occasional: may only share the annual leave type');
  if (
    r.annual.include_public_holidays !==
    (r.annual.count_basis === 'calendar_days')
  )
    e.push('annual.include_public_holidays: must agree with count_basis');
  return e;
}
