import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Claims Department
// Hierarchy: Claims Manager (Janki Sinha)
//              → Asst. Claims Manager (Sifa Witness Juma)
//              → Senior Claims Officer (Agatha Godfrey Kiiza)
//                  → Claims Officer (Ezekiel Elia Kajiba)
// Manager reports to EXEC-002 (General Manager).
// ─────────────────────────────────────────────────────────────────────────────

export const CLAIMS_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000013',
    hikvisionEmployeeNo: '00000039',
    firstName: 'Janki',
    lastName: 'Sinha',
    email: 'janki.sinha@alliance.co.tz',
    phone: '+255710000039',
    branchCode: 'HQ',
    departmentCode: 'CLAIMS',
    positionCode: 'CLAIMS_MANAGER',
    roleNames: ['DEPARTMENT_MANAGER'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000014',
    hikvisionEmployeeNo: '00000091',
    firstName: 'Sifa',
    lastName: 'Witness Juma',
    email: 'sifa.witness.juma@alliance.co.tz',
    phone: '+255710000091',
    branchCode: 'HQ',
    departmentCode: 'CLAIMS',
    positionCode: 'ASSISTANT_CLAIMS_MANAGER',
    roleNames: ['SENIOR_EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000013',
  },
  {
    employeeNo: 'AICL-000015',
    hikvisionEmployeeNo: '00000003',
    firstName: 'Agatha',
    lastName: 'Godfrey Kiiza',
    email: 'agatha.godfrey.kiiza@alliance.co.tz',
    phone: '+255710000003',
    branchCode: 'HQ',
    departmentCode: 'CLAIMS',
    positionCode: 'SENIOR_CLAIMS_OFFICER',
    roleNames: ['SENIOR_EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000013',
  },
  {
    employeeNo: 'AICL-000016',
    hikvisionEmployeeNo: '00000027',
    firstName: 'Ezekiel',
    lastName: 'Elia Kajiba',
    email: 'ezekiel.elia.kajiba@alliance.co.tz',
    phone: '+255710000027',
    branchCode: 'HQ',
    departmentCode: 'CLAIMS',
    positionCode: 'CLAIMS_OFFICER',
    roleNames: ['USER'],
    reportsToEmployeeNo: 'AICL-000014',
  },
];

export default class ClaimsEmployeesSeeder implements Seeder {
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

      await seedDeptEmployees(qr, company.id, CLAIMS_EMPLOYEES, 'Claims');

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][ClaimsEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
