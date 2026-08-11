import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { ReportDefinition } from '../../modules/scheduled-reporting/entities/report-definition.entity';
import { REGISTERED_REPORT_DEFINITIONS } from '../../modules/scheduled-reporting/services/report-registry.service';

export default class ScheduledReportDefinitionsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const repository = qr.manager.getRepository(ReportDefinition);

      await repository.upsert(
        REGISTERED_REPORT_DEFINITIONS.map((definition) => ({
          reportCode: definition.reportCode,
          name: definition.name,
          description: definition.description,
          supportedFilters: {
            fields: definition.supportedFilterFields,
          },
          supportedFormats: definition.supportedFormats,
          generatorService: definition.generatorService,
          isActive: true,
        })),
        ['reportCode'],
      );

      await qr.commitTransaction();
      console.log(
        `[Seeder][ScheduledReportDefinitions] Upserted ${REGISTERED_REPORT_DEFINITIONS.length} scheduled report definition(s)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][ScheduledReportDefinitions] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
