import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_BRANCHES,
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

export default class BranchesSeeder implements Seeder {
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
      const branchRepo = qr.manager.getRepository(Branch);

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

      let createdCount = 0;
      for (const seed of ALLIANCE_BRANCHES) {
        const branch = await branchRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!branch) {
          await branchRepo.save(
            branchRepo.create({
              company_id: company.id,
              name: seed.name,
              code: seed.code,
              city: seed.city ?? null,
              country: 'Tanzania',
              status: 'active',
            }),
          );
          createdCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Branches] Created ${createdCount} new branches (${ALLIANCE_BRANCHES.length - createdCount} already existed, left unchanged) for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Branches] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
