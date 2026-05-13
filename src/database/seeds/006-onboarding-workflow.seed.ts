import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { OnboardingRecordStatusEnum } from '../../modules/hr/onboarding/enums/onboarding-record-status.enum';
import { OnboardingWorkflow } from '../../modules/hr/onboarding/entities/onboarding-workflow.entity';
import {
  ONBOARDING_SEED_COMPANY_ID,
  STANDARD_ONBOARDING_WORKFLOW_NAME,
} from './onboarding-seed.constants';

export default class OnboardingWorkflowSeeder implements Seeder {
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
      const companyRepo = manager.getRepository(Company);
      const workflowRepo = manager.getRepository(OnboardingWorkflow);

      await this.ensureCompanyExists(companyRepo, ONBOARDING_SEED_COMPANY_ID);
      const workflow = await this.ensureWorkflow(
        workflowRepo,
        ONBOARDING_SEED_COMPANY_ID,
      );

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][OnboardingWorkflow] Upserted workflow "${workflow.name}" (id=${workflow.id})`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][OnboardingWorkflow] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureCompanyExists(
    companyRepo: Repository<Company>,
    companyId: number,
  ): Promise<void> {
    const company = await companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new Error(
        `Company with id=${companyId} was not found. Seed base company first.`,
      );
    }
  }

  private async ensureWorkflow(
    workflowRepo: Repository<OnboardingWorkflow>,
    companyId: number,
  ): Promise<OnboardingWorkflow> {
    await workflowRepo.update(
      { company_id: companyId, is_default: true },
      { is_default: false },
    );

    let workflow = await workflowRepo.findOne({
      where: {
        company_id: companyId,
        name: STANDARD_ONBOARDING_WORKFLOW_NAME,
      },
    });

    if (!workflow) {
      workflow = workflowRepo.create({
        company_id: companyId,
        name: STANDARD_ONBOARDING_WORKFLOW_NAME,
      });
    }

    workflow.description =
      'Default enterprise onboarding workflow covering HR, IT, security, manager, and final activation gates.';
    workflow.status = OnboardingRecordStatusEnum.ACTIVE;
    workflow.is_default = true;

    return workflowRepo.save(workflow);
  }
}
