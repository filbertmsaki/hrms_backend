import { LeaveActingAssignmentStatus as S } from '../entities/leave-acting-assignment.entity';
import { LeaveStatusEnum as L } from '../enums/leave-status.enum';
import { dateInZone, planActingSync } from './leave-acting-assignment.service';

const leave = (status: L, start = '2026-12-01', end = '2026-12-05') => ({
  status,
  start_date: start,
  end_date: end,
});
const assignment = (
  status: S,
  start = '2026-12-01',
  end = '2026-12-05',
  follows = true,
) => ({
  status,
  start_date: start,
  end_date: end,
  follows_leave_dates: follows,
});

describe('acting assignment lifecycle (planActingSync)', () => {
  it('stays pending while the leave awaits approval', () => {
    expect(
      planActingSync(assignment(S.PENDING), leave(L.PENDING_HR), '2026-12-02'),
    ).toBeNull();
  });

  it('is scheduled (pending) for approved leave that has not started', () => {
    expect(
      planActingSync(assignment(S.PENDING), leave(L.APPROVED), '2026-11-20'),
    ).toBeNull();
  });

  it('activates on the first day of approved leave', () => {
    expect(
      planActingSync(assignment(S.PENDING), leave(L.APPROVED), '2026-12-01'),
    ).toMatchObject({ status: S.ACTIVE });
  });

  it('completes after the last day (normal resumption)', () => {
    expect(
      planActingSync(assignment(S.ACTIVE), leave(L.APPROVED), '2026-12-06'),
    ).toMatchObject({ status: S.COMPLETED });
  });

  it('is cancelled with the leave (cancellation or rejection)', () => {
    for (const status of [L.CANCELLED, L.REJECTED])
      expect(
        planActingSync(assignment(S.ACTIVE), leave(status), '2026-12-02'),
      ).toMatchObject({ status: S.CANCELLED, reason: `Leave ${status}` });
  });

  it('ends with an early return', () => {
    // Leave shortened to 3 Dec; on 4 Dec the delegation is complete.
    expect(
      planActingSync(
        assignment(S.ACTIVE),
        leave(L.APPROVED, '2026-12-01', '2026-12-03'),
        '2026-12-04',
      ),
    ).toEqual({
      status: S.COMPLETED,
      start_date: '2026-12-01',
      end_date: '2026-12-03',
    });
  });

  it('follows a leave extension when using the leave dates', () => {
    expect(
      planActingSync(
        assignment(S.ACTIVE),
        leave(L.APPROVED, '2026-12-01', '2026-12-10'),
        '2026-12-02',
      ),
    ).toEqual({
      status: S.ACTIVE,
      start_date: '2026-12-01',
      end_date: '2026-12-10',
    });
  });

  it('keeps custom dates but clamps them into a shortened leave', () => {
    expect(
      planActingSync(
        assignment(S.PENDING, '2026-12-02', '2026-12-05', false),
        leave(L.APPROVED, '2026-12-01', '2026-12-04'),
        '2026-11-20',
      ),
    ).toEqual({
      status: S.PENDING,
      start_date: '2026-12-02',
      end_date: '2026-12-04',
    });
  });

  it('falls back to pending when approved leave is returned for correction', () => {
    expect(
      planActingSync(
        assignment(S.ACTIVE),
        leave(L.RETURNED_FOR_CORRECTION),
        '2026-12-02',
      ),
    ).toMatchObject({ status: S.PENDING });
  });

  it('never reopens completed or cancelled assignments (idempotent)', () => {
    for (const status of [S.COMPLETED, S.CANCELLED])
      expect(
        planActingSync(assignment(status), leave(L.APPROVED), '2026-12-02'),
      ).toBeNull();
  });

  it('uses the company timezone for "today"', () => {
    // 22:30 UTC on 30 Nov is already 1 Dec in Dar es Salaam (UTC+3).
    expect(
      dateInZone(new Date('2026-11-30T22:30:00Z'), 'Africa/Dar_es_Salaam'),
    ).toBe('2026-12-01');
  });
});
