import { ActionItemReconciliationService } from './action-item-reconciliation.service';

describe('onboarding inbox reconciliation sequencing', () => {
  const first = {
    id: 1,
    status: 'pending',
    is_required: true,
    workflow_step: { step_order: 1 },
  };
  const request = {
    id: 55,
    company_id: 10,
    status: 'in_progress',
    current_approval_level: 3,
    tasks: [first],
    approvals: [],
  };

  it('does not recreate future task or approval inbox items or label them completed', async () => {
    const upsertOpen = jest.fn();
    const completeBySource = jest.fn();
    const task = {
      id: 2,
      onboarding_request_id: 55,
      assigned_company_user_id: 20,
      status: 'pending',
      workflow_step: { step_order: 2 },
      onboarding_request: request,
    };
    const approval = {
      onboarding_request_id: 55,
      approver_company_user_id: 20,
      approval_level: 3,
      onboarding_request: request,
    };
    const service = Object.assign(
      Object.create(ActionItemReconciliationService.prototype),
      {
        onboardingTaskRepository: { find: jest.fn().mockResolvedValue([task]) },
        onboardingApprovalRepository: {
          find: jest.fn().mockResolvedValue([approval]),
        },
        actionItemsService: { upsertOpen, completeBySource },
      },
    ) as {
      reconcileOnboardingTasks(): Promise<void>;
      reconcileOnboardingApprovals(): Promise<void>;
    };
    await service.reconcileOnboardingTasks();
    await service.reconcileOnboardingApprovals();
    expect(upsertOpen).not.toHaveBeenCalled();
    expect(completeBySource).not.toHaveBeenCalled();
  });
});
