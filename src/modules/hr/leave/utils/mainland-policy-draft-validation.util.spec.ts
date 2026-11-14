import { readFileSync } from 'fs';
import { join } from 'path';
import { validateMainlandPolicyDraft } from './mainland-policy-draft-validation.util';

describe('Mainland policy draft validation', () => {
  const load = (): Record<string, unknown> =>
    JSON.parse(
      readFileSync(
        join(__dirname, '../config/mainland-policy-2027.draft.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;

  it('accepts the supplied draft and detects mismatched effective dates', () => {
    const draft = load();
    expect(validateMainlandPolicyDraft(draft, '2027-01-01')).toEqual([]);
    expect(validateMainlandPolicyDraft(draft, '2027-02-01')).toContain(
      'proposed_effective_date: does not match revision date',
    );
  });

  it('reports missing and unknown fields without treating them as valid configuration', () => {
    const draft = load();
    draft.annual = { entitlement_days: 28, typo: true };
    const errors = validateMainlandPolicyDraft(draft);
    expect(errors).toContain('annual.cycle_length_months: invalid number');
    expect(errors).toContain('annual.typo: unknown field');
  });

  it('rejects invalid tier ordering, rates, dates and numeric thresholds', () => {
    const draft = load();
    const sick = draft.sick as Record<string, unknown>;
    sick.pay_tiers = [
      { through_days: 63, pay_rate: 1 },
      { through_days: 62, pay_rate: 0.5 },
    ];
    sick.beyond_tiers_pay_rate = 1.1;
    draft.proposed_effective_date = '2027-02-30';
    (draft.termination as Record<string, unknown>).monthly_wage_divisor = 0;
    expect(validateMainlandPolicyDraft(draft)).toEqual(
      expect.arrayContaining([
        'sick.pay_tiers[1]: invalid tier or cumulative limit',
        'sick.beyond_tiers_pay_rate: invalid number',
        'proposed_effective_date: expected valid ISO date',
        'termination.monthly_wage_divisor: invalid number',
      ]),
    );
  });
});
