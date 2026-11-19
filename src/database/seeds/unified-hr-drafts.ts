import { EntityManager } from 'typeorm';
import { LeaveType } from '../../modules/hr/leave/entities/leave-type.entity';
import { LeaveRecordStatusEnum } from '../../modules/hr/leave/enums/leave-record-status.enum';
import { PayrollComponent } from '../../modules/hr/payroll/entities/payroll-configuration.entities';
import { OnboardingWorkflow } from '../../modules/hr/onboarding/entities/onboarding-workflow.entity';
import { OnboardingWorkflowStep } from '../../modules/hr/onboarding/entities/onboarding-workflow-step.entity';
import { OnboardingRecordStatusEnum } from '../../modules/hr/onboarding/enums/onboarding-record-status.enum';
import { OffboardingWorkflow } from '../../modules/hr/offboarding/entities/offboarding-workflow.entity';
import { OffboardingWorkflowStep } from '../../modules/hr/offboarding/entities/offboarding-workflow-step.entity';
import { OffboardingRecordStatusEnum } from '../../modules/hr/offboarding/enums/offboarding-record-status.enum';
import { Role } from '../../modules/roles/entities/role.entity';
import { LEAVE_TYPE_SEEDS } from './013-leave-types.seed';
import {
  WORKFLOW_NAME as ONBOARDING_NAME,
  STEP_SEEDS as ONBOARDING_STEPS,
} from './019-onboarding-workflow.seed';
import {
  WORKFLOW_NAME as OFFBOARDING_NAME,
  STEP_SEEDS as OFFBOARDING_STEPS,
} from './020-offboarding-workflow.seed';
import { COMPONENT_SEEDS } from './038-payroll-baseline.seed';

/** Proposals are inactive. Existing rows, including their child settings, are untouched. */
export async function seedLeaveDrafts(
  manager: EntityManager,
  companyId: number,
): Promise<void> {
  const repository = manager.getRepository(LeaveType);
  const rows = LEAVE_TYPE_SEEDS.map((seed) => ({
    company_id: companyId,
    code: seed.code,
    name: seed.name,
    description: `DRAFT - HR/legal review required. ${seed.description}`,
    is_paid: seed.isPaid,
    requires_attachment: seed.requiresAttachment,
    is_carry_forward_allowed: seed.isCarryForwardAllowed,
    max_carry_forward_days:
      seed.maxCarryForwardDays === null
        ? null
        : String(seed.maxCarryForwardDays),
    max_days_per_year: String(seed.maxDaysPerYear),
    gender_restriction: seed.genderRestriction,
    status: LeaveRecordStatusEnum.INACTIVE,
  }));
  await repository
    .createQueryBuilder()
    .insert()
    .into(LeaveType)
    .values(rows)
    .orIgnore()
    .execute();
}

export async function seedPayrollDrafts(
  manager: EntityManager,
  companyId: number,
): Promise<void> {
  const repository = manager.getRepository(PayrollComponent);
  const rows = COMPONENT_SEEDS.map((seed) => ({
    companyId,
    code: seed.code,
    name: seed.name,
    componentType: seed.componentType,
    frequency: seed.frequency,
    calculationMethod: seed.calculationMethod,
    taxTreatment: seed.taxTreatment,
    taxablePercentage: seed.taxablePercentage,
    pensionable: seed.pensionable,
    healthInsuranceApplicable: seed.healthInsuranceApplicable,
    includedInGross: seed.includedInGross,
    includedInNet: seed.includedInNet,
    includedInEmployerCost: seed.includedInEmployerCost,
    subjectToProration: seed.subjectToProration,
    allowManualInput: seed.allowManualInput,
    allowNegativeAmount: seed.allowNegativeAmount,
    calculationOrder: seed.calculationOrder,
    calculationConfiguration: {
      ...(seed.calculationConfiguration ?? {}),
      finance_verified: false,
      seed_review_required: true,
    },
    generalLedgerAccountCode: null,
    liabilityAccountCode: null,
    expenseAccountCode: null,
    isSystemComponent: seed.isSystemComponent,
    status: 'INACTIVE',
  }));
  await repository
    .createQueryBuilder()
    .insert()
    .into(PayrollComponent)
    .values(rows)
    .orIgnore()
    .execute();
}

export async function seedOnboardingDraft(
  manager: EntityManager,
  companyId: number,
): Promise<void> {
  const workflows = manager.getRepository(OnboardingWorkflow);
  if (
    await workflows.existsBy({ company_id: companyId, name: ONBOARDING_NAME })
  )
    return;
  const roles = manager.getRepository(Role);
  const workflow = await workflows.save(
    workflows.create({
      company_id: companyId,
      name: ONBOARDING_NAME,
      description:
        'Proposed workflow: review roles, documents and steps before activation.',
      is_default: false,
      status: OnboardingRecordStatusEnum.INACTIVE,
    }),
  );
  const steps = manager.getRepository(OnboardingWorkflowStep);
  for (const seed of ONBOARDING_STEPS) {
    const role = await roles.findOne({
      where: { company_id: companyId, name: seed.roleName },
    });
    await steps.save(
      steps.create({
        workflow_id: workflow.id,
        step_order: seed.stepOrder,
        name: seed.name,
        description: seed.description,
        step_type: seed.stepType,
        assigned_role_id: role?.id ?? null,
        assigned_user_id: null,
        is_required: seed.isRequired,
        due_days: seed.dueDays,
      }),
    );
  }
}

export async function seedOffboardingDraft(
  manager: EntityManager,
  companyId: number,
): Promise<void> {
  const workflows = manager.getRepository(OffboardingWorkflow);
  if (
    await workflows.existsBy({ company_id: companyId, name: OFFBOARDING_NAME })
  )
    return;
  const roles = manager.getRepository(Role);
  const workflow = await workflows.save(
    workflows.create({
      company_id: companyId,
      name: OFFBOARDING_NAME,
      description:
        'Proposed workflow: review roles, clearance tasks and steps before activation.',
      is_default: false,
      status: OffboardingRecordStatusEnum.INACTIVE,
    }),
  );
  const steps = manager.getRepository(OffboardingWorkflowStep);
  for (const seed of OFFBOARDING_STEPS) {
    const role = await roles.findOne({
      where: { company_id: companyId, name: seed.roleName },
    });
    await steps.save(
      steps.create({
        workflow_id: workflow.id,
        approval_level: seed.approvalLevel,
        step_name: seed.stepName,
        task_title: seed.taskTitle,
        task_description: seed.taskDescription,
        task_type: seed.taskType,
        approver_type: seed.approverType,
        role_id: role?.id ?? null,
        action_type: seed.actionType,
        is_required: seed.isRequired,
        expected_duration_days: seed.expectedDurationDays,
      }),
    );
  }
}
