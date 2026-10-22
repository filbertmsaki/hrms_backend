import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { buildActivationReadiness } from './activation-readiness';
import { isOnboardingTaskReady } from './workflow-readiness';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';

export function buildOnboardingOverview(
  request: OnboardingRequest,
  missing: string[],
  now = new Date(),
) {
  const readiness = buildActivationReadiness(request, missing);
  const blockers = readiness.requirements.filter(
    (requirement) =>
      requirement.required &&
      !['complete', 'skipped'].includes(requirement.status),
  );
  const workflowOrder = new Map<string, number>([
    ['workflow', -1],
    ...request.tasks.map((task): [string, number] => [
      `task-${task.id}`,
      task.workflow_step?.step_order ?? 0,
    ]),
    ...request.approvals.map((approval): [string, number] => [
      `approval-${approval.id}`,
      approval.approval_level,
    ]),
  ]);
  blockers.sort(
    (first, second) =>
      (workflowOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) -
      (workflowOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const overdueTasks = (request.tasks ?? []).filter(
    (task) =>
      task.due_date &&
      new Date(task.due_date).getTime() < now.getTime() &&
      isOnboardingTaskReady(request, task),
  );
  const overdue =
    !readiness.closed &&
    (overdueTasks.length > 0 ||
      Boolean(
        request.planned_completion_date &&
        request.planned_completion_date < now.toISOString().slice(0, 10),
      ));
  const attentionReasons: string[] = [];
  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  if (readiness.ready_to_activate)
    attentionReasons.push('Ready but not yet activated');
  if (overdue)
    attentionReasons.push('Overdue required work or target completion');
  if (
    request.planned_start_date &&
    request.planned_start_date <= soon &&
    blockers.length
  )
    attentionReasons.push(
      request.planned_start_date < today
        ? 'Start date passed with blockers'
        : 'Starts within 7 days with blockers',
    );
  if (blockers.some((item) => item.owner === 'HR — assign an owner'))
    attentionReasons.push('Required work has no assigned owner');
  if (
    request.approvals.some(
      (item) =>
        item.status === OnboardingApprovalStatusEnum.PENDING &&
        item.created_at &&
        new Date(item.created_at).getTime() < now.getTime() - 2 * 86400000,
    )
  )
    attentionReasons.push('Approval waiting over 2 days');
  if (blockers.some((item) => item.status === 'blocked'))
    attentionReasons.push('Required step needs attention');
  return {
    id: request.id,
    employee_id: request.employee_id,
    employee_name: [request.employee?.first_name, request.employee?.last_name]
      .filter(Boolean)
      .join(' '),
    employee_no: request.employee?.employee_no ?? '',
    onboarding_no: request.onboarding_no,
    department: request.employee?.primary_department?.name ?? 'Unassigned',
    stage: readiness.closed
      ? 'Closed'
      : readiness.ready_to_activate
        ? 'Ready for activation'
        : (blockers[0]?.group ?? 'Review required'),
    overdue,
    overdue_task_count: overdueTasks.length,
    planned_completion_date: request.planned_completion_date,
    planned_start_date: request.planned_start_date,
    attention_reasons: attentionReasons,
    owners: readiness.ready_to_activate
      ? ['Authorized HR']
      : [...new Set(blockers.map((requirement) => requirement.owner))],
    blockers,
    readiness,
  };
}
