import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { LeaveApprovalWorkflow } from '../../modules/hr/leave/entities/leave-approval-workflow.entity';
import { LeaveApprovalWorkflowStep } from '../../modules/hr/leave/entities/leave-approval-workflow-step.entity';
import { LeaveApprovalActionTypeEnum } from '../../modules/hr/leave/enums/leave-approval-action-type.enum';
import { LeaveApproverTypeEnum } from '../../modules/hr/leave/enums/leave-approver-type.enum';
import { LeaveRecordStatusEnum } from '../../modules/hr/leave/enums/leave-record-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type WorkflowStepSeed = {
  approvalLevel: number;
  approverType: LeaveApproverTypeEnum;
  roleName: string;
  actionType: LeaveApprovalActionTypeEnum;
  isRequired: boolean;
};

const WORKFLOW_NAME = 'Default Leave Approval Workflow';

// Level 1 is informational/reporting only: the department-manager step is now
// resolved at runtime from departments.manager_employee_id, not from this row.
const WORKFLOW_STEP_SEEDS: WorkflowStepSeed[] = [
  {
    approvalLevel: 1,
    approverType: LeaveApproverTypeEnum.ROLE,
    roleName: 'DEPARTMENT_MANAGER',
    actionType: LeaveApprovalActionTypeEnum.APPROVE,
    isRequired: true,
  },
  {
    approvalLevel: 2,
    approverType: LeaveApproverTypeEnum.ROLE,
    roleName: 'HR_MANAGER',
    actionType: LeaveApprovalActionTypeEnum.APPROVE,
    isRequired: true,
  },
];

export default class LeaveWorkflowsSeeder implements Seeder {
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
      const workflowRepo = qr.manager.getRepository(LeaveApprovalWorkflow);
      const stepRepo = qr.manager.getRepository(LeaveApprovalWorkflowStep);

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

      // Create the workflow only if it does not already exist (leave_type_id = null means default)
      let workflow = await workflowRepo.findOne({
        where: { company_id: company.id, name: WORKFLOW_NAME },
      });
      const workflowAlreadyExisted = !!workflow;
      if (!workflow) {
        workflow = workflowRepo.create({
          company_id: company.id,
          name: WORKFLOW_NAME,
          leave_type_id: null,
          is_default: true,
          status: LeaveRecordStatusEnum.ACTIVE,
        });
        await workflowRepo.save(workflow);
      }

      // Create steps only if missing
      let createdStepCount = 0;
      for (const seed of WORKFLOW_STEP_SEEDS) {
        const role = await roleRepo.findOne({
          where: { name: seed.roleName, company_id: company.id },
        });

        const step = await stepRepo.findOne({
          where: {
            workflow_id: workflow.id,
            approval_level: seed.approvalLevel,
          },
        });
        if (!step) {
          await stepRepo.save(
            stepRepo.create({
              workflow_id: workflow.id,
              approval_level: seed.approvalLevel,
              approver_type: seed.approverType,
              role_id: role?.id ?? null,
              action_type: seed.actionType,
              is_required: seed.isRequired,
            }),
          );
          createdStepCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeaveWorkflows] ${workflowAlreadyExisted ? `Workflow "${WORKFLOW_NAME}" already existed, left unchanged` : `Created workflow "${WORKFLOW_NAME}"`}; created ${createdStepCount} new steps (${WORKFLOW_STEP_SEEDS.length - createdStepCount} already existed, left unchanged)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][LeaveWorkflows] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
