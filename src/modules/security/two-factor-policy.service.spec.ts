import { TwoFactorPolicyService } from './two-factor-policy.service';

describe('TwoFactorPolicyService', () => {
  const policy = new TwoFactorPolicyService({ get: () => undefined } as never);

  it('recommends 2FA for HR and payroll users', () => {
    expect(policy.isRecommended(['HR_OFFICER'])).toBe(true);
    expect(policy.isRecommended([], ['payroll:profiles'])).toBe(true);
    expect(
      policy.isRecommended(['EMPLOYEE'], ['onboarding_tasks:complete']),
    ).toBe(false);
  });

  it('does not require 2FA for any role or permission', () => {
    expect(policy.isRequired(['HR_OFFICER'])).toBe(false);
    expect(policy.isRequired([], ['payroll:profiles'])).toBe(false);
  });

  it('allows disabling 2FA when previously marked mandatory', () => {
    expect(() => policy.assertCanDisable(true)).not.toThrow();
  });
});
