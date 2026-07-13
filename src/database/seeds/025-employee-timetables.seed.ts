import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Timetable } from '../../modules/hr/attendance/timetable/timetables/entities/timetable.entity';
import { EmployeeTimetable } from '../../modules/hr/attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { TimetableStatusEnum } from '../../modules/hr/attendance/timetable/timetables/enums/timetable-status.enum';
import { EmployeeTimetableStatusEnum } from '../../modules/hr/attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

// Explicitly assigns every Alliance employee to the company default timetable
// (Standard Office Timetable / STD-OFFICE).
//
// WHY: The attendance schedule resolver falls back to the company default
// timetable when no EmployeeTimetable row exists.  That fallback works, but
// creates a blind spot in the per-employee readiness check — we cannot tell
// whether the absence of a row is intentional or a setup gap.  Explicit rows
// make the assignment visible in audit queries and the readiness report.
//
// If an individual employee ever needs a different timetable, update their
// EmployeeTimetable row (or add a new ACTIVE row with a future effectiveFrom).

const DEFAULT_TIMETABLE_CODE = 'STD-OFFICE';
const EFFECTIVE_FROM = '2025-01-01';

export default class EmployeeTimetablesSeeder implements Seeder {
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
      const timetableRepo = qr.manager.getRepository(Timetable);
      const etRepo = qr.manager.getRepository(EmployeeTimetable);

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

      const timetable = await timetableRepo.findOne({
        where: {
          companyId: company.id,
          code: DEFAULT_TIMETABLE_CODE,
          status: TimetableStatusEnum.ACTIVE,
        },
      });
      if (!timetable) {
        throw new Error(
          `Timetable "${DEFAULT_TIMETABLE_CODE}" not found. Run 017-timetables.seed.ts first.`,
        );
      }

      const companyUsers = await companyUserRepo.find({
        where: { company_id: company.id },
      });

      let assignedCount = 0;
      let skippedCount = 0;

      for (const cu of companyUsers) {
        const employee = await employeeRepo.findOne({
          where: { company_user_id: cu.id },
        });
        if (!employee) continue;

        const existing = await etRepo.findOne({
          where: {
            companyId: company.id,
            employeeId: employee.id,
            timetableId: timetable.id,
            status: EmployeeTimetableStatusEnum.ACTIVE,
          },
        });

        if (existing) {
          skippedCount++;
          continue;
        }

        await etRepo.save(
          etRepo.create({
            companyId: company.id,
            employeeId: employee.id,
            timetableId: timetable.id,
            effectiveFrom: EFFECTIVE_FROM,
            effectiveTo: null,
            status: EmployeeTimetableStatusEnum.ACTIVE,
            assignedBy: null,
          }),
        );
        assignedCount++;
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][EmployeeTimetables] Assigned ${assignedCount} employees to "${timetable.name}" ` +
          `(${skippedCount} already had assignment, skipped).`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][EmployeeTimetables] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
