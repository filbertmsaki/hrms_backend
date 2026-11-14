import * as draft from '../config/mainland-policy-2027.draft.json';
import {
  annualAccrued,
  Bucket,
  carryOverExpiry,
  consumeOldestFirst,
  countDays,
  DayCalendar,
  detectCycle,
  earlyServiceTrueUp,
  EmployeeLeaveContext,
  expiryWarningsDue,
  holidayWorkPay,
  MainlandPolicy,
  processExpiry,
  returnToWorkAllowed,
  sickEarlyServiceCap,
  splitSickTiers,
  terminationSettlement,
  unauthorizedAbsenceRuns,
  validateAnnualBooking,
  validateCompassionate,
  validateMaternity,
  validatePaternity,
  validateUnpaid,
} from './mainland-leave-engine';

const policy = JSON.parse(JSON.stringify(draft)) as unknown as MainlandPolicy;
const emp = (o: Partial<EmployeeLeaveContext> = {}): EmployeeLeaveContext => ({
  hireDate: '2025-03-15',
  fte: 1,
  ...o,
});
const holidays = new Set(['2026-12-09', '2026-12-25', '2026-12-26']);
const cal: DayCalendar = {
  isRestDay: (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()),
  isPublicHoliday: (d) => holidays.has(d),
};

