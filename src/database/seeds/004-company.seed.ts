import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

export default class CompanySeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const repo = qr.manager.getRepository(Company);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const slug = ALLIANCE_COMPANY_SLUG;

      let company = await repo.findOne({ where: { slug } });

      if (!company) {
        company = repo.create({
          name: companyName,
          slug,
          status: 'active',
          metadata: { seeded: true, source: '004-company' },
        });
      } else {
        company.name = companyName;
        company.status = 'active';
      }

      await repo.save(company);

      await qr.commitTransaction();
      console.log(
        `[Seeder][Company] Upserted company: ${company.name} (${company.slug})`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Company] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
