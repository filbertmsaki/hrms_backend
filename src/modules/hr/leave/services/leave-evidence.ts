import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';

/** Whether a request of `totalDays` on this leave type needs supporting evidence. */
export function isEvidenceRequiredFor(
  leaveType: Pick<
    LeaveType,
    'requires_attachment' | 'attachment_required_after_days'
  >,
  totalDays: number,
): boolean {
  if (!leaveType.requires_attachment) return false;
  const threshold = leaveType.attachment_required_after_days;
  if (threshold == null) return true;
  return Number(totalDays) > Number(threshold);
}

export function evidenceStatus(
  request: Pick<
    LeaveRequest,
    'evidence_required' | 'evidence_due_at' | 'evidence_received_at'
  >,
  now = new Date(),
) {
  if (request.evidence_required == null) return 'not_tracked';
  if (!request.evidence_required) return 'not_required';
  if (request.evidence_received_at) return 'received';
  return request.evidence_due_at && new Date(request.evidence_due_at) <= now
    ? 'overdue'
    : 'awaiting_evidence';
}

/**
 * When supporting evidence is due: the end of the last leave day plus the
 * grace days (default 3). Never earlier than tomorrow, so backdated leave
 * still gets time to upload.
 */
export function evidenceDueAtLeaveEnd(
  endDate: string,
  graceDays: number | null | undefined,
  now = new Date(),
): Date {
  const end = Date.parse(`${String(endDate).slice(0, 10)}T23:59:59Z`);
  const due = new Date(end + (graceDays ?? 3) * 86_400_000);
  const minimum = new Date(now.getTime() + 86_400_000);
  return due > minimum ? due : minimum;
}
