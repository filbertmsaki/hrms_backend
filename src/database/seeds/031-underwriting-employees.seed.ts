import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Underwriting Department
// Hierarchy: Underwriting Manager (Deborah Londina Sarakikya)
//              → Asst. Underwriting Manager (Wardat Ahmed Hussein)
//                  → Underwriter (Elizabeth Ndaro)
//                  → Underwriter (Zahara Athuman Mussa)
// Manager reports to EXEC-002 (General Manager).
// ─────────────────────────────────────────────────────────────────────────────

export const UNDERWRITING_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000017',
    hikvisionEmployeeNo: '00000016',
    firstName: 'Deborah',
    lastName: 'Londina Sarakikya',
    email: 'deborah.londina.sarakikya@alliance.co.tz',
    phone: '+255710000016',
    branchCode: 'HQ',
    departmentCode: 'UNDERWRITING',
    positionCode: 'UNDERWRITING_MANAGER',
    roleNames: ['HR_MANAGER'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000018',
    hikvisionEmployeeNo: '00000100',
    firstName: 'Wardat',
    lastName: 'Ahmed Hussein',
    email: 'wardat.ahmed.hussein@alliance.co.tz',
    phone: '+255710000100',
    branchCode: 'HQ',
    departmentCode: 'UNDERWRITING',
    positionCode: 'ASSISTANT_UNDERWRITING_MANAGER',
    roleNames: ['SENIOR_EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000017',
  },
  {
    employeeNo: 'AICL-000019',
    hikvisionEmployeeNo: '00000097',
    firstName: 'Elizabeth',
    lastName: 'Ndaro',
    email: 'elizabeth.ndaro@alliance.co.tz',
    phone: '+255710000097',
    branchCode: 'HQ',
    departmentCode: 'UNDERWRITING',
    positionCode: 'UNDERWRITER',
    roleNames: ['USER'],
    reportsToEmployeeNo: 'AICL-000018',
  },
  {
    employeeNo: 'AICL-000020',
    hikvisionEmployeeNo: '00000088',
    firstName: 'Zahara',
    lastName: 'Athuman Mussa',
    email: 'zahara.athuman.mussa@alliance.co.tz',
    phone: '+255710000088',
    branchCode: 'HQ',
    departmentCode: 'UNDERWRITING',
    positionCode: 'UNDERWRITER',
    roleNames: ['USER'],
    reportsToEmployeeNo: 'AICL-000018',
  },
];

export default class UnderwritingEmployeesSeeder implements Seeder {
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

      await seedDeptEmployees(
        qr,
        company.id,
        UNDERWRITING_EMPLOYEES,
        'Underwriting',
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][UnderwritingEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
