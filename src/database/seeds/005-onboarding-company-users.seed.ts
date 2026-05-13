import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ONBOARDING_ROLE_HIERARCHY_SEEDS,
  ONBOARDING_ROLE_USER_SEEDS,
  ONBOARDING_SEED_COMPANY_ID,
} from './onboarding-seed.constants';

const DEFAULT_SEED_PASSWORD = 'SeedPass123!';

export default class OnboardingCompanyUsersSeeder implements Seeder {
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
      const userRepo = manager.getRepository(User);
      const companyUserRepo = manager.getRepository(CompanyUser);
      const companyUserRoleRepo = manager.getRepository(CompanyUserRole);

      await this.ensureCompanyExists(companyRepo, ONBOARDING_SEED_COMPANY_ID);
      const roleMap = await this.resolveRoles(roleRepo, ONBOARDING_SEED_COMPANY_ID);

      for (const seed of ONBOARDING_ROLE_USER_SEEDS) {
        const role = roleMap.get(seed.role_name);
        if (!role) {
          throw new Error(`Missing role "${seed.role_name}" for company user seeding`);
        }

        const user = await this.ensureUser(userRepo, seed);
        const membership = await this.ensureCompanyMembership(
          companyUserRepo,
          ONBOARDING_SEED_COMPANY_ID,
          user.id,
        );
        await this.ensureCompanyUserRole(
          companyUserRoleRepo,
          membership.id,
          role.id,
        );

        console.log(
          `[Seeder][OnboardingCompanyUsers] Upserted company_user=${membership.id} role=${role.name}`,
        );
      }

      await queryRunner.commitTransaction();
      console.log(
        `[Seeder][OnboardingCompanyUsers] Completed for company_id=${ONBOARDING_SEED_COMPANY_ID}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][OnboardingCompanyUsers] Failed:', error);
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

  private async resolveRoles(
    roleRepo: Repository<Role>,
    companyId: number,
  ): Promise<Map<string, Role>> {
    const requiredNames = ONBOARDING_ROLE_HIERARCHY_SEEDS.map((seed) => seed.name);
    const roles = await roleRepo.find({
      where: {
        company_id: companyId,
      },
    });

    const roleMap = new Map<string, Role>();
    roles.forEach((role) => roleMap.set(role.name, role));

    for (const name of requiredNames) {
      if (!roleMap.has(name)) {
        throw new Error(
          `Required onboarding role "${name}" not found. Run 004-onboarding-role-hierarchy.seed first.`,
        );
      }
    }

    return roleMap;
  }

  private async ensureUser(
    userRepo: Repository<User>,
    seed: (typeof ONBOARDING_ROLE_USER_SEEDS)[number],
  ): Promise<User> {
    let user = await userRepo.findOne({
      where: [{ email: seed.email }, { phone: seed.phone }],
      select: [
        'id',
        'email',
        'phone',
        'user_no',
        'first_name',
        'last_name',
        'status',
        'user_type',
        'is_email_verified',
      ],
    });

    if (!user) {
      user = userRepo.create({
        user_no: seed.user_no,
        first_name: seed.first_name,
        last_name: seed.last_name,
        email: seed.email,
        phone: seed.phone,
        password: await hashPassword(DEFAULT_SEED_PASSWORD),
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
      });
      return userRepo.save(user);
    }

    user.user_no = seed.user_no;
    user.first_name = seed.first_name;
    user.last_name = seed.last_name;
    user.email = seed.email;
    user.phone = seed.phone;
    user.status = 'active';
    user.user_type = 'COMPANY_USER';
    user.is_email_verified = true;

    return userRepo.save(user);
  }

  private async ensureCompanyMembership(
    companyUserRepo: Repository<CompanyUser>,
    companyId: number,
    userId: number,
  ): Promise<CompanyUser> {
    let membership = await companyUserRepo.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
      },
    });

    if (!membership) {
      membership = companyUserRepo.create({
        company_id: companyId,
        user_id: userId,
      });
    }

    membership.status = 'active';
    if (membership.is_default === null || membership.is_default === undefined) {
      membership.is_default = false;
    }

    return companyUserRepo.save(membership);
  }

  private async ensureCompanyUserRole(
    companyUserRoleRepo: Repository<CompanyUserRole>,
    companyUserId: number,
    roleId: number,
  ): Promise<void> {
    const assignment = await companyUserRoleRepo.findOne({
      where: {
        company_user_id: companyUserId,
        role_id: roleId,
      },
    });

    if (!assignment) {
      await companyUserRoleRepo.save(
        companyUserRoleRepo.create({
          company_user_id: companyUserId,
          role_id: roleId,
        }),
      );
    }
  }
}
