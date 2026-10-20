import { evidenceStatus } from './leave-evidence';
describe('leave evidence status', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const request = {
    evidence_required: true,
    evidence_due_at: now,
    evidence_received_at: null,
  };
  it('keeps legacy requests untracked and optional evidence optional', () => {
    expect(evidenceStatus({ ...request, evidence_required: null }, now)).toBe(
      'not_tracked',
    );
    expect(evidenceStatus({ ...request, evidence_required: false }, now)).toBe(
      'not_required',
    );
  });
  it('becomes overdue exactly at the deadline', () => {
    expect(evidenceStatus(request, new Date(now.getTime() - 1))).toBe(
      'awaiting_evidence',
    );
    expect(evidenceStatus(request, now)).toBe('overdue');
  });
  it('marks late uploads as received', () => {
    expect(evidenceStatus({ ...request, evidence_received_at: now }, now)).toBe(
      'received',
    );
  });
});
