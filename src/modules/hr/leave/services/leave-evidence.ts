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
