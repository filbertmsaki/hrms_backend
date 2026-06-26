import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Shift } from '../../modules/hr/attendance/shift/shifts/entities/shift.entity';
import { ShiftAssignment } from '../../modules/hr/attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../../modules/hr/attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const DEFAULT_SHIFT_CODE = 'SHIFT-DAY';
const EFFECTIVE_FROM = '2025-01-01';

export default class ShiftAssignmentsSeeder implements Seeder {
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
      const shiftRepo = qr.manager.getRepository(Shift);
      const assignmentRepo = qr.manager.getRepository(ShiftAssignment);

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

      const dayShift = await shiftRepo.findOne({
        where: { companyId: company.id, code: DEFAULT_SHIFT_CODE },
      });
      if (!dayShift) {
        throw new Error(
          `Shift "${DEFAULT_SHIFT_CODE}" not found. Run 016-shifts.seed.ts first.`,
        );
      }

      const companyUsers = await companyUserRepo.find({
        where: { company_id: company.id },
      });

      let assignedCount = 0;

      for (const companyUser of companyUsers) {
        const employee = await employeeRepo.findOne({
          where: { company_user_id: companyUser.id },
        });
        if (!employee) continue;

        const existing = await assignmentRepo.findOne({
          where: {
            companyId: company.id,
            employeeId: employee.id,
            shiftId: dayShift.id,
            status: ShiftAssignmentStatusEnum.ACTIVE,
          },
        });

        if (!existing) {
          await assignmentRepo.save(
            assignmentRepo.create({
              companyId: company.id,
              employeeId: employee.id,
              shiftId: dayShift.id,
              effectiveFrom: EFFECTIVE_FROM,
              effectiveTo: null,
              isPrimary: true,
              status: ShiftAssignmentStatusEnum.ACTIVE,
            }),
          );
          assignedCount++;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][ShiftAssignments] Assigned ${assignedCount} employees to "${DEFAULT_SHIFT_CODE}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][ShiftAssignments] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
