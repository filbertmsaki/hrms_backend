import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { OffboardingWorkflow } from '../../modules/hr/offboarding/entities/offboarding-workflow.entity';
import { OffboardingWorkflowStep } from '../../modules/hr/offboarding/entities/offboarding-workflow-step.entity';
import { OffboardingApprovalActionTypeEnum } from '../../modules/hr/offboarding/enums/offboarding-approval-action-type.enum';
import { OffboardingApproverTypeEnum } from '../../modules/hr/offboarding/enums/offboarding-approver-type.enum';
import { OffboardingTaskTypeEnum } from '../../modules/hr/offboarding/enums/offboarding-task-type.enum';
import { OffboardingRecordStatusEnum } from '../../modules/hr/offboarding/enums/offboarding-record-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type OffboardingStepSeed = {
  approvalLevel: number;
  stepName: string;
  taskTitle: string;
  taskDescription: string;
  taskType: OffboardingTaskTypeEnum;
  approverType: OffboardingApproverTypeEnum;
  roleName: string;
  actionType: OffboardingApprovalActionTypeEnum;
  isRequired: boolean;
  expectedDurationDays: number;
};

const WORKFLOW_NAME = 'Standard Employee Offboarding Workflow';

const STEP_SEEDS: OffboardingStepSeed[] = [
  {
    approvalLevel: 1,
    stepName: 'HR Offboarding Review',
    taskTitle: 'Review offboarding request and initiate process',
    taskDescription: 'HR Officer reviews the offboarding request, confirms exit date, and triggers the clearance process.',
    taskType: OffboardingTaskTypeEnum.HR,
    approverType: OffboardingApproverTypeEnum.ROLE,
    roleName: 'HR_OFFICER',
    actionType: OffboardingApprovalActionTypeEnum.VERIFY,
    isRequired: true,
    expectedDurationDays: 2,
  },
  {
    approvalLevel: 2,
    stepName: 'IT Access Revocation',
    taskTitle: 'Revoke system access and collect IT equipment',
    taskDescription: 'IT Administrator revokes all system access, deactivates accounts, and collects company IT equipment.',
    taskType: OffboardingTaskTypeEnum.IT,
    approverType: OffboardingApproverTypeEnum.ROLE,
    roleName: 'DEPARTMENT_MANAGER',
    actionType: OffboardingApprovalActionTypeEnum.VERIFY,
    isRequired: true,
    expectedDurationDays: 3,
  },
  {
    approvalLevel: 3,
    stepName: 'Finance Settlement',
    taskTitle: 'Process final pay and outstanding settlements',
    taskDescription: 'HR Manager confirms all financial obligations including final salary, leave encashment, and outstanding advances.',
    taskType: OffboardingTaskTypeEnum.FINANCE,
    approverType: OffboardingApproverTypeEnum.ROLE,
    roleName: 'HR_MANAGER',
    actionType: OffboardingApprovalActionTypeEnum.VERIFY,
    isRequired: true,
    expectedDurationDays: 5,
  },
  {
    approvalLevel: 4,
    stepName: 'Manager Final Clearance',
    taskTitle: 'Final departmental clearance and handover sign-off',
    taskDescription: 'HR Manager confirms all departmental handover tasks are complete and approves the final clearance.',
    taskType: OffboardingTaskTypeEnum.MANAGER,
    approverType: OffboardingApproverTypeEnum.ROLE,
    roleName: 'HR_MANAGER',
    actionType: OffboardingApprovalActionTypeEnum.APPROVE,
    isRequired: true,
    expectedDurationDays: 2,
  },
];

export default class OffboardingWorkflowSeeder implements Seeder {
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
      const workflowRepo = qr.manager.getRepository(OffboardingWorkflow);
      const stepRepo = qr.manager.getRepository(OffboardingWorkflowStep);

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
          description: 'Default offboarding workflow for all departing employees.',
          is_default: true,
          status: OffboardingRecordStatusEnum.ACTIVE,
        });
      } else {
        workflow.is_default = true;
        workflow.status = OffboardingRecordStatusEnum.ACTIVE;
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
        `[Seeder][OffboardingWorkflow] Upserted "${WORKFLOW_NAME}" with ${STEP_SEEDS.length} steps`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][OffboardingWorkflow] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
