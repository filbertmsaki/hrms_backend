import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

export default class CompanyAdminSeeder implements Seeder {
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
      const userRepo = qr.manager.getRepository(User);
      const companyUserRepo = qr.manager.getRepository(CompanyUser);
      const companyUserRoleRepo = qr.manager.getRepository(CompanyUserRole);
      const roleRepo = qr.manager.getRepository(Role);

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

      const email = process.env.COMPANY_ADMIN_EMAIL ?? 'admin@alliance.co.tz';
      const phone = process.env.COMPANY_ADMIN_PHONE ?? '+255700000002';
      const firstName = process.env.COMPANY_ADMIN_FIRST_NAME ?? 'System';
      const lastName = process.env.COMPANY_ADMIN_LAST_NAME ?? 'Administrator';
      const rawPassword = process.env.COMPANY_ADMIN_PASSWORD;
      const userNo = process.env.COMPANY_ADMIN_USER_NO ?? 'ADM-00001';

      if (!rawPassword?.trim()) {
        throw new Error(
          'COMPANY_ADMIN_PASSWORD must be set before seeding.',
        );
      }

      let user =
        (await userRepo.findOne({ where: { email }, relations: ['roles'] })) ??
        (await userRepo.findOne({ where: { phone }, relations: ['roles'] }));

      if (!user) {
        user = userRepo.create({
          user_no: userNo,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          password: await hashPassword(rawPassword.trim()),
          user_type: 'COMPANY_USER',
          status: 'active',
          is_email_verified: true,
        });
        await userRepo.save(user);
      } else {
        user.first_name = firstName;
        user.last_name = lastName;
        user.user_type = 'COMPANY_USER';
        user.status = 'active';
        user.is_email_verified = true;
        user.roles = [];
        await userRepo.save(user);
      }

      let companyUser = await companyUserRepo.findOne({
        where: { company_id: company.id, user_id: user.id },
      });
      if (!companyUser) {
        companyUser = companyUserRepo.create({
          company_id: company.id,
          user_id: user.id,
          status: 'active',
          is_default: true,
        });
        await companyUserRepo.save(companyUser);
      }

      const existingRoleAssignment = await companyUserRoleRepo.findOne({
        where: {
          company_user_id: companyUser.id,
          role_id: adminRole.id,
        },
      });
      if (!existingRoleAssignment) {
        await companyUserRoleRepo.save(
          companyUserRoleRepo.create({
            company_user_id: companyUser.id,
            role_id: adminRole.id,
          }),
        );
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][CompanyAdmin] Upserted company admin: ${email} for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][CompanyAdmin] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
