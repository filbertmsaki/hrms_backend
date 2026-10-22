import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { buildOnboardingOverview } from './onboarding-overview';

const request = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 1,
    employee_id: 7,
    onboarding_no: 'ONB-1',
    status: 'in_progress',
    employee: {
      first_name: 'Amina',
      last_name: 'Ali',
      employee_no: 'EMP-7',
      primary_department: { name: 'Finance' },
    },
    tasks: [],
    approvals: [],
    ...overrides,
  }) as unknown as OnboardingRequest;

describe('onboarding overview', () => {
  it('reports factual start-date and owner attention flags without changing readiness', () => {
    const result = buildOnboardingOverview(
      request({
        planned_start_date: '2026-10-20',
        tasks: [{ id: 1, title: 'Laptop', status: 'pending' }],
      }),
      ['TIN'],
      new Date('2026-10-21'),
    );
    expect(result.attention_reasons).toEqual(
      expect.arrayContaining([
        'Start date passed with blockers',
        'Required work has no assigned owner',
      ]),
    );
    expect(result.readiness.blocker_count).toBe(2);
    expect(buildOnboardingOverview(request(), []).attention_reasons).toContain(
      'Ready but not yet activated',
    );
  });
  it('shows an earlier pending approval before a later checklist stage', () => {
    const result = buildOnboardingOverview(
      request({
        tasks: [
          {
            id: 1,
            title: 'Laptop',
            status: 'pending',
            workflow_step: { step_order: 2 },
          },
        ],
        approvals: [{ id: 2, approval_level: 1, status: 'pending' }],
      }),
      ['TIN'],
    );
    expect(result.stage).toBe('Approvals');
    expect(result.readiness.next_action?.id).toBe('approval-2');
    expect(
      result.blockers.find((item) => item.id === 'task-1')?.waiting_reason,
    ).toContain('earlier required');
    expect(result.blockers.map((item) => item.id)).toEqual([
      'approval-2',
      'task-1',
      'TIN',
    ]);
  });

  it('uses mandatory payroll and contract checks, not checklist percentage', () => {
    const result = buildOnboardingOverview(
      request({ progress_percentage: '100' }),
      ['TIN', 'signed employment contract'],
    );
    expect(result.stage).toBe('Employment & payroll');
    expect(result.owners).toEqual(['Payroll', 'HR / Employee']);
    expect(result.blockers).toHaveLength(2);
    expect(result.employee_name).toBe('Amina Ali');
    expect(result.department).toBe('Finance');
  });
  it('groups ready requests separately and does not count optional work as a blocker', () => {
    expect(
      buildOnboardingOverview(
        request({
          tasks: [
            { id: 1, title: 'Tour', status: 'pending', is_required: false },
          ],
        }),
        [],
      ).stage,
    ).toBe('Ready for activation');
  });
  it('does not mark a future workflow step overdue before its prerequisites are done', () => {
    const result = buildOnboardingOverview(
      request({
        tasks: [
          {
            id: 1,
            title: 'First',
            status: 'pending',
            is_required: true,
            workflow_step: { step_order: 1 },
          },
          {
            id: 2,
            title: 'Later',
            status: 'pending',
            due_date: new Date('2026-01-01'),
            workflow_step: { step_order: 2 },
          },
        ],
      }),
      [],
      new Date('2026-10-21'),
    );
    expect(result.overdue).toBe(false);
  });
  it('includes actionable overdue tasks and missed target dates', () => {
    const result = buildOnboardingOverview(
      request({
        tasks: [
          {
            id: 1,
            title: 'Laptop',
            status: 'pending',
            due_date: new Date('2026-01-01'),
          },
        ],
      }),
      [],
      new Date('2026-10-21'),
    );
    expect(result.overdue_task_count).toBe(1);
    expect(result.overdue).toBe(true);
    expect(
      buildOnboardingOverview(
        request({ planned_completion_date: '2026-10-20' }),
        [],
        new Date('2026-10-21'),
      ).overdue,
    ).toBe(true);
  });
  it.each(['draft', 'rejected', 'cancelled', 'completed'])(
    'never labels %s ready',
    (status) => {
      expect(buildOnboardingOverview(request({ status }), []).stage).not.toBe(
        'Ready for activation',
      );
    },
  );
});
