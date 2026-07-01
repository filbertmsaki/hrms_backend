import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { OnboardingWorkflow } from '../../modules/hr/onboarding/entities/onboarding-workflow.entity';
import { OnboardingWorkflowStep } from '../../modules/hr/onboarding/entities/onboarding-workflow-step.entity';
import { OnboardingStepTypeEnum } from '../../modules/hr/onboarding/enums/onboarding-step-type.enum';
import { OnboardingRecordStatusEnum } from '../../modules/hr/onboarding/enums/onboarding-record-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type OnboardingStepSeed = {
  stepOrder: number;
  name: string;
  description: string;
  stepType: OnboardingStepTypeEnum;
  roleName: string;
  isRequired: boolean;
  dueDays: number;
};

const WORKFLOW_NAME = 'Standard Employee Onboarding Workflow';

const STEP_SEEDS: OnboardingStepSeed[] = [
  {
    stepOrder: 1,
    name: 'HR Document Collection',
    description:
      'HR Officer collects and verifies all required onboarding documents: offer letter acceptance, ID copy, academic certificates, tax registration, bank details, and emergency contacts.',
    stepType: OnboardingStepTypeEnum.TASK,
    roleName: 'HR_OFFICER',
    isRequired: true,
    dueDays: 2,
  },
  {
    stepOrder: 2,
    name: 'HR Document Verification',
    description:
      'HR Officer reviews all submitted documents for completeness and authenticity. Signs off once all documents are confirmed valid.',
    stepType: OnboardingStepTypeEnum.SIGN_OFF,
    roleName: 'HR_OFFICER',
    isRequired: true,
    dueDays: 1,
  },
  {
    stepOrder: 3,
    name: 'IT Equipment & Access Setup',
    description:
      'IT Administrator provisions workstation, company email, system accounts, software licenses, and access control credentials (biometric enrollment, access card).',
    stepType: OnboardingStepTypeEnum.TASK,
    roleName: 'DEPARTMENT_MANAGER',
    isRequired: true,
    dueDays: 3,
  },
  {
    stepOrder: 4,
    name: 'IT Setup Sign-Off',
    description:
      'IT Administrator confirms all equipment is issued, accounts are active, and the employee has verified access to required systems.',
    stepType: OnboardingStepTypeEnum.SIGN_OFF,
    roleName: 'DEPARTMENT_MANAGER',
    isRequired: true,
    dueDays: 1,
  },
  {
    stepOrder: 5,
    name: 'Orientation & Induction',
    description:
      'Senior Employee conducts workplace orientation: company policies, code of conduct, HSE briefing, department tour, and introduction to team members.',
    stepType: OnboardingStepTypeEnum.TASK,
    roleName: 'DEPARTMENT_MANAGER',
    isRequired: true,
    dueDays: 2,
  },
  {
    stepOrder: 6,
    name: 'Manager Departmental Review',
    description:
      'HR Manager reviews the completed onboarding checklist, confirms all tasks are done, and provides departmental approval before final activation.',
    stepType: OnboardingStepTypeEnum.SIGN_OFF,
    roleName: 'HR_MANAGER',
    isRequired: true,
    dueDays: 1,
  },
  {
    stepOrder: 7,
    name: 'Final HR Activation',
    description:
      'HR Manager performs the final activation of the employee profile in the system, updates employment status to ACTIVE, and marks the onboarding as complete.',
    stepType: OnboardingStepTypeEnum.SIGN_OFF,
    roleName: 'HR_MANAGER',
    isRequired: true,
    dueDays: 1,
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
          description:
            'Standard onboarding workflow for all new employees. Covers document collection, IT setup, orientation, and final activation.',
          is_default: true,
          status: OnboardingRecordStatusEnum.ACTIVE,
        });
      } else {
        workflow.is_default = true;
        workflow.status = OnboardingRecordStatusEnum.ACTIVE;
      }
      await workflowRepo.save(workflow);

      // Delete existing steps and re-seed (idempotent)
      await stepRepo.delete({ workflow_id: workflow.id });

      for (const seed of STEP_SEEDS) {
        const role = await roleRepo.findOne({
          where: { name: seed.roleName, company_id: company.id },
        });

        await stepRepo.save(
          stepRepo.create({
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

      await qr.commitTransaction();
      console.log(
        `[Seeder][OnboardingWorkflow] Seeded "${WORKFLOW_NAME}" with ${STEP_SEEDS.length} steps`,
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
