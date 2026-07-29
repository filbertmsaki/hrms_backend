import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
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

      for (const seed of ALLIANCE_POSITIONS) {
        let position = await positionRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!position) {
          position = positionRepo.create({
            company_id: company.id,
            branch_id: null,
            department_id: null,
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
          position.branch_id = null;
          position.department_id = null;
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

      const allPositions = await positionRepo.find({
        where: { company_id: company.id },
      });
      const positionByCode = new Map(
        allPositions.map((position) => [position.code!, position]),
      );

      for (const seed of ALLIANCE_POSITIONS) {
        const position = positionByCode.get(seed.code);
        if (!position) {
          continue;
        }

        const reportsTo = seed.reportsToPositionCode
          ? (positionByCode.get(seed.reportsToPositionCode) ?? null)
          : null;

        if (position.reports_to_position_id !== (reportsTo?.id ?? null)) {
          position.reports_to_position_id = reportsTo?.id ?? null;
          await positionRepo.save(position);
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Positions] Upserted ${ALLIANCE_POSITIONS.length} reusable positions for company "${company.name}"`,
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
