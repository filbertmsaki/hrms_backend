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

const WORKFLOW_STEP_SEEDS: WorkflowStepSeed[] = [
  {
    approvalLevel: 1,
    approverType: LeaveApproverTypeEnum.ROLE,
    roleName: 'HR_OFFICER',
    actionType: LeaveApprovalActionTypeEnum.RECOMMEND,
    isRequired: true,
  },
  {
    approvalLevel: 2,
    approverType: LeaveApproverTypeEnum.ROLE,
    roleName: 'HR_MANAGER',
    actionType: LeaveApprovalActionTypeEnum.VERIFY,
    isRequired: true,
  },
  {
    approvalLevel: 3,
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

      // Upsert the workflow (leave_type_id = null means default)
      let workflow = await workflowRepo.findOne({
        where: { company_id: company.id, name: WORKFLOW_NAME },
      });
      if (!workflow) {
        workflow = workflowRepo.create({
          company_id: company.id,
          name: WORKFLOW_NAME,
          leave_type_id: null,
          is_default: true,
          status: LeaveRecordStatusEnum.ACTIVE,
        });
      } else {
        workflow.is_default = true;
        workflow.status = LeaveRecordStatusEnum.ACTIVE;
      }
      await workflowRepo.save(workflow);

      // Upsert steps
      for (const seed of WORKFLOW_STEP_SEEDS) {
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

        step.approver_type = seed.approverType;
        step.role_id = role?.id ?? null;
        step.action_type = seed.actionType;
        step.is_required = seed.isRequired;

        await stepRepo.save(step);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][LeaveWorkflows] Upserted "${WORKFLOW_NAME}" with ${WORKFLOW_STEP_SEEDS.length} steps`,
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
