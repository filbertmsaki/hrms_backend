import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingTask } from '../entities/onboarding-task.entity';
import {
  isOnboardingStepReady,
  isOnboardingTaskReady,
} from './workflow-readiness';

const task = (id: number, order: number, status = 'pending', required = true) =>
  ({
    id,
    status,
    is_required: required,
    workflow_step: { step_order: order },
  }) as OnboardingTask;
const execution = (
  tasks: OnboardingTask[],
  approvals: unknown[] = [],
  status = 'in_progress',
) => ({ status, tasks, approvals }) as OnboardingRequest;

describe('onboarding workflow sequencing', () => {
  it('keeps the next step waiting until every required checklist item is complete', () => {
    const first = task(1, 1, 'completed');
    const second = task(2, 1);
    const next = task(3, 2);
    const request = execution([first, second, next]);
    expect(isOnboardingTaskReady(request, second)).toBe(true);
    expect(isOnboardingTaskReady(request, next)).toBe(false);
    second.status = first.status;
    expect(isOnboardingTaskReady(request, next)).toBe(true);
  });

  it('keeps approval waiting behind an unfinished task step', () => {
    expect(isOnboardingStepReady(execution([task(1, 1)]), 2)).toBe(false);
    expect(isOnboardingStepReady(execution([task(1, 1, 'completed')]), 2)).toBe(
      true,
    );
  });

  it.each(['approved', 'skipped'])(
    'releases a task after the previous sign-off is %s',
    (status) => {
      const next = task(2, 2);
      const approval = { approval_level: 1, status: 'pending' };
      const request = execution([next], [approval]);
      expect(isOnboardingTaskReady(request, next)).toBe(false);
      approval.status = status;
      expect(isOnboardingTaskReady(request, next)).toBe(true);
    },
  );

  it('does not make optional tasks mandatory', () => {
    const next = task(2, 2);
    expect(
      isOnboardingTaskReady(
        execution([task(1, 1, 'pending', false), next]),
        next,
      ),
    ).toBe(true);
  });

  it.each(['draft', 'cancelled', 'completed', 'rejected'])(
    'does not release work on a %s request',
    (status) => {
      const next = task(1, 1);
      expect(isOnboardingTaskReady(execution([next], [], status), next)).toBe(
        false,
      );
    },
  );
});
