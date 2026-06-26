import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { OnboardingWorkflow } from '../../modules/hr/onboarding/entities/onboarding-workflow.entity';
import { OnboardingWorkflowStep } from '../../modules/hr/onboarding/entities/onboarding-workflow-step.entity';
import { OnboardingApprovalActionTypeEnum } from '../../modules/hr/onboarding/enums/onboarding-approval-action-type.enum';
import { OnboardingApproverTypeEnum } from '../../modules/hr/onboarding/enums/onboarding-approver-type.enum';
import { OnboardingTaskTypeEnum } from '../../modules/hr/onboarding/enums/onboarding-task-type.enum';
import { OnboardingRecordStatusEnum } from '../../modules/hr/onboarding/enums/onboarding-record-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type OnboardingStepSeed = {
  approvalLevel: number;
  stepName: string;
  taskTitle: string;
  taskDescription: string;
  taskType: OnboardingTaskTypeEnum;
  approverType: OnboardingApproverTypeEnum;
  roleName: string;
  actionType: OnboardingApprovalActionTypeEnum;
  isRequired: boolean;
  expectedDurationDays: number;
};

const WORKFLOW_NAME = 'Standard Employee Onboarding Workflow';

const STEP_SEEDS: OnboardingStepSeed[] = [
  {
    approvalLevel: 1,
    stepName: 'HR Document Verification',
    taskTitle: 'Verify employee onboarding documents',
    taskDescription: 'HR Officer reviews and verifies all required onboarding documents submitted by the new employee.',
    taskType: OnboardingTaskTypeEnum.HR,
    approverType: OnboardingApproverTypeEnum.ROLE,
    roleName: 'HR_OFFICER',
    actionType: OnboardingApprovalActionTypeEnum.VERIFY,
    isRequired: true,
    expectedDurationDays: 2,
  },
  {
    approvalLevel: 2,
    stepName: 'IT Setup',
    taskTitle: 'Set up IT equipment and system access',
    taskDescription: 'IT Administrator provisions workstation, email, system access, and access control credentials.',
    taskType: OnboardingTaskTypeEnum.IT,
    approverType: OnboardingApproverTypeEnum.ROLE,
    roleName: 'IT_ADMINISTRATOR',
    actionType: OnboardingApprovalActionTypeEnum.RECOMMEND,
    isRequired: true,
    expectedDurationDays: 3,
  },
  {
    approvalLevel: 3,
    stepName: 'Security Training',
    taskTitle: 'Complete security and compliance training',
    taskDescription: 'Senior Employee conducts or confirms completion of security and workplace compliance training.',
    taskType: OnboardingTaskTypeEnum.GENERAL,
    approverType: OnboardingApproverTypeEnum.ROLE,
    roleName: 'SENIOR_EMPLOYEE',
    actionType: OnboardingApprovalActionTypeEnum.RECOMMEND,
    isRequired: true,
    expectedDurationDays: 2,
  },
  {
    approvalLevel: 4,
    stepName: 'Manager Approval',
    taskTitle: 'Manager review and departmental sign-off',
    taskDescription: 'HR Manager reviews the onboarding checklist and provides departmental approval.',
    taskType: OnboardingTaskTypeEnum.MANAGER,
    approverType: OnboardingApproverTypeEnum.ROLE,
    roleName: 'HR_MANAGER',
    actionType: OnboardingApprovalActionTypeEnum.APPROVE,
    isRequired: true,
    expectedDurationDays: 1,
  },
  {
    approvalLevel: 5,
    stepName: 'Final HR Activation',
    taskTitle: 'Activate employee profile and complete onboarding',
    taskDescription: 'HR Manager performs final activation of the employee record and marks onboarding as complete.',
    taskType: OnboardingTaskTypeEnum.HR,
    approverType: OnboardingApproverTypeEnum.ROLE,
    roleName: 'HR_MANAGER',
    actionType: OnboardingApprovalActionTypeEnum.APPROVE,
    isRequired: true,
    expectedDurationDays: 1,
  },
];

export default class OnboardingWorkflowSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepo = qr.manager.getRepository(Company);
      const roleRepo = qr.manager.getRepository(Role);
      const workflowRepo = qr.manager.getRepository(OnboardingWorkflow);
      const stepRepo = qr.manager.getRepository(OnboardingWorkflowStep);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await companyRepo.findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      // Upsert workflow
      let workflow = await workflowRepo.findOne({
        where: { company_id: company.id, name: WORKFLOW_NAME },
      });
      if (!workflow) {
        workflow = workflowRepo.create({
          company_id: company.id,
          name: WORKFLOW_NAME,
          description: 'Default onboarding workflow for all new employees.',
          is_default: true,
          status: OnboardingRecordStatusEnum.ACTIVE,
        });
      } else {
        workflow.is_default = true;
        workflow.status = OnboardingRecordStatusEnum.ACTIVE;
      }
      await workflowRepo.save(workflow);

      // Upsert steps
      for (const seed of STEP_SEEDS) {
        const role = await roleRepo.findOne({
          where: { name: seed.roleName, company_id: company.id },
        });

        let step = await stepRepo.findOne({
          where: { workflow_id: workflow.id, approval_level: seed.approvalLevel },
        });
        if (!step) {
          step = stepRepo.create({
            workflow_id: workflow.id,
            approval_level: seed.approvalLevel,
          });
        }

        step.step_name = seed.stepName;
        step.task_title = seed.taskTitle;
        step.task_description = seed.taskDescription;
        step.task_type = seed.taskType;
        step.approver_type = seed.approverType;
        step.role_id = role?.id ?? null;
        step.action_type = seed.actionType;
        step.is_required = seed.isRequired;
        step.expected_duration_days = seed.expectedDurationDays;

        await stepRepo.save(step);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][OnboardingWorkflow] Upserted "${WORKFLOW_NAME}" with ${STEP_SEEDS.length} steps`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][OnboardingWorkflow] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