describe('Mainland leave engine — required scenarios', () => {
  it('1. 2025-09-15 accrual = 184 × 28/365 ≈ 14.12', () => {
    const r = annualAccrued(policy, emp(), '2025-09-15');
    expect(r.basis).toBe('daily');
    expect(r.accrued).toBeCloseTo((184 * 28) / 365, 4);
    expect(Math.round(r.accrued * 100) / 100).toBe(14.12);
  });

  it('2. cycle one ends 2026-03-14, cycle two begins 2026-03-15', () => {
    expect(detectCycle(policy, emp(), 'annual', '2026-03-14')).toMatchObject({
      cycleNumber: 1,
      endDate: '2026-03-14',
    });
    expect(detectCycle(policy, emp(), 'annual', '2026-03-15')).toMatchObject({
      cycleNumber: 2,
      startDate: '2026-03-15',
    });
    expect(annualAccrued(policy, emp(), '2026-03-15').accrued).toBe(0);
  });

  it('3. ten days carry over, expire 2026-09-14 inclusive, consumed first', () => {
    const expiry = carryOverExpiry(policy, '2026-03-15');
    expect(expiry).toBe('2026-09-14');
    const buckets: Bucket[] = [
      { sourceCycle: 2, remaining: 5, expiresOn: null, status: 'active' },
      { sourceCycle: 1, remaining: 10, expiresOn: expiry, status: 'active' },
    ];
    const r = consumeOldestFirst(policy, buckets, 3, '2026-04-10');
    expect(r.draws).toEqual([{ sourceCycle: 1, days: 3 }]);
    // Flag (default) never silently forfeits.
    const after = processExpiry(policy, buckets, '2026-09-15');
    expect(processExpiry(policy, buckets, '2026-09-14')[1].status).toBe(
      'active',
    );
    expect(after[1].status).toBe('flagged');
    expect(
      consumeOldestFirst(policy, after, 2, '2026-10-01').draws[0].sourceCycle,
    ).toBe(1);
    const forfeited = after.map((b) =>
      b.sourceCycle === 1 ? { ...b, status: 'forfeited' as const } : b,
    );
    expect(
      consumeOldestFirst(policy, forfeited, 2, '2026-10-01').draws[0]
        .sourceCycle,
    ).toBe(2);
    expect(
      expiryWarningsDue(policy, buckets, '2026-07-16').map((w) => w.daysBefore),
    ).toEqual([60]);
  });

  it('4. seventy sick days → 63 full + 7 half', () => {
    expect(splitSickTiers(policy, 0, 70).segments).toEqual([
      { payRate: 1, days: 63 },
      { payRate: 0.5, days: 7 },
    ]);
    const beyond = splitSickTiers(policy, 120, 10);
    expect(beyond.segments).toEqual([
      { payRate: 0.5, days: 6 },
      { payRate: 0, days: 4 },
    ]);
    expect(beyond.incapacityFlag).toBe(true);
  });

  it('5. annual 1–28 Dec counts 28 calendar days despite holidays', () => {
    expect(
      countDays('2026-12-01', '2026-12-28', 'calendar_days', cal).units,
    ).toBe(28);
    expect(
      countDays('2026-12-01', '2026-12-28', 'working_days', cal).excluded.some(
        (e) => e.reason === 'public_holiday',
      ),
    ).toBe(true);
  });

  it('6. twins → 100 days; fifth paid term blocked', () => {
    const base = {
      start: '2027-05-01',
      expectedBirthDate: '2027-05-10',
      submittedOn: '2027-01-01',
      nssfReference: 'N1',
    };
    expect(
      validateMaternity(policy, {
        ...base,
        multipleBirth: true,
        paidTermsUsedAllSpells: 0,
      }).entitlementDays,
    ).toBe(100);
    const fifth = validateMaternity(policy, {
      ...base,
      multipleBirth: false,
      paidTermsUsedAllSpells: 4,
    });
    expect(fifth.paid).toBe(false);
    expect(fifth.findings.map((f) => f.code)).toContain('MATERNITY_TERM_LIMIT');
  });

  it('7. paternity starting 8 days after birth is blocked', () => {
    expect(
      validatePaternity(policy, {
        birthDate: '2027-02-01',
        start: '2027-02-09',
      }).findings[0].code,
    ).toBe('PATERNITY_START_WINDOW');
    expect(
      validatePaternity(policy, {
        birthDate: '2027-02-01',
        start: '2027-02-08',
      }).findings,
    ).toEqual([]);
  });

  it('8. four months of service → company benefit 6 days; sick capped at 7', () => {
    const r = annualAccrued(policy, emp(), '2025-07-15');
    expect(r).toMatchObject({ basis: 'early_service', accrued: 6 });
    expect(sickEarlyServiceCap(policy, emp(), '2025-07-15')).toBe(7);
    const rehire = emp({
      previousEmploymentPeriods: [
        { start_date: '2020-01-01', end_date: '2025-01-31' },
      ],
    });
    expect(sickEarlyServiceCap(policy, rehire, '2025-07-15')).toBeNull();
    // Rehire exception does not move the cycle anchor.
    expect(detectCycle(policy, rehire, 'annual', '2025-07-15')?.startDate).toBe(
      '2025-03-15',
    );
    const trueUp = earlyServiceTrueUp(policy, emp(), 9);
    expect(trueUp.date).toBe('2025-09-15');
    expect(trueUp.amount).toBeCloseTo((184 * 28) / 365 - 9, 4);
  });

  it('9. termination pays accrued untaken annual days at basic/26', () => {
    const r = terminationSettlement(policy, {
      accruedUntaken: 10,
      eligibleCarryOver: 3,
      monthlyBasicWage: 2_600_000,
    });
    expect(r.payoutAmount).toBe(1_300_000);
    expect(
      terminationSettlement(policy, {
        accruedUntaken: -2,
        eligibleCarryOver: 0,
        monthlyBasicWage: 2_600_000,
      }).recoveryDraft,
    ).toEqual({ days: 2, amount: 200_000, status: 'draft' });
    const c = emp({ terminationDate: '2026-09-13' });
    expect(annualAccrued(policy, c, '2026-12-31').accrued).toBe(
      annualAccrued(policy, c, '2026-09-14').accrued,
    );
  });

  it('10. 2024-02-29 hire clamps to 28 Feb and returns to 29 Feb in leap years', () => {
    const e = emp({ hireDate: '2024-02-29' });
    expect(detectCycle(policy, e, 'annual', '2025-03-01')?.startDate).toBe(
      '2025-02-28',
    );
    expect(detectCycle(policy, e, 'annual', '2028-02-29')?.startDate).toBe(
      '2028-02-29',
    );
    expect(detectCycle(policy, e, 'annual', '2028-02-28')?.startDate).toBe(
      '2027-02-28',
    );
  });
});

