import {
  findObligationConflicts,
  obligationFor,
} from './payroll-obligation.service';

const basic = (amount: string) => ({
  componentCode: 'BASIC',
  componentType: 'EARNING',
  amount,
  sourceType: 'COMPENSATION',
  sourceReference: '1',
});
const held = (
  overrides: Partial<{
    componentCode: string;
    obligationKind: 'RECURRING' | 'ONE_OFF';
    sourceKey: string;
    amount: string;
    entitlementAmount: string | null;
    payrollRunId: number;
  }>,
) => ({
  employeeId: 7,
  componentCode: 'BASIC',
  obligationKind: 'RECURRING' as const,
  sourceKey: 'COMPENSATION',
  amount: '1000000.00',
  entitlementAmount: '1000000.00',
  payrollRunId: 1,
  ...overrides,
});

describe('payroll payment obligations', () => {
  it('classifies salary as recurring and inputs/bonuses as one-off; ignores deductions', () => {
    expect(obligationFor(7, basic('1000.00'))).toMatchObject({
      kind: 'RECURRING',
      entitlement: '1000.00',
    });
    expect(
      obligationFor(7, {
        componentCode: 'HOUSING',
        componentType: 'EARNING',
        amount: '50.00',
        sourceType: 'MANUAL',
        calculationSnapshot: { input_id: 9 },
      }),
    ).toMatchObject({ kind: 'ONE_OFF', sourceKey: 'INPUT:9' });
    expect(
      obligationFor(7, {
        componentCode: 'BONUS',
        componentType: 'EARNING',
        amount: '50.00',
        sourceType: 'PERFORMANCE',
        calculationSnapshot: { scheme_id: 3 },
      }),
    ).toMatchObject({ sourceKey: 'BONUS_SCHEME:3' });
    expect(
      obligationFor(7, {
        componentCode: 'PAYE',
        componentType: 'DEDUCTION',
        amount: '50.00',
        sourceType: 'STATUTORY',
      }),
    ).toBeNull();
  });

  it('blocks a second run paying the same basic salary for the period', () => {
    const candidate = obligationFor(7, basic('1000000.00'))!;
    const conflicts = findObligationConflicts([candidate], [held({})]);
    expect(conflicts).toEqual([
      expect.objectContaining({
        component_code: 'BASIC',
        already_claimed: '1000000.00',
        claimed_by_run_ids: [1],
      }),
    ]);
  });

  it('allows an off-cycle unpaid-salary settlement only up to the remaining entitlement', () => {
    const settlement = (amount: string) =>
      obligationFor(7, {
        componentCode: 'BASIC',
        componentType: 'EARNING',
        amount,
        sourceType: 'MANUAL',
        calculationSnapshot: { input_id: 44, settles_recurring_salary: true },
      })!;
    const partlyPaid = [held({ amount: '600000.00' })];
    expect(
      findObligationConflicts([settlement('400000.00')], partlyPaid),
    ).toEqual([]);
    expect(
      findObligationConflicts([settlement('400000.01')], partlyPaid),
    ).toHaveLength(1);
  });

  it('requires an established entitlement before settling salary off-cycle', () => {
    const settlement = obligationFor(7, {
      componentCode: 'BASIC',
      componentType: 'EARNING',
      amount: '10.00',
      sourceType: 'MANUAL',
      calculationSnapshot: { input_id: 44, settles_recurring_salary: true },
    })!;
    expect(findObligationConflicts([settlement], [])[0].reason).toMatch(
      'No salary entitlement',
    );
  });

  it('lets a one-off item be claimed once, and counts duplicates within one run', () => {
    const input = obligationFor(7, {
      componentCode: 'BONUS',
      componentType: 'EARNING',
      amount: '50.00',
      sourceType: 'MANUAL',
      calculationSnapshot: { input_id: 9 },
    })!;
    expect(
      findObligationConflicts(
        [input],
        [
          held({
            componentCode: 'BONUS',
            obligationKind: 'ONE_OFF',
            sourceKey: 'INPUT:9',
            amount: '50.00',
          }),
        ],
      ),
    ).toHaveLength(1);
    expect(findObligationConflicts([input], [])).toEqual([]);
    const half = obligationFor(7, basic('500000.00'))!;
    // Two basic lines in the same run beyond the entitlement are caught too.
    expect(
      findObligationConflicts(
        [half, half, { ...half }],
        [held({ amount: '0.00', entitlementAmount: '1000000.00' })],
      ),
    ).toHaveLength(1);
  });
});
