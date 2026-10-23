import {
  reconcileOvertimeMinutes,
  requiresOvertimeApproval,
} from './overtime-reconciliation.util';

describe('reconcileOvertimeMinutes', () => {
  it('requires approval if either the attendance or payroll policy requires it', () => {
    expect(requiresOvertimeApproval(false, true)).toBe(true);
    expect(requiresOvertimeApproval(true, false)).toBe(true);
    expect(requiresOvertimeApproval(false, false)).toBe(false);
  });

  it('pays only approved request minutes and keeps the remainder pending', () => {
    expect(
      reconcileOvertimeMinutes({
        calculatedMinutes: 120,
        approvedRequestMinutes: 60,
        approvalRequired: true,
        requestState: 'APPROVED',
      }),
    ).toEqual({
      calculatedMinutes: 120,
      approvedMinutes: 60,
      payableMinutes: 60,
      pendingMinutes: 60,
      approvalStatus: 'APPROVED',
    });
  });

  it('does not pay calculated overtime without an approved request', () => {
    expect(
      reconcileOvertimeMinutes({
        calculatedMinutes: 120,
        approvedRequestMinutes: 0,
        approvalRequired: true,
      }).payableMinutes,
    ).toBe(0);
  });

  it('pays calculated overtime when approval is not required', () => {
    expect(
      reconcileOvertimeMinutes({
        calculatedMinutes: 90,
        approvedRequestMinutes: 0,
        approvalRequired: false,
      }),
    ).toMatchObject({
      payableMinutes: 90,
      pendingMinutes: 0,
      approvalStatus: 'NOT_REQUIRED',
    });
  });

  it('clamps a stale approved request to the recalculated attendance total', () => {
    expect(
      reconcileOvertimeMinutes({
        calculatedMinutes: 45,
        approvedRequestMinutes: 90,
        approvalRequired: true,
        requestState: 'APPROVED',
      }).payableMinutes,
    ).toBe(45);
  });
});