describe('Mainland leave engine — additional rules', () => {
  it('prorates by FTE and earns full entitlement over a complete cycle', () => {
    expect(annualAccrued(policy, emp({ fte: 0.5 }), '2026-03-15').accrued).toBe(
      0,
    );
    expect(
      annualAccrued(policy, emp({ fte: 0.5 }), '2026-03-14').accrued,
    ).toBeCloseTo((14 * 364) / 365, 4);
    const full = annualAccrued(
      policy,
      emp({ terminationDate: '2026-03-14' }),
      '2026-03-20',
    );
    expect(full.accrued).toBe(28);
    // Boundary: the day after termination is still the closing cycle.
    expect(
      annualAccrued(
        policy,
        emp({ terminationDate: '2026-03-14' }),
        '2026-03-15',
      ).accrued,
    ).toBe(28);
  });

  it('pauses accrual for the whole block only when unpaid block > 30 days', () => {
    const base = annualAccrued(policy, emp(), '2025-12-01').accrued;
    const b30 = emp({
      unpaidBlocks: [{ start: '2025-10-01', end: '2025-10-30' }],
    });
    const b31 = emp({
      unpaidBlocks: [{ start: '2025-10-01', end: '2025-10-31' }],
    });
    expect(annualAccrued(policy, b30, '2025-12-01').accrued).toBe(base);
    expect(annualAccrued(policy, b31, '2025-12-01').accrued).toBeCloseTo(
      base - (31 * 28) / 365,
      3,
    );
  });

  it('dates before hire have no cycle', () => {
    expect(detectCycle(policy, emp(), 'annual', '2025-03-14')).toBeNull();
    expect(detectCycle(policy, emp(), 'sick', '2028-03-15')).toMatchObject({
      cycleNumber: 2,
    });
  });

  it('annual booking cannot borrow beyond projected accrual', () => {
    const r = validateAnnualBooking(policy, emp(), {
      lastDay: '2025-10-31',
      requestedDays: 20,
      carryOverUsable: 0,
      takenInCycle: 0,
      pendingAndFutureApproved: 0,
    });
    expect(r.findings[0].code).toBe('ANNUAL_INSUFFICIENT');
  });

  it('compassionate, unpaid, return-to-work, holiday pay and absence rules', () => {
    expect(
      validateCompassionate(policy, cal, {
        event: 'friend_death',
        usedInCycle: 0,
        requestedDays: 1,
        submittedOn: '2027-01-04',
      }).findings[0].code,
    ).toBe('COMPASSIONATE_EVENT');
    expect(
      validateCompassionate(policy, cal, {
        event: 'parent_death',
        usedInCycle: 0,
        requestedDays: 2,
        returnDate: '2027-01-04',
        submittedOn: '2027-01-11',
      }).findings,
    ).toEqual([]);
    expect(
      validateCompassionate(policy, cal, {
        event: 'parent_death',
        usedInCycle: 0,
        requestedDays: 2,
        returnDate: '2027-01-04',
        submittedOn: '2027-01-12',
      }).findings[0].code,
    ).toBe('COMPASSIONATE_LATE');
    expect(
      validateUnpaid(policy, { usedInRolling12Months: 25, requestedDays: 6 })
        .findings[0].code,
    ).toBe('UNPAID_LIMIT');
    expect(
      returnToWorkAllowed(policy, {
        birthDate: '2027-03-01',
        date: '2027-04-11',
      }).allowed,
    ).toBe(false);
    expect(
      returnToWorkAllowed(policy, {
        birthDate: '2027-03-01',
        date: '2027-04-12',
      }).allowed,
    ).toBe(true);
    expect(
      holidayWorkPay(policy, { hoursWorked: 8, monthlyBasicWage: 1_950_000 })
        .amount,
    ).toBe(160_000);
    const runs = unauthorizedAbsenceRuns(
      policy,
      cal,
      '2027-01-04',
      '2027-01-15',
      () => false,
    );
    expect(runs).toEqual([
      { start: '2027-01-04', end: '2027-01-15', workingDays: 10, flagHr: true },
    ]);
  });

  it('half days reduce counted units', () => {
    expect(
      countDays('2027-01-04', '2027-01-05', 'working_days', cal, {
        halfDayEnd: true,
      }).units,
    ).toBe(1.5);
  });
});
