import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Accounts & Finance Department
// CFO: Gwamaka Leonald Stambuli (EXEC-003) — oversees this dept as CFO
// Hierarchy: Finance Manager (Poonam Chotai) → reports to EXEC-003 (CFO)
//              → Asst. Finance Manager (Shukuru Said Onga)
//                  → Accountant (Deepa Manek)
// ─────────────────────────────────────────────────────────────────────────────

export const FINANCE_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000021',
    hikvisionEmployeeNo: '00000120',
    firstName: 'Poonam',
    lastName: 'Chotai',
    email: 'poonam.chotai@alliance.co.tz',
    phone: '+255710000120',
    branchCode: 'HQ',
    departmentCode: 'ACCOUNTS_FINANCE',
    positionCode: 'FINANCE_MANAGER',
    roleNames: ['DEPARTMENT_MANAGER'],
    reportsToEmployeeNo: 'AICL-000003',
  },
  {
    employeeNo: 'AICL-000022',
    hikvisionEmployeeNo: '00000077',
    firstName: 'Shukuru',
    lastName: 'Said Onga',
    email: 'shukuru.said.onga@alliance.co.tz',
    phone: '+255710000077',
    branchCode: 'HQ',
    departmentCode: 'ACCOUNTS_FINANCE',
    positionCode: 'ASSISTANT_FINANCE_MANAGER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000021',
  },
  {
    employeeNo: 'AICL-000023',
    hikvisionEmployeeNo: '00000017',
    firstName: 'Deepa',
    lastName: 'Manek',
    email: 'deepa.manek@alliance.co.tz',
    phone: '+255710000017',
    branchCode: 'HQ',
    departmentCode: 'ACCOUNTS_FINANCE',
    positionCode: 'ACCOUNTANT',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000022',
  },
];

export default class FinanceEmployeesSeeder implements Seeder {
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
        FINANCE_EMPLOYEES,
        'Accounts & Finance',
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][FinanceEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
