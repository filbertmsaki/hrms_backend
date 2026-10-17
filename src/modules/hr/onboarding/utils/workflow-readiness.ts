import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingTask } from '../entities/onboarding-task.entity';
import { OnboardingTaskStatusEnum } from '../enums/onboarding-task-status.enum';

export function isOnboardingStepReady(
  request: OnboardingRequest,
  order: number,
): boolean {
  if (!['submitted', 'in_review', 'in_progress'].includes(request.status))
    return false;
  return (
    !(request.tasks ?? []).some(
      (task) =>
        task.is_required !== false &&
        task.status !== OnboardingTaskStatusEnum.COMPLETED &&
        task.workflow_step &&
        task.workflow_step.step_order < order,
    ) &&
    !(request.approvals ?? []).some(
      (approval) =>
        approval.approval_level < order &&
        !['approved', 'skipped'].includes(approval.status),
    )
  );
}

export function isOnboardingTaskReady(
  request: OnboardingRequest,
  task: OnboardingTask,
): boolean {
  return (
    ['pending', 'in_progress'].includes(task.status) &&
    isOnboardingStepReady(request, task.workflow_step?.step_order ?? 0)
  );
}
