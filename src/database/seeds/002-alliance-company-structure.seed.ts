import { DataSource, QueryDeepPartialEntity, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_BRANCHES,
  ALLIANCE_COMPANY_METADATA,
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_DEPARTMENTS,
  ALLIANCE_POSITIONS,
} from './company-structure.constants';

export default class AllianceCompanyStructureSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
      const companyRepo = manager.getRepository(Company);
      const branchRepo = manager.getRepository(Branch);
      const departmentRepo = manager.getRepository(Department);
      const positionRepo = manager.getRepository(Position);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await this.findExistingCompany(companyRepo, companyName);

      await this.syncBranches(branchRepo, company.id, ALLIANCE_BRANCHES);
      await this.syncDepartments(departmentRepo, company.id, ALLIANCE_DEPARTMENTS);
      await this.syncPositions(positionRepo, company.id, ALLIANCE_POSITIONS);

      await queryRunner.commitTransaction();
      console.log(`Seeded company structure for ${company.name}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Alliance structure seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findExistingCompany(
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<Company> {
    const normalizedName = companyName.trim();

    const company = await companyRepo.findOne({
      where: { name: normalizedName },
    });

    if (!company) {
      throw new Error(
        'Default company not found. Please run 001-initial-rbac.seed.ts first to create the Alliance company.',
      );
    }

    return company;
  }

  private async syncBranches(
    branchRepo: Repository<Branch>,
    companyId: number,
    definitions: typeof ALLIANCE_BRANCHES,
  ): Promise<void> {
    const existingBranches = await branchRepo.find({
      where: { company_id: companyId },
    });

    const existingByName = new Map(
      existingBranches.map((branch) => [branch.name.toLowerCase(), branch]),
    );

    const missingBranches = [] as QueryDeepPartialEntity<Branch>[];
    const updatedBranches = [] as QueryDeepPartialEntity<Branch>[];

    for (const definition of definitions) {
      const existing = existingByName.get(definition.name.toLowerCase());
      const status = definition.status ?? 'active';

      if (!existing) {
        missingBranches.push({
          company_id: companyId,
          name: definition.name,
          code: definition.code,
          city: definition.city,
          country: definition.country,
          status,
        });
        continue;
      }

      if (
        existing.code !== definition.code ||
        existing.city !== definition.city ||
        existing.country !== definition.country ||
        existing.status !== status
      ) {
        updatedBranches.push({
          id: existing.id,
          code: definition.code,
          city: definition.city,
          country: definition.country,
          status,
        });
      }
    }

    if (missingBranches.length > 0) {
      await branchRepo.insert(missingBranches);
    }

    if (updatedBranches.length > 0) {
      await branchRepo.save(updatedBranches as Branch[]);
    }
  }

  private async syncDepartments(
    departmentRepo: Repository<Department>,
    companyId: number,
    definitions: typeof ALLIANCE_DEPARTMENTS,
  ): Promise<void> {
    const existingDepartments = await departmentRepo.find({
      where: { company_id: companyId },
    });

    const existingByName = new Map(
      existingDepartments.map((department) => [
        department.name.toLowerCase(),
        department,
      ]),
    );

    const missingDepartments = [] as QueryDeepPartialEntity<Department>[];
    const updatedDepartments = [] as QueryDeepPartialEntity<Department>[];

    for (const definition of definitions) {
      const existing = existingByName.get(definition.name.toLowerCase());

      if (!existing) {
        missingDepartments.push({
          company_id: companyId,
          name: definition.name,
          code: definition.code,
          description: definition.description,
          status: 'active',
        });
        continue;
      }

      if (
        existing.code !== definition.code ||
        existing.description !== definition.description ||
        existing.status !== 'active'
      ) {
        updatedDepartments.push({
          id: existing.id,
          code: definition.code,
          description: definition.description,
          status: 'active',
        });
      }
    }

    if (missingDepartments.length > 0) {
      await departmentRepo.insert(missingDepartments);
    }

    if (updatedDepartments.length > 0) {
      await departmentRepo.save(updatedDepartments as Department[]);
    }
  }

  private async syncPositions(
    positionRepo: Repository<Position>,
    companyId: number,
    definitions: typeof ALLIANCE_POSITIONS,
  ): Promise<void> {
    const existingPositions = await positionRepo.find({
      where: { company_id: companyId },
    });

    const existingByName = new Map(
      existingPositions.map((position) => [
        position.name.toLowerCase(),
        position,
      ]),
    );

    const missingPositions = [] as QueryDeepPartialEntity<Position>[];
    const updatedPositions = [] as QueryDeepPartialEntity<Position>[];

    for (const definition of definitions) {
      const existing = existingByName.get(definition.name.toLowerCase());

      if (!existing) {
        missingPositions.push({
          company_id: companyId,
          name: definition.name,
          code: definition.code,
          category: definition.category,
          level: definition.level,
          is_manager: definition.isManager,
          description: definition.description,
          status: 'active',
        });
        continue;
      }

      if (
        existing.code !== definition.code ||
        existing.category !== definition.category ||
        existing.level !== definition.level ||
        existing.is_manager !== definition.isManager ||
        existing.description !== definition.description ||
        existing.status !== 'active'
      ) {
        updatedPositions.push({
          id: existing.id,
          code: definition.code,
          category: definition.category,
          level: definition.level,
          is_manager: definition.isManager,
          description: definition.description,
          status: 'active',
        });
      }
    }

    if (missingPositions.length > 0) {
      await positionRepo.insert(missingPositions);
    }

    if (updatedPositions.length > 0) {
      await positionRepo.save(updatedPositions as Position[]);
    }
  }
}
