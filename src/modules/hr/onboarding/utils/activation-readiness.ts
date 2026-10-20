import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingTaskStatusEnum } from '../enums/onboarding-task-status.enum';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { onboardingPositionId } from './position-assignment';

export type ReadinessRequirement = {
  id: string;
  label: string;
  group: string;
  owner: string;
  required: boolean;
  status: 'complete' | 'pending' | 'blocked' | 'skipped';
  action: 'details' | 'tasks' | 'approvals' | 'payroll' | 'contracts';
};

const payrollRequirements = [
  ['position', 'Position assigned', 'HR', 'details'],
  ['reporting manager', 'Reporting manager assigned', 'HR', 'details'],
  ['payroll profile', 'Payroll enabled and not on hold', 'Payroll', 'payroll'],
  ['TIN', 'Tax identification number', 'Payroll', 'payroll'],
  ['pension enrollment', 'Pension enrollment', 'Payroll', 'payroll'],
  ['health enrollment', 'Health insurance enrollment', 'Payroll', 'payroll'],
  ['bank account', 'Verified bank account', 'Payroll', 'payroll'],
  [
    'independently approved starting salary',
    'Independently approved starting salary',
    'Payroll approver',
    'payroll',
  ],
  [
    'signed employment contract',
    'Signed contract covering the start date',
    'HR / Employee',
    'contracts',
  ],
] as const;

export function buildActivationReadiness(
  request: OnboardingRequest,
  missing: string[],
) {
  const closed = ['completed', 'cancelled'].includes(request.status);
  const started = [
    'submitted',
    'in_review',
    'in_progress',
    'completed',
  ].includes(request.status);
  const requirements: ReadinessRequirement[] = [
    {
      id: 'workflow',
      label: 'Onboarding submitted and started',
      group: 'Registration & review',
      owner: 'HR',
      required: true,
      status: started ? 'complete' : 'blocked',
      action: 'details',
    },
    ...request.tasks.map((task): ReadinessRequirement => {
      const assignee = task.assigned_company_user?.user;
      const step = task.workflow_step;
      const positionId = onboardingPositionId(step?.metadata);
      const owner = assignee
        ? `${assignee.first_name} ${assignee.last_name}`.trim() ||
          assignee.email
        : task.assigned_department?.name ||
          step?.assigned_role?.display_name ||
          step?.assigned_role?.name ||
          (positionId ? `Position #${String(positionId)}` : null) ||
          (task.assigned_company_user_id
            ? `Assigned member #${task.assigned_company_user_id}`
            : 'HR — assign an owner');
      return {
        id: `task-${task.id}`,
        label: task.title,
        group: 'Checklist & documents',
        owner,
        required: task.is_required !== false,
        status:
          task.status === OnboardingTaskStatusEnum.COMPLETED
            ? 'complete'
            : task.status === OnboardingTaskStatusEnum.CANCELLED
              ? 'blocked'
              : 'pending',
        action: 'tasks',
      };
    }),
    ...request.approvals.map(
      (approval): ReadinessRequirement => ({
        id: `approval-${approval.id}`,
        label:
          approval.workflow_step?.name ||
          `Approval level ${approval.approval_level}`,
        group: 'Approvals',
        owner: approval.approver?.user
          ? `${approval.approver.user.first_name} ${approval.approver.user.last_name}`.trim() ||
            approval.approver.user.email
          : 'Assigned approver',
        required: true,
        status:
          approval.status === OnboardingApprovalStatusEnum.APPROVED
            ? 'complete'
            : approval.status === OnboardingApprovalStatusEnum.SKIPPED
              ? 'skipped'
              : approval.status === OnboardingApprovalStatusEnum.REJECTED
                ? 'blocked'
                : 'pending',
        action: 'approvals',
      }),
    ),
    ...payrollRequirements.map(
      ([key, label, owner, action]): ReadinessRequirement => ({
        id: key,
        label,
        group: action === 'contracts' ? 'Contract' : 'Employment & payroll',
        owner,
        required: true,
        status:
          missing.includes(key) ||
          (key === 'bank account' && missing.includes('verified bank account'))
            ? 'pending'
            : 'complete',
        action,
      }),
    ),
  ];
  const knownChecks = new Set<string>([
    ...payrollRequirements.map(([key]) => key),
    'verified bank account',
  ]);
  for (const missingCheck of missing) {
    if (!knownChecks.has(missingCheck)) {
      requirements.push({
        id: `additional-${missingCheck}`,
        label: missingCheck,
        group: 'Additional activation requirements',
        owner: 'HR / Payroll',
        required: true,
        status: 'blocked',
        action: 'details',
      });
    }
  }
  const blockers = requirements.filter(
    (item) => item.required && !['complete', 'skipped'].includes(item.status),
  );
  const mandatory = requirements.filter((item) => item.required);
  return {
    employee_id: request.employee_id,
    employee_status: request.employee?.employment_status,
    request_status: request.status,
    ready_to_activate: !closed && blockers.length === 0,
    closed,
    blocker_count: blockers.length,
    completed_required: mandatory.length - blockers.length,
    total_required: mandatory.length,
    next_action: blockers[0] ?? null,
    requirements,
  };
}
