import {
  planReconciliationRights,
  recoverPendingWrite,
} from './reconciliation-rights-planner';

describe('reconciliation rights planner', () => {
  const r = (doorNo: number, templateNo: string) => ({ doorNo, templateNo });

  it('preserves manually configured rights and unions overlapping group and direct grants', () => {
    expect(
      planReconciliationRights({
        observed: [r(1, 'A'), r(2, 'B')],
        desiredGroup: [r(1, 'A'), r(3, 'C')],
        desiredDirect: [r(3, 'C')],
        previouslyManaged: [],
      }),
    ).toEqual({
      state: 'READY',
      desired: [r(1, 'A'), r(2, 'B'), r(3, 'C')],
      managedAfter: [r(3, 'C')],
      changed: true,
    });
  });

  it('removes a previously managed grant while retaining unmanaged rights', () => {
    expect(
      planReconciliationRights({
        observed: [r(1, 'A'), r(2, 'B')],
        desiredGroup: [],
        desiredDirect: [],
        previouslyManaged: [r(1, 'A')],
      }),
    ).toEqual({
      state: 'READY',
      desired: [r(2, 'B')],
      managedAfter: [],
      changed: true,
    });
  });

  it('does not claim a matching right that was already on the device', () => {
    expect(
      planReconciliationRights({
        observed: [r(1, 'A')],
        desiredGroup: [r(1, 'A')],
        desiredDirect: [],
        previouslyManaged: [],
      }),
    ).toEqual({
      state: 'READY',
      desired: [r(1, 'A')],
      managedAfter: [],
      changed: false,
    });
  });

  it('requires review when an unmanaged schedule conflicts with a desired schedule', () => {
    expect(
      planReconciliationRights({
        observed: [r(1, 'A')],
        desiredGroup: [r(1, 'B')],
        desiredDirect: [],
        previouslyManaged: [],
      }),
    ).toEqual({
      state: 'REVIEW',
      reason: 'Door 1 has conflicting schedule templates',
    });
  });

  it('requires review when a requested removal is not known to be managed', () => {
    expect(
      planReconciliationRights({
        observed: [r(1, 'A')],
        desiredGroup: [],
        desiredDirect: [],
        previouslyManaged: [],
        requestedRemovals: [r(1, 'A')],
      }),
    ).toEqual({
      state: 'REVIEW',
      reason:
        'Door 1 has a right of unknown ownership; removal requires review',
    });
  });

  it('keeps a shared right when another current grant still requires it', () => {
    expect(
      planReconciliationRights({
        observed: [r(1, 'A')],
        desiredGroup: [r(1, 'A')],
        desiredDirect: [],
        previouslyManaged: [],
        requestedRemovals: [r(1, 'A')],
      }).state,
    ).toBe('READY');
  });

  it('rejects invalid device data instead of producing a write', () => {
    expect(() =>
      planReconciliationRights({
        observed: [r(0, 'A')],
        desiredGroup: [],
        desiredDirect: [],
        previouslyManaged: [],
      }),
    ).toThrow('invalid door or template');
  });

  it('recovers uncertain writes only when the device matches a recorded snapshot', () => {
    const before = [r(1, 'A')];
    const after = [r(1, 'A'), r(2, 'B')];
    expect(
      recoverPendingWrite({ before, after, observed: [...after].reverse() }),
    ).toBe('APPLIED');
    expect(recoverPendingWrite({ before, after, observed: before })).toBe(
      'NOT_APPLIED',
    );
    expect(
      recoverPendingWrite({ before, after, observed: [r(1, 'A'), r(3, 'C')] }),
    ).toBe('REVIEW');
  });
});
