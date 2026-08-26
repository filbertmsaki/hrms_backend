import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

export default class PlatformOwnerCompanyAccessSeeder implements Seeder {
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
      const companyUserRepo = qr.manager.getRepository(CompanyUser);
      const companyUserRoleRepo = qr.manager.getRepository(CompanyUserRole);
      const roleRepo = qr.manager.getRepository(Role);
      const userRepo = qr.manager.getRepository(User);

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

      const adminRole = await roleRepo.findOne({
        where: { name: 'COMPANY_ADMIN', company_id: company.id },
      });
      if (!adminRole) {
        throw new Error(
          `COMPANY_ADMIN role not found for company ${company.id}. Run 005-company-roles.seed.ts first.`,
        );
      }

      const owners = await userRepo.find({
        where: { user_type: 'OWNER', status: 'active' },
        select: ['id', 'email'],
      });

      let syncedOwners = 0;
      for (const owner of owners) {
        const activeMembershipCount = await companyUserRepo.count({
          where: { user_id: owner.id, status: 'active' },
        });

        let membership = await companyUserRepo.findOne({
          where: { company_id: company.id, user_id: owner.id },
        });

        if (!membership) {
          membership = companyUserRepo.create({
            company_id: company.id,
            user_id: owner.id,
            status: 'active',
            is_default: activeMembershipCount === 0,
          });
          membership = await companyUserRepo.save(membership);
          syncedOwners += 1;
        } else if (membership.status !== 'active') {
          membership.status = 'active';
          if (activeMembershipCount === 0) {
            membership.is_default = true;
          }
          membership = await companyUserRepo.save(membership);
          syncedOwners += 1;
        }

        if (membership.is_default) {
          await companyUserRepo.update(
            { user_id: owner.id, status: 'active' },
            { is_default: false },
          );
          membership.is_default = true;
          membership = await companyUserRepo.save(membership);
        }

        const existingRoleAssignment = await companyUserRoleRepo.findOne({
          where: {
            company_user_id: membership.id,
            role_id: adminRole.id,
          },
        });
        if (!existingRoleAssignment) {
          await companyUserRoleRepo.save(
            companyUserRoleRepo.create({
              company_user_id: membership.id,
              role_id: adminRole.id,
            }),
          );
          syncedOwners += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][PlatformOwnerCompanyAccess] Ensured company access for ${owners.length} platform owner(s) in "${company.name}" (${syncedOwners} change(s) applied)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][PlatformOwnerCompanyAccess] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
