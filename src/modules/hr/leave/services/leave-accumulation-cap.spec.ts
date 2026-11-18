import { BadRequestException } from '@nestjs/common';
import { assertWithinAccumulationCap } from './leave-balance-ledger.service';

describe('assertWithinAccumulationCap', () => {
  const cap = { maximumDays: 30, policyReference: 'leave_policy:1' };

  it('ignores debits and missing caps', () => {
    expect(assertWithinAccumulationCap(29, -5, cap)).toBeNull();
    expect(assertWithinAccumulationCap(29, 5, undefined)).toBeNull();
    expect(
      assertWithinAccumulationCap(29, 5, { maximumDays: null }),
    ).toBeNull();
  });

  it('records capacity for a credit within the cap', () => {
    expect(assertWithinAccumulationCap(20, 10, cap)).toMatchObject({
      exceeded: false,
      capacity_days: 10,
      requested_credit_days: 10,
      policy_reference: 'leave_policy:1',
    });
  });

  it('refuses a credit above the cap and states the capacity', () => {
    expect(() => assertWithinAccumulationCap(25, 10, cap)).toThrow(
      BadRequestException,
    );
    expect(() => assertWithinAccumulationCap(25, 10, cap)).toThrow(
      /At most 5\.00 day/,
    );
  });

  it('requires a real reason for an override', () => {
    expect(() =>
      assertWithinAccumulationCap(25, 10, {
        ...cap,
        override: { reason: ' ' },
      }),
    ).toThrow(/override reason/);
  });

  it('allows an override and records the excess', () => {
    expect(
      assertWithinAccumulationCap(25, 10, {
        ...cap,
        override: { reason: 'Board-approved exception' },
      }),
    ).toMatchObject({
      exceeded: true,
      excess_days: 5,
      override_reason: 'Board-approved exception',
    });
  });
});
