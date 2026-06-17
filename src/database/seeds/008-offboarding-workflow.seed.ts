import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { OffboardingRecordStatusEnum } from '../../modules/hr/offboarding/enums/offboarding-record-status.enum';
import { OffboardingWorkflow } from '../../modules/hr/offboarding/entities/offboarding-workflow.entity';
import {
  DEFAULT_OFFBOARDING_WORKFLOW_NAME,
  OFFBOARDING_SEED_COMPANY_ID,
} from './offboarding-seed.constants';

export default class OffboardingWorkflowSeeder implements Seeder {
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
      const workflowRepo = manager.getRepository(OffboardingWorkflow);

      await this.ensureCompanyExists(companyRepo, OFFBOARDING_SEED_COMPANY_ID);
      const workflow = await this.ensureWorkflow(
        workflowRepo,
        OFFBOARDING_SEED_COMPANY_ID,
      );

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][OffboardingWorkflow] Upserted workflow "${workflow.name}" (id=${workflow.id})`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][OffboardingWorkflow] Failed:', error);
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
    workflowRepo: Repository<OffboardingWorkflow>,
    companyId: number,
  ): Promise<OffboardingWorkflow> {
    await workflowRepo.update(
      { company_id: companyId, is_default: true },
      { is_default: false },
    );

    let workflow = await workflowRepo.findOne({
      where: {
        company_id: companyId,
        name: DEFAULT_OFFBOARDING_WORKFLOW_NAME,
      },
    });

    if (!workflow) {
      workflow = workflowRepo.create({
        company_id: companyId,
        name: DEFAULT_OFFBOARDING_WORKFLOW_NAME,
      });
    }

    workflow.description =
      'Default enterprise offboarding workflow covering HR, IT, finance, manager, and final clearance gates.';
    workflow.status = OffboardingRecordStatusEnum.ACTIVE;
    workflow.is_default = true;
    workflow.created_by_company_user_id = null;

    return workflowRepo.save(workflow);
  }
}
