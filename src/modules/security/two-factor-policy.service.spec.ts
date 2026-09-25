import { TwoFactorPolicyService } from './two-factor-policy.service';

describe('TwoFactorPolicyService', () => {
  const policy = new TwoFactorPolicyService({ get: () => undefined } as never);

  it('requires 2FA for HR and payroll users', () => {
    expect(policy.isRequired(['HR_OFFICER'])).toBe(true);
    expect(policy.isRequired([], ['payroll:profiles'])).toBe(true);
    expect(policy.isRequired(['EMPLOYEE'], ['onboarding_tasks:complete'])).toBe(false);
  });

  it('disallows disabling 2FA when mandatory', () => {
    expect(() => policy.assertCanDisable(true)).toThrow();
  });
});
