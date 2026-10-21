import { buildActivationReadiness } from './activation-readiness';
import { OnboardingRequest } from '../entities/onboarding-request.entity';

function request(overrides: Record<string, unknown> = {}): OnboardingRequest {
  return {
    id: 1,
    employee_id: 2,
    status: 'in_progress',
    employee: { employment_status: 'onboarding' },
    tasks: [],
    approvals: [],
    ...overrides,
  } as unknown as OnboardingRequest;
}

describe('activation readiness', () => {
  it('shows the position owner ahead of department scope for position-assigned tasks', () => {
    const result = buildActivationReadiness(
      request({
        tasks: [
          {
            id: 1,
            title: 'Laptop',
            status: 'pending',
            assigned_department: { name: 'IT' },
            workflow_step: { metadata: { assigned_position_id: 7 } },
          },
        ],
      }),
      [],
    );
    expect(result.next_action?.owner).toBe('Position #7');
  });

  it('keeps newly introduced activation checks visible and blocking', () => {
    const result = buildActivationReadiness(request(), ['Additional check']);
    expect(result.ready_to_activate).toBe(false);
    expect(result.next_action?.label).toBe('Additional check');
  });

  it('does not confuse completed tasks with activation readiness', () => {
    const result = buildActivationReadiness(
      request({ tasks: [{ id: 1, title: 'Laptop', status: 'completed' }] }),
      ['TIN', 'signed employment contract'],
    );
    expect(result.ready_to_activate).toBe(false);
    expect(result.blocker_count).toBe(2);
    expect(result.requirements.find((item) => item.id === 'TIN')).toMatchObject(
      {
        owner: 'Payroll',
        status: 'pending',
      },
    );
  });

  it('ignores optional tasks and skipped approvals for activation', () => {
    const result = buildActivationReadiness(
      request({
        tasks: [
          { id: 1, title: 'Tour', status: 'pending', is_required: false },
        ],
        approvals: [{ id: 1, approval_level: 1, status: 'skipped' }],
      }),
      [],
    );
    expect(result.ready_to_activate).toBe(true);
    expect(result.blocker_count).toBe(0);
    expect(
      result.requirements.find((item) => item.id === 'task-1'),
    ).toMatchObject({
      required: false,
      status: 'pending',
    });
  });

  it.each(['draft', 'rejected', 'cancelled'])(
    'does not activate a %s workflow with otherwise complete requirements',
    (status) => {
      expect(
        buildActivationReadiness(request({ status }), []).ready_to_activate,
      ).toBe(false);
    },
  );

  it('does not offer activation again for completed onboarding', () => {
    const result = buildActivationReadiness(
      request({ status: 'completed' }),
      [],
    );
    expect(result.closed).toBe(true);
    expect(result.ready_to_activate).toBe(false);
  });

  it('reports unverified bank details and rejected approvals as blockers', () => {
    const result = buildActivationReadiness(
      request({
        approvals: [{ id: 1, approval_level: 1, status: 'rejected' }],
      }),
      ['verified bank account'],
    );
    expect(result.blocker_count).toBe(2);
    expect(result.next_action?.status).toBe('blocked');
  });

  it('shows the assigned person rather than implying HR owns every task', () => {
    const result = buildActivationReadiness(
      request({
        tasks: [
          {
            id: 1,
            title: 'Laptop',
            status: 'pending',
            assigned_company_user: {
              user: { first_name: 'Amina', last_name: 'John' },
            },
          },
        ],
      }),
      [],
    );
    expect(result.next_action?.owner).toBe('Amina John');
  });
});
