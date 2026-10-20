import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { provisionDefaultWorkforceReportPacksForCompany } from '../../modules/scheduled-reporting/utils/provision-default-workforce-report-packs.util';

/** Idempotently adds inactive provisional reporting templates for companies. */
export default class WorkforceReportPacksSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const companies = await queryRunner.manager
        .getRepository(Company)
        .find({ select: ['id'] });
      for (const company of companies) {
        await provisionDefaultWorkforceReportPacksForCompany(
          queryRunner.manager,
          company.id,
        );
      }
      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][WorkforceReportPacks] Provisioned provisional inactive report templates for ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'}.`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][WorkforceReportPacks] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
