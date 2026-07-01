import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Bancassurance Department
// Hierarchy: Bancassurance Manager (Oswald Ryan Tellis)
//              → Bancassurance Officer (Mussa Juma Mwanya)
//              → Bancassurance Officer (Dayness Jabir Mohamed)
// Manager reports to EXEC-002 (General Manager).
// ─────────────────────────────────────────────────────────────────────────────

export const BANCASSURANCE_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000024',
    hikvisionEmployeeNo: '00000067',
    firstName: 'Oswald',
    lastName: 'Ryan Tellis',
    email: 'oswald.ryan.tellis@alliance.co.tz',
    phone: '+255710000067',
    branchCode: 'HQ',
    departmentCode: 'BANCASSURANCE',
    positionCode: 'BANCASSURANCE_MANAGER',
    roleNames: ['DEPARTMENT_MANAGER'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000025',
    hikvisionEmployeeNo: '00000060',
    firstName: 'Mussa',
    lastName: 'Juma Mwanya',
    email: 'mussa.juma.mwanya@alliance.co.tz',
    phone: '+255710000060',
    branchCode: 'HQ',
    departmentCode: 'BANCASSURANCE',
    positionCode: 'BANCASSURANCE_OFFICER',
    roleNames: ['USER'],
    reportsToEmployeeNo: 'AICL-000024',
  },
  {
    employeeNo: 'AICL-000026',
    hikvisionEmployeeNo: '00000015',
    firstName: 'Dayness',
    lastName: 'Jabir Mohamed',
    email: 'dayness.jabir.mohamed@alliance.co.tz',
    phone: '+255710000015',
    branchCode: 'HQ',
    departmentCode: 'BANCASSURANCE',
    positionCode: 'BANCASSURANCE_OFFICER',
    roleNames: ['USER'],
    reportsToEmployeeNo: 'AICL-000024',
  },
];

export default class BancassuranceEmployeesSeeder implements Seeder {
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
        BANCASSURANCE_EMPLOYEES,
        'Bancassurance',
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][BancassuranceEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
