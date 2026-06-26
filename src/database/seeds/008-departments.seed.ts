import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Company } from '../../modules/companies/entities/company.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
  ALLIANCE_DEPARTMENTS,
} from './company-structure.constants';

export default class DepartmentsSeeder implements Seeder {
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
      const deptRepo = qr.manager.getRepository(Department);

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

      const branches = await branchRepo.find({
        where: { company_id: company.id },
      });
      const branchMap = new Map(branches.map((b) => [b.code!, b]));

      for (const seed of ALLIANCE_DEPARTMENTS) {
        const branch = branchMap.get(seed.branchCode) ?? null;

        let dept = await deptRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!dept) {
          dept = deptRepo.create({
            company_id: company.id,
            branch_id: branch?.id ?? null,
            name: seed.name,
            code: seed.code,
            description: seed.description ?? null,
            status: 'active',
          });
        } else {
          dept.name = seed.name;
          dept.branch_id = branch?.id ?? null;
          dept.description = seed.description ?? null;
          dept.status = 'active';
        }

        await deptRepo.save(dept);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Departments] Upserted ${ALLIANCE_DEPARTMENTS.length} departments for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Departments] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
