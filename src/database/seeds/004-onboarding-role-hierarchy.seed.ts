import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import {
  ONBOARDING_ROLE_HIERARCHY_SEEDS,
  ONBOARDING_SEED_COMPANY_ID,
} from './onboarding-seed.constants';

export default class OnboardingRoleHierarchySeeder implements Seeder {
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
      const roleRepo = manager.getRepository(Role);

      await this.ensureCompanyExists(companyRepo, ONBOARDING_SEED_COMPANY_ID);
      await this.ensureRoleHierarchy(roleRepo, ONBOARDING_SEED_COMPANY_ID);

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][OnboardingRoleHierarchy] Completed for company_id=${ONBOARDING_SEED_COMPANY_ID}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][OnboardingRoleHierarchy] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureCompanyExists(
    companyRepo: Repository<Company>,
    companyId: number,
  ): Promise<void> {
    const company = await companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new Error(
        `Company with id=${companyId} was not found. Seed base company first.`,
      );
    }
  }

  private async ensureRoleHierarchy(
    roleRepo: Repository<Role>,
    companyId: number,
  ): Promise<void> {
    for (const seed of ONBOARDING_ROLE_HIERARCHY_SEEDS) {
      let role = await roleRepo.findOne({
        where: {
          company_id: companyId,
          name: seed.name,
        },
      });

      if (!role) {
        role = roleRepo.create({
          company_id: companyId,
          name: seed.name,
        });
      }

      role.display_name = seed.display_name;
      role.description = `[level:${seed.level}][slug:${seed.slug}] ${seed.description}`;
      role.is_system_generated = true;

      await roleRepo.save(role);
      console.log(
        `[Seeder][OnboardingRoleHierarchy] Upserted role "${seed.name}" (L${seed.level})`,
      );
    }
  }
}
