import { DataSource, In, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { OffboardingApprovalActionTypeEnum } from '../../modules/hr/offboarding/enums/offboarding-approval-action-type.enum';
import { OffboardingApproverTypeEnum } from '../../modules/hr/offboarding/enums/offboarding-approver-type.enum';
import { OffboardingTaskTypeEnum } from '../../modules/hr/offboarding/enums/offboarding-task-type.enum';
import { OffboardingWorkflowStep } from '../../modules/hr/offboarding/entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from '../../modules/hr/offboarding/entities/offboarding-workflow.entity';
import {
  DEFAULT_OFFBOARDING_WORKFLOW_NAME,
  OFFBOARDING_SEED_COMPANY_ID,
} from './offboarding-seed.constants';

type WorkflowStepSeed = {
  approval_level: number;
  step_name: string;
  task_title: string;
  task_description: string;
  task_type: OffboardingTaskTypeEnum;
  approver_type: OffboardingApproverTypeEnum;
  role_name: string;
  action_type: OffboardingApprovalActionTypeEnum;
  assigned_department_code?: string;
  expected_duration_days?: number;
};

const WORKFLOW_STEP_SEEDS: WorkflowStepSeed[] = [
  {
    approval_level: 1,
    step_name: 'HR Offboarding Review',
    task_title: 'Validate offboarding request package',
    task_description:
      'Review resignation or termination details, legal requirements, and exit timeline.',
    task_type: OffboardingTaskTypeEnum.HR,
    approver_type: OffboardingApproverTypeEnum.ROLE,
    role_name: 'HR_OFFICER',
    action_type: OffboardingApprovalActionTypeEnum.VERIFY,
    assigned_department_code: 'HR',
    expected_duration_days: 1,
  },
  {
    approval_level: 2,
    step_name: 'IT Access Revocation',
    task_title: 'Revoke user accounts and system access',
    task_description:
      'Disable email, VPN, internal applications, and related digital access.',
    task_type: OffboardingTaskTypeEnum.IT,
    approver_type: OffboardingApproverTypeEnum.ROLE,
    role_name: 'IT_ADMINISTRATOR',
    action_type: OffboardingApprovalActionTypeEnum.VERIFY,
    assigned_department_code: 'IT',
    expected_duration_days: 1,
  },
  {
    approval_level: 3,
    step_name: 'Finance Settlement',
    task_title: 'Process final settlement and recoverables',
    task_description:
      'Settle payroll, deductions, reimbursements, and financial clearances.',
    task_type: OffboardingTaskTypeEnum.FINANCE,
    approver_type: OffboardingApproverTypeEnum.ROLE,
    role_name: 'HR_MANAGER',
    action_type: OffboardingApprovalActionTypeEnum.VERIFY,
    expected_duration_days: 2,
  },
  {
    approval_level: 4,
    step_name: 'Manager Final Clearance',
    task_title: 'Approve team and handover clearance',
    task_description:
      'Confirm handover completeness and team-level signoff before closure.',
    task_type: OffboardingTaskTypeEnum.MANAGER,
    approver_type: OffboardingApproverTypeEnum.ROLE,
    role_name: 'HR_MANAGER',
    action_type: OffboardingApprovalActionTypeEnum.APPROVE,
    expected_duration_days: 1,
  },
];

export default class OffboardingWorkflowStepsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
      const workflowRepo = manager.getRepository(OffboardingWorkflow);
      const stepRepo = manager.getRepository(OffboardingWorkflowStep);
      const roleRepo = manager.getRepository(Role);
      const departmentRepo = manager.getRepository(Department);
      const companyUserRoleRepo = manager.getRepository(CompanyUserRole);
      const companyUserRepo = manager.getRepository(CompanyUser);

      const workflow = await this.findWorkflowOrFail(
        workflowRepo,
        OFFBOARDING_SEED_COMPANY_ID,
      );
      this.validateApprovalLevels(WORKFLOW_STEP_SEEDS);

      const roleMap = await this.resolveRoles(roleRepo, OFFBOARDING_SEED_COMPANY_ID);
      const departmentMap = await this.resolveDepartments(
        departmentRepo,
        OFFBOARDING_SEED_COMPANY_ID,
      );
      await this.assertRolesHaveApprovers(
        companyUserRoleRepo,
        companyUserRepo,
        roleMap,
        OFFBOARDING_SEED_COMPANY_ID,
      );

      await this.syncWorkflowSteps(stepRepo, workflow.id, roleMap, departmentMap);

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][OffboardingWorkflowSteps] Synced ${WORKFLOW_STEP_SEEDS.length} step(s) for workflow_id=${workflow.id}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][OffboardingWorkflowSteps] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private validateApprovalLevels(seeds: WorkflowStepSeed[]): void {
    const levels = seeds.map((seed) => seed.approval_level).sort((a, b) => a - b);
    const uniqueLevels = new Set(levels);
    if (levels.length !== uniqueLevels.size) {
      throw new Error('Offboarding workflow steps contain duplicate approval_level values');
    }

    for (let index = 0; index < levels.length; index += 1) {
      if (levels[index] !== index + 1) {
        throw new Error('Offboarding workflow approval_level must be sequential from 1 to N');
      }
    }
  }

  private async findWorkflowOrFail(
    workflowRepo: Repository<OffboardingWorkflow>,
    companyId: number,
  ): Promise<OffboardingWorkflow> {
    const workflow = await workflowRepo.findOne({
      where: {
        company_id: companyId,
        name: DEFAULT_OFFBOARDING_WORKFLOW_NAME,
      },
    });

    if (!workflow) {
      throw new Error(
        `Workflow "${DEFAULT_OFFBOARDING_WORKFLOW_NAME}" not found. Run 008-offboarding-workflow.seed first.`,
      );
    }

    return workflow;
  }

  private async resolveRoles(
    roleRepo: Repository<Role>,
    companyId: number,
  ): Promise<Map<string, Role>> {
    const names = [...new Set(WORKFLOW_STEP_SEEDS.map((step) => step.role_name))];
    const roles = await roleRepo.find({
      where: {
        company_id: companyId,
        name: In(names),
      },
    });

    const roleMap = new Map<string, Role>();
    roles.forEach((role) => roleMap.set(role.name, role));

    for (const name of names) {
      if (!roleMap.has(name)) {
        throw new Error(`Required role "${name}" not found.`);
      }
    }

    return roleMap;
  }

  private async resolveDepartments(
    departmentRepo: Repository<Department>,
    companyId: number,
  ): Promise<Map<string, Department>> {
    const codes = [
      ...new Set(
        WORKFLOW_STEP_SEEDS.map((step) => step.assigned_department_code).filter(
          (value): value is string => typeof value === 'string' && value.length > 0,
        ),
      ),
    ];

    const map = new Map<string, Department>();
    if (!codes.length) {
      return map;
    }

    const departments = await departmentRepo.find({
      where: {
        company_id: companyId,
      },
    });

    for (const department of departments) {
      if (department.code) {
        map.set(department.code.toUpperCase(), department);
      }
    }

    for (const code of codes) {
      if (!map.has(code.toUpperCase())) {
        throw new Error(`Department code "${code}" not found for company_id=${companyId}.`);
      }
    }

    return map;
  }

  private async assertRolesHaveApprovers(
    companyUserRoleRepo: Repository<CompanyUserRole>,
    companyUserRepo: Repository<CompanyUser>,
    roleMap: Map<string, Role>,
    companyId: number,
  ): Promise<void> {
    for (const [roleName, role] of roleMap.entries()) {
      const assignments = await companyUserRoleRepo.find({
        where: { role_id: role.id },
      });
      if (!assignments.length) {
        throw new Error(`Role "${roleName}" has no company user assignment.`);
      }

      const companyUserIds = assignments.map((assignment) => assignment.company_user_id);
      const activeCount = await companyUserRepo.count({
        where: {
          id: In(companyUserIds),
          company_id: companyId,
          status: 'active',
        },
      });
      if (!activeCount) {
        throw new Error(`Role "${roleName}" has no active company users in company_id=${companyId}.`);
      }
    }
  }

  private async syncWorkflowSteps(
    stepRepo: Repository<OffboardingWorkflowStep>,
    workflowId: number,
    roleMap: Map<string, Role>,
    departmentMap: Map<string, Department>,
  ): Promise<void> {
    const desiredLevels = WORKFLOW_STEP_SEEDS.map((seed) => seed.approval_level);
    const existingSteps = await stepRepo.find({
      where: { workflow_id: workflowId },
    });

    for (const seed of WORKFLOW_STEP_SEEDS) {
      const role = roleMap.get(seed.role_name)!;
      const department = seed.assigned_department_code
        ? departmentMap.get(seed.assigned_department_code.toUpperCase()) ?? null
        : null;

      let step = existingSteps.find(
        (candidate) => candidate.approval_level === seed.approval_level,
      );
      if (!step) {
        step = stepRepo.create({
          workflow_id: workflowId,
          approval_level: seed.approval_level,
        });
      }

      step.step_name = seed.step_name;
      step.task_title = seed.task_title;
      step.task_description = seed.task_description;
      step.task_type = seed.task_type;
      step.approver_type = seed.approver_type;
      step.role_id = role.id;
      step.position_id = null;
      step.company_user_id = null;
      step.action_type = seed.action_type;
      step.is_required = true;
      step.assigned_department_id = department?.id ?? null;
      step.assigned_branch_id = null;
      step.expected_duration_days = seed.expected_duration_days ?? null;

      await stepRepo.save(step);
      console.log(
        `[Seeder][OffboardingWorkflowSteps] Upserted level=${seed.approval_level} role=${seed.role_name}`,
      );
    }

    const obsoleteStepIds = existingSteps
      .filter((step) => !desiredLevels.includes(step.approval_level))
      .map((step) => step.id);

    if (obsoleteStepIds.length) {
      await stepRepo.delete({ id: In(obsoleteStepIds) });
      console.log(
        `[Seeder][OffboardingWorkflowSteps] Removed ${obsoleteStepIds.length} obsolete step(s)`,
      );
    }
  }
}
