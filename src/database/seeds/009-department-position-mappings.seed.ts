import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { DepartmentPosition } from '../../modules/hr/departments/entities/department-position.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
  ALLIANCE_DEPARTMENT_POSITIONS,
} from './company-structure.constants';

export default class DepartmentPositionMappingsSeeder implements Seeder {
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
      const departmentRepo = qr.manager.getRepository(Department);
      const positionRepo = qr.manager.getRepository(Position);
      const departmentPositionRepo =
        qr.manager.getRepository(DepartmentPosition);

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

      const departments = await departmentRepo.find({
        where: { company_id: company.id },
      });
      const positions = await positionRepo.find({
        where: { company_id: company.id },
      });

      const departmentMap = new Map(
        departments.map((department) => [department.code!, department]),
      );
      const positionMap = new Map(
        positions.map((position) => [position.code!, position]),
      );

      for (const seed of ALLIANCE_DEPARTMENT_POSITIONS) {
        const department = departmentMap.get(seed.departmentCode);
        const position = positionMap.get(seed.positionCode);

        if (!department) {
          throw new Error(
            `Department "${seed.departmentCode}" not found for department-position mapping.`,
          );
        }

        if (!position) {
          throw new Error(
            `Position "${seed.positionCode}" not found for department-position mapping.`,
          );
        }

        const existing = await departmentPositionRepo.findOne({
          where: {
            company_id: company.id,
            department_id: department.id,
            position_id: position.id,
          },
        });

        if (!existing) {
          await departmentPositionRepo.save(
            departmentPositionRepo.create({
              company_id: company.id,
              department_id: department.id,
              position_id: position.id,
            }),
          );
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][DepartmentPositions] Upserted ${ALLIANCE_DEPARTMENT_POSITIONS.length} mappings for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][DepartmentPositions] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
