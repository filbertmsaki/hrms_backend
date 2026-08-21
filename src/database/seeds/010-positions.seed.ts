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

      let createdCount = 0;
      const newlyCreatedCodes = new Set<string>();
      for (const seed of ALLIANCE_POSITIONS) {
        const position = await positionRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!position) {
          await positionRepo.save(
            positionRepo.create({
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
            }),
          );
          createdCount += 1;
          newlyCreatedCodes.add(seed.code);
        }
      }

      // Set reports-to relationships only for positions created just now;
      // existing positions are left completely unchanged.
      if (newlyCreatedCodes.size > 0) {
        const allPositions = await positionRepo.find({
          where: { company_id: company.id },
        });
        const positionByCode = new Map(
          allPositions.map((position) => [position.code!, position]),
        );

        for (const seed of ALLIANCE_POSITIONS) {
          if (!newlyCreatedCodes.has(seed.code)) {
            continue;
          }
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
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Positions] Created ${createdCount} new positions (${ALLIANCE_POSITIONS.length - createdCount} already existed, left unchanged) for company "${company.name}"`,
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
