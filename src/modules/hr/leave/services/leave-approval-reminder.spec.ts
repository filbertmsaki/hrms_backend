import { nextEscalationAction } from './leave-approval-reminder.service';

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 8));
const base = {
  stageStart: day(0),
  escalateAfterDays: 2,
  maxEscalations: 3,
  escalationCount: 0,
  lastEscalatedAt: null as Date | null,
  overdueFlaggedAt: null as Date | null,
};

describe('nextEscalationAction', () => {
  it('does nothing when escalation is off or not yet due', () => {
    expect(
      nextEscalationAction({ ...base, escalateAfterDays: null, now: day(9) }),
    ).toBe('none');
    expect(nextEscalationAction({ ...base, now: day(1) })).toBe('none');
  });

  it('escalates after the first interval', () => {
    expect(nextEscalationAction({ ...base, now: day(2) })).toBe('escalate');
  });

  it('waits a full interval after the previous escalation', () => {
    const after1 = { ...base, escalationCount: 1, lastEscalatedAt: day(2) };
    expect(nextEscalationAction({ ...after1, now: day(3) })).toBe('none');
    expect(nextEscalationAction({ ...after1, now: day(4) })).toBe('escalate');
  });

  it('flags HR once after the last escalation, then stops', () => {
    const maxed = { ...base, escalationCount: 3, lastEscalatedAt: day(6) };
    expect(nextEscalationAction({ ...maxed, now: day(7) })).toBe('none');
    expect(nextEscalationAction({ ...maxed, now: day(8) })).toBe(
      'flag_overdue',
    );
    expect(
      nextEscalationAction({
        ...maxed,
        overdueFlaggedAt: day(8),
        now: day(20),
      }),
    ).toBe('none');
  });

  it('keeps the old single escalation for legacy rows with no count', () => {
    const legacy = {
      ...base,
      maxEscalations: 1,
      escalationCount: 0,
      lastEscalatedAt: day(2),
    };
    expect(nextEscalationAction({ ...legacy, now: day(4) })).toBe(
      'flag_overdue',
    );
  });
});
