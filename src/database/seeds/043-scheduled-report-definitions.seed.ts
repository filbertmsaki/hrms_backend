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

      const existingDefinitions = await repository.find({
        select: ['reportCode'],
      });
      const existingCodes = new Set(
        existingDefinitions.map((d) => d.reportCode),
      );

      const newDefinitions = REGISTERED_REPORT_DEFINITIONS.filter(
        (definition) => !existingCodes.has(definition.reportCode),
      ).map((definition) => ({
        reportCode: definition.reportCode,
        name: definition.name,
        description: definition.description,
        supportedFilters: {
          fields: definition.supportedFilterFields,
        },
        supportedFormats: definition.supportedFormats,
        generatorService: definition.generatorService,
        isActive: true,
      }));

      if (newDefinitions.length > 0) {
        await repository.insert(newDefinitions);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][ScheduledReportDefinitions] Created ${newDefinitions.length} new scheduled report definition(s) (${REGISTERED_REPORT_DEFINITIONS.length - newDefinitions.length} already existed, left unchanged)`,
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
