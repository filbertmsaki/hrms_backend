import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { EmployeeContact } from '../../modules/hr/employees/entities/employee-contact.entity';
import { ContactTypeEnum } from '../../modules/hr/employees/enums/contact-type.enum';
import { User } from '../../modules/users/entities/user.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

export default class EmployeeProfilesSeeder implements Seeder {
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
      const employeeRepo = qr.manager.getRepository(Employee);
      const contactRepo = qr.manager.getRepository(EmployeeContact);
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

      const companyUsers = await companyUserRepo.find({
        where: { company_id: company.id },
      });

      let seededCount = 0;

      for (const companyUser of companyUsers) {
        const employee = await employeeRepo.findOne({
          where: { company_user_id: companyUser.id },
        });
        if (!employee) continue;

        const user = await userRepo.findOne({
          where: { id: companyUser.user_id },
        });
        if (!user) continue;

        // Seed primary work contact from the user's email and phone
        const existingContact = await contactRepo.findOne({
          where: {
            employee_id: employee.id,
            contact_type: ContactTypeEnum.WORK,
            is_primary: true,
          },
        });

        if (!existingContact) {
          await contactRepo.save(
            contactRepo.create({
              employee_id: employee.id,
              contact_type: ContactTypeEnum.WORK,
              email: user.email,
              phone_number: user.phone,
              is_primary: true,
              is_verified: true,
            }),
          );
          seededCount++;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][EmployeeProfiles] Seeded primary work contacts for ${seededCount} employees`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][EmployeeProfiles] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
