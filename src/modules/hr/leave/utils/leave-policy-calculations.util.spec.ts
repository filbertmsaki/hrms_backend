import {
  allocateOldestCredits,
  splitPayTiers,
} from './leave-policy-calculations.util';

describe('leave policy calculations', () => {
  it('splits a sick request across full, half and unpaid tiers', () => {
    const tiers = [
      { throughDays: 63, payRate: 1 },
      { throughDays: 126, payRate: 0.5 },
    ];
    expect(splitPayTiers(0, 70, tiers)).toEqual([
      { days: 63, payRate: 1 },
      { days: 7, payRate: 0.5 },
    ]);
    expect(splitPayTiers(125.5, 2, tiers)).toEqual([
      { days: 0.5, payRate: 0.5 },
      { days: 1.5, payRate: 0 },
    ]);
    expect(() =>
      splitPayTiers(0, 1, [
        { throughDays: 5, payRate: 1 },
        { throughDays: 5, payRate: 0.5 },
      ]),
    ).toThrow();
  });

  it('consumes carry-over before newer accrual and reports shortfalls', () => {
    const credits = [
      { id: 'current', earnedDate: '2026-03-15', availableDays: 3 },
      { id: 'carry', earnedDate: '2025-03-15', availableDays: 10 },
    ];
    expect(allocateOldestCredits(credits, 11.5)).toEqual({
      allocations: [
        { id: 'carry', days: 10 },
        { id: 'current', days: 1.5 },
      ],
      unallocatedDays: 0,
    });
    expect(allocateOldestCredits(credits, 15).unallocatedDays).toBe(2);
    expect(credits[0].availableDays).toBe(3);
  });
});
