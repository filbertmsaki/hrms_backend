import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import {
  DeptEmployeeSeed,
  seedDeptEmployees,
} from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Information Technology Department
// Hierarchy: IT Manager (Ravi Kumar)
//              → Systems Administrator (Jasson Kalemera) — senior technical
//              → Asst. IT Manager (Filbert Msaki)
//                  → IT Officers: Bosco, Inocent, Sanjay, Melina
// IT Manager reports to EXEC-002 (General Manager) — cross-dept link resolved
// via DB lookup in the helper.
// ─────────────────────────────────────────────────────────────────────────────

export const IT_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000006',
    hikvisionEmployeeNo: '00000108',
    firstName: 'Ravi',
    lastName: 'Kumar',
    gender: 'male',
    email: 'ravi.kumar@alliance.co.tz',
    phone: '+255710000108',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'IT_MANAGER',
    roleNames: ['DEPARTMENT_MANAGER'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000007',
    hikvisionEmployeeNo: '00000040',
    firstName: 'Jasson',
    lastName: 'Kalemera',
    gender: 'male',
    email: 'jasson.kalemera@alliance.co.tz',
    phone: '+255710000040',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'SYSTEMS_ADMINISTRATOR',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000006',
  },
  {
    employeeNo: 'AICL-000008',
    hikvisionEmployeeNo: '00000001',
    firstName: 'Filbert',
    lastName: 'Msaki',
    gender: 'male',
    email: 'filbert@alliance.co.tz',
    phone: '+255710000001',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'ASSISTANT_IT_MANAGER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000006',
  },
  {
    employeeNo: 'AICL-000009',
    hikvisionEmployeeNo: '00000012',
    firstName: 'Bosco',
    lastName: 'Odilo Semiono',
    gender: 'male',
    email: 'bossco.odillo@alliance.co.tz',
    phone: '+255710000012',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'IT_OFFICER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000008',
  },
  {
    employeeNo: 'AICL-000010',
    hikvisionEmployeeNo: '00000094',
    firstName: 'Inocent',
    lastName: 'Nuruva',
    gender: 'male',
    email: 'inocent@alliance.co.tz',
    phone: '+255710000094',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'IT_OFFICER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000008',
  },
  {
    employeeNo: 'AICL-000011',
    hikvisionEmployeeNo: '00000073',
    firstName: 'Sanjay',
    lastName: 'Lakhan',
    gender: 'male',
    email: 'sanjay.lakhan@alliance.co.tz',
    phone: '+255710000073',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'IT_OFFICER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000008',
  },
  {
    employeeNo: 'AICL-000012',
    hikvisionEmployeeNo: '00000056',
    firstName: 'Melina',
    lastName: 'Epaphra Moshi',
    gender: 'female',
    email: 'melina.epaphra.moshi@alliance.co.tz',
    phone: '+255710000056',
    branchCode: 'HQ',
    departmentCode: 'IT',
    positionCode: 'IT_OFFICER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000008',
  },
];

export default class ItEmployeesSeeder implements Seeder {
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

      await seedDeptEmployees(qr, company.id, IT_EMPLOYEES, 'Information Technology');

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][ItEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
