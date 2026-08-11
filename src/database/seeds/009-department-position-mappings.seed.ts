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

const REQUIRED_STANDARD_POSITION_CODES = [
  'SENIOR_MANAGER',
  'MANAGER',
  'ASSISTANT_MANAGER',
  'SENIOR_EXECUTIVE',
  'EXECUTIVE',
] as const;

const OPTIONAL_STANDARD_POSITION_CODES = ['DEPUTY_MANAGER'] as const;

type DepartmentPositionSeedCandidate = {
  departmentCode: string;
  positionCode: string;
  source: 'existing_matrix' | 'required_standard' | 'optional_standard';
};

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
        where: { company_id: company.id, status: 'active' },
      });
      const positions = await positionRepo.find({
        where: { company_id: company.id, status: 'active', is_active: true },
      });
      const existingMappings = await departmentPositionRepo.find({
        where: { company_id: company.id },
      });

      const departmentMap = new Map(
        departments
          .filter((department) => Boolean(department.code))
          .map((department) => [department.code!, department]),
      );
      const positionMap = new Map(
        positions
          .filter((position) => Boolean(position.code))
          .map((position) => [position.code!, position]),
      );
      const existingKeys = new Set(
        existingMappings.map(
          (mapping) =>
            `${mapping.company_id}:${mapping.department_id}:${mapping.position_id}`,
        ),
      );
      const missingRequiredPositions = REQUIRED_STANDARD_POSITION_CODES.filter(
        (code) => !positionMap.has(code),
      );
      const missingOptionalPositions = OPTIONAL_STANDARD_POSITION_CODES.filter(
        (code) => !positionMap.has(code),
      );
      const candidates = this.buildCandidates(Array.from(departmentMap.keys()));
      const seenCandidates = new Set<string>();
      let createdCount = 0;

      if (missingRequiredPositions.length > 0) {
        console.warn(
          `[Seeder][DepartmentPositions] Missing required existing positions for company "${company.name}": ${missingRequiredPositions.join(', ')}`,
        );
      }

      if (missingOptionalPositions.length > 0) {
        console.warn(
          `[Seeder][DepartmentPositions] Missing optional existing positions for company "${company.name}": ${missingOptionalPositions.join(', ')}`,
        );
      }

      for (const candidate of candidates) {
        const candidateKey = `${candidate.departmentCode}:${candidate.positionCode}`;
        if (seenCandidates.has(candidateKey)) {
          continue;
        }
        seenCandidates.add(candidateKey);

        const department = departmentMap.get(candidate.departmentCode);
        const position = positionMap.get(candidate.positionCode);

        if (!department) {
          console.warn(
            `[Seeder][DepartmentPositions] Skipped mapping because department "${candidate.departmentCode}" was not found among active departments.`,
          );
          continue;
        }

        if (!position) {
          console.warn(
            `[Seeder][DepartmentPositions] Skipped mapping because position "${candidate.positionCode}" was not found among active positions.`,
          );
          continue;
        }

        const existingKey = `${company.id}:${department.id}:${position.id}`;

        if (!existingKeys.has(existingKey)) {
          await departmentPositionRepo.save(
            departmentPositionRepo.create({
              company_id: company.id,
              department_id: department.id,
              position_id: position.id,
            }),
          );
          existingKeys.add(existingKey);
          createdCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][DepartmentPositions] Ensured ${seenCandidates.size} candidate mappings for company "${company.name}". Created ${createdCount} new mappings.`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][DepartmentPositions] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }

  private buildCandidates(
    departmentCodes: string[],
  ): DepartmentPositionSeedCandidate[] {
    return [
      ...ALLIANCE_DEPARTMENT_POSITIONS.map((seed) => ({
        ...seed,
        source: 'existing_matrix' as const,
      })),
      ...departmentCodes.flatMap((departmentCode) =>
        REQUIRED_STANDARD_POSITION_CODES.map((positionCode) => ({
          departmentCode,
          positionCode,
          source: 'required_standard' as const,
        })),
      ),
      ...departmentCodes.flatMap((departmentCode) =>
        OPTIONAL_STANDARD_POSITION_CODES.map((positionCode) => ({
          departmentCode,
          positionCode,
          source: 'optional_standard' as const,
        })),
      ),
    ];
  }
}
