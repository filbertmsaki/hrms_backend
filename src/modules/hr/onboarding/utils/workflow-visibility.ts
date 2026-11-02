// Only pass trusted SQL identifiers/expressions, never user-provided values.
// Keep the prerequisite predicates aligned with workflow-readiness.ts.
function readyAtOrder(request: string, order: string): string {
  return `${request}.status IN ('submitted', 'in_review', 'in_progress')
    AND NOT EXISTS (
      SELECT 1 FROM onboarding_tasks prior_task
      JOIN onboarding_workflow_steps prior_step ON prior_step.id = prior_task.workflow_step_id
      WHERE prior_task.onboarding_request_id = ${request}.id
        AND prior_task.is_required = true AND prior_task.status <> 'completed'
        AND prior_step.step_order < ${order}
    )
    AND NOT EXISTS (
      SELECT 1 FROM onboarding_approvals prior_approval
      WHERE prior_approval.onboarding_request_id = ${request}.id
        AND prior_approval.approval_level < ${order}
        AND prior_approval.status NOT IN ('approved', 'skipped')
    )`;
}

function taskVisible(id: string, company: string): string {
  return `EXISTS (
    SELECT 1 FROM onboarding_tasks visible_task
    JOIN onboarding_requests visible_request ON visible_request.id = visible_task.onboarding_request_id
    LEFT JOIN onboarding_workflow_steps visible_step ON visible_step.id = visible_task.workflow_step_id
    WHERE visible_task.id::text = ${id}::text AND visible_request.company_id = ${company}
      AND (visible_task.status IN ('completed', 'cancelled') OR (${readyAtOrder('visible_request', 'COALESCE(visible_step.step_order, 0)')}))
  )`;
}

function approvalVisible(
  id: string,
  company: string,
  recipient: string,
): string {
  return `EXISTS (
    SELECT 1 FROM onboarding_approvals visible_approval
    JOIN onboarding_requests visible_request ON visible_request.id = visible_approval.onboarding_request_id
    WHERE visible_request.id::text = ${id}::text AND visible_request.company_id = ${company}
      AND visible_approval.approver_company_user_id = ${recipient}
      AND (visible_approval.status IN ('approved', 'rejected') OR (
        visible_approval.status = 'pending'
        AND visible_approval.approval_level = visible_request.current_approval_level
        AND ${readyAtOrder('visible_request', 'visible_approval.approval_level')}
      ))
  )`;
}

function employeeDetailsReviewVisible(id: string, company: string): string {
  return `EXISTS (
    SELECT 1 FROM onboarding_requests detail_review_request
    WHERE detail_review_request.id::text = ${id}::text
      AND detail_review_request.company_id = ${company}
      AND detail_review_request.status IN ('draft', 'submitted', 'in_review', 'in_progress')
  )`;
}

export function onboardingActionVisibilitySql(alias = 'item'): string {
  return `(UPPER(${alias}.source_entity_type) <> 'ONBOARDING_TASK' OR ${taskVisible(`${alias}.source_entity_id`, `${alias}.company_id`)})
    AND (UPPER(${alias}.source_entity_type) <> 'ONBOARDING_REQUEST'
      OR (${alias}.metadata->>'stage' = 'employee_details_review'
        AND ${employeeDetailsReviewVisible(`${alias}.source_entity_id`, `${alias}.company_id`)})
      OR ${approvalVisible(`${alias}.source_entity_id`, `${alias}.company_id`, `${alias}.assignee_company_user_id`)})`;
}

export function onboardingNotificationVisibilitySql(
  alias = 'notification',
): string {
  return `(UPPER(COALESCE(${alias}.type, '')) NOT IN ('ONBOARDING_TASK_ASSIGNED', 'ONBOARDING_TASK_OVERDUE')
      OR ${taskVisible(`${alias}.entity_id`, `${alias}.company_id`)})
    AND (UPPER(COALESCE(${alias}.type, '')) NOT IN ('ONBOARDING_APPROVAL_REQUIRED', 'ONBOARDING_APPROVAL_REMINDER', 'ONBOARDING_REQUEST_SUBMITTED')
      OR ${approvalVisible(`${alias}.entity_id`, `${alias}.company_id`, `${alias}.receiver_company_user_id`)})`;
}
