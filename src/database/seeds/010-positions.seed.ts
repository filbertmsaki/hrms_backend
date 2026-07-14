import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
  ALLIANCE_POSITIONS,
} from './company-structure.constants';

export default class PositionsSeeder implements Seeder {
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
      const deptRepo = qr.manager.getRepository(Department);
      const positionRepo = qr.manager.getRepository(Position);

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

      const depts = await deptRepo.find({ where: { company_id: company.id } });
      const deptMap = new Map(depts.map((d) => [d.code!, d]));

      // Pass 1: upsert all positions (without reports_to_position_id — parent may not exist yet)
      for (const seed of ALLIANCE_POSITIONS) {
        const dept = seed.departmentCode
          ? (deptMap.get(seed.departmentCode) ?? null)
          : null;

        let position = await positionRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!position) {
          position = positionRepo.create({
            company_id: company.id,
            department_id: dept?.id ?? null,
            name: seed.name,
            code: seed.code,
            level: seed.level,
            is_manager: seed.isManager,
            description: seed.description ?? null,
            status: 'active',
            is_active: true,
            headcount: seed.headcount ?? 1,
          });
        } else {
          position.department_id = dept?.id ?? null;
          position.name = seed.name;
          position.level = seed.level;
          position.is_manager = seed.isManager;
          position.description = seed.description ?? null;
          position.status = 'active';
          position.is_active = true;
          if (seed.headcount !== undefined) {
            position.headcount = seed.headcount;
          }
        }

        await positionRepo.save(position);
      }

      // Pass 2: set reports_to_position_id now that all positions exist
      const allPositions = await positionRepo.find({
        where: { company_id: company.id },
      });
      const positionByCode = new Map(allPositions.map((p) => [p.code!, p]));

      for (const seed of ALLIANCE_POSITIONS) {
        if (!seed.reportsToPositionCode) continue;

        const position = positionByCode.get(seed.code);
        const reportsTo = positionByCode.get(seed.reportsToPositionCode);
        if (!position || !reportsTo) continue;

        if (position.reports_to_position_id !== reportsTo.id) {
          position.reports_to_position_id = reportsTo.id;
          await positionRepo.save(position);
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Positions] Upserted ${ALLIANCE_POSITIONS.length} positions for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Positions] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
