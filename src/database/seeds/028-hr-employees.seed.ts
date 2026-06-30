import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Human Resources Department
// Hierarchy: HR Manager (Vicky Msifwaki) → HR Officer (Emmy Eliezer Malekela)
//                                        → Talent Acquisition Officer
// HR Manager reports to EXEC-002 (General Manager) — cross-dept link resolved
// via DB lookup in the helper.
// ─────────────────────────────────────────────────────────────────────────────

export const HR_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000004',
    hikvisionEmployeeNo: '00000059',
    firstName: 'Vicky',
    lastName: 'Msifwaki',
    email: 'msifwaki.vicky@alliance.co.tz',
    phone: '+255710000059',
    branchCode: 'HQ',
    departmentCode: 'HR',
    positionCode: 'HR_MANAGER',
    roleNames: ['HR_MANAGER'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000005',
    hikvisionEmployeeNo: '00000023',
    firstName: 'Emmy',
    lastName: 'Eliezer Malekela',
    email: 'emmy.eliezer.malekela@alliance.co.tz',
    phone: '+255710000023',
    branchCode: 'HQ',
    departmentCode: 'HR',
    positionCode: 'HR_OFFICER',
    roleNames: ['HR_OFFICER'],
    reportsToEmployeeNo: 'AICL-000004',
  },
];

export default class HrEmployeesSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const company = await qr.manager.getRepository(Company).findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${ALLIANCE_COMPANY_NAME}" not found. Run 004-company.seed.ts first.`,
        );
      }

      await seedDeptEmployees(qr, company.id, HR_EMPLOYEES, 'Human Resources');

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][HrEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
