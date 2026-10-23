export type OvertimeRequestState =
  | 'PENDING_MANAGER'
  | 'PENDING_HR'
  | 'APPROVED'
  | 'REJECTED'
  | 'NOT_REQUIRED'
  | 'PENDING';

export function requiresOvertimeApproval(
  attendancePolicyValue: unknown,
  payrollPolicyValue: unknown,
): boolean {
  return attendancePolicyValue !== false && attendancePolicyValue !== 'false'
    ? true
    : payrollPolicyValue === true || payrollPolicyValue === 'true';
}

export function reconcileOvertimeMinutes(input: {
  calculatedMinutes: number;
  approvedRequestMinutes: number;
  approvalRequired: boolean;
  requestState?: OvertimeRequestState | null;
}) {
  const calculatedMinutes = Math.max(
    0,
    Math.floor(Number(input.calculatedMinutes) || 0),
  );
  const approvedMinutes = Math.min(
    calculatedMinutes,
    Math.max(0, Math.floor(Number(input.approvedRequestMinutes) || 0)),
  );
  const payableMinutes = input.approvalRequired
    ? approvedMinutes
    : calculatedMinutes;

  return {
    calculatedMinutes,
    approvedMinutes,
    payableMinutes,
    pendingMinutes: Math.max(0, calculatedMinutes - payableMinutes),
    approvalStatus: input.approvalRequired
      ? (input.requestState ?? 'PENDING')
      : 'NOT_REQUIRED',
  };
}
