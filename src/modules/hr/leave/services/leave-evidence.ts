import { LeaveRequest } from '../entities/leave-request.entity';

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
