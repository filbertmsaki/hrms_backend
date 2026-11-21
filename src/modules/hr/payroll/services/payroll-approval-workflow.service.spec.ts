import {
  assertStageAuthority,
  nextStatusAfterStage,
  pendingStatusForStage,
  runApprovalWorkflow,
} from './payroll-approval-workflow.service';
import {
  PayrollApprovalStageEnum,
  PayrollRunStatusEnum,
} from '../payroll.enums';

describe('payroll approval workflow', () => {
  const twoStage = {
    workflow_id: 1,
    version_number: 1,
    name: 'Branch',
    stages: [
      {
        stage: PayrollApprovalStageEnum.FINANCE,
        approver_company_user_ids: [20],
        max_net_pay_total: '1000000.00',
      },
      { stage: PayrollApprovalStageEnum.MANAGEMENT },
    ],
    delegations: [
      {
        from_company_user_id: 20,
        to_company_user_id: 21,
        starts_on: '2026-11-01',
        ends_on: '2026-11-30',
      },
    ],
  };

  it('keeps the historical sequence for runs without a stored workflow', () => {
    const workflow = runApprovalWorkflow({ configurationSnapshot: null });
    expect(workflow.stages.map((item) => item.stage)).toEqual([
      'HR',
      'FINANCE',
      'MANAGEMENT',
    ]);
    expect(nextStatusAfterStage(workflow, PayrollApprovalStageEnum.HR)).toBe(
      PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
    );
  });

  it('follows the configured order and ends at APPROVED', () => {
    expect(pendingStatusForStage(twoStage.stages[0].stage)).toBe(
      PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
    );
    expect(
      nextStatusAfterStage(twoStage, PayrollApprovalStageEnum.FINANCE),
    ).toBe(PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL);
    expect(
      nextStatusAfterStage(twoStage, PayrollApprovalStageEnum.MANAGEMENT),
    ).toBe(PayrollRunStatusEnum.APPROVED);
  });

  it('enforces approver lists, active delegation and amount limits', () => {
    const base = {
      workflow: twoStage,
      stage: PayrollApprovalStageEnum.FINANCE,
      netPayTotal: '500000.00',
      today: '2026-11-20',
    };
    expect(() =>
      assertStageAuthority({ ...base, actorCompanyUserId: 20 }),
    ).not.toThrow();
    expect(() =>
      assertStageAuthority({ ...base, actorCompanyUserId: 21 }),
    ).not.toThrow();
    expect(() =>
      assertStageAuthority({
        ...base,
        actorCompanyUserId: 21,
        today: '2026-12-02',
      }),
    ).toThrow('not a configured approver');
    expect(() =>
      assertStageAuthority({ ...base, actorCompanyUserId: 99 }),
    ).toThrow('not a configured approver');
    expect(() =>
      assertStageAuthority({
        ...base,
        actorCompanyUserId: 20,
        netPayTotal: '1000000.01',
      }),
    ).toThrow('approval limit');
    expect(() =>
      assertStageAuthority({
        ...base,
        stage: PayrollApprovalStageEnum.HR,
        actorCompanyUserId: 20,
      }),
    ).toThrow('not part of the run workflow');
  });
});
