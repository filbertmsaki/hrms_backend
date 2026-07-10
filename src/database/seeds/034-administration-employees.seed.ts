import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

// ─────────────────────────────────────────────────────────────────────────────
// Administration Department
// Hierarchy: Operations Manager (Martha Ibrahim Wauda) → reports to GM
//            Office Administrator (MaryCatherine Leopold Ngakoka) → reports to GM
//            Receptionist / PA (Avril Virginia Fernandes) → reports to GM
// No named Administration Manager yet — all report directly to EXEC-002.
// ─────────────────────────────────────────────────────────────────────────────

export const ADMINISTRATION_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000027',
    hikvisionEmployeeNo: '00000052',
    firstName: 'Martha',
    lastName: 'Ibrahim Wauda',
    gender: 'female',
    email: 'martha.ibrahim.wauda@alliance.co.tz',
    phone: '+255710000052',
    branchCode: 'HQ',
    departmentCode: 'ADMINISTRATION',
    positionCode: 'OPERATIONS_MANAGER',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000028',
    hikvisionEmployeeNo: '00000054',
    firstName: 'MaryCatherine',
    lastName: 'Leopold Ngakoka',
    gender: 'female',
    email: 'marycatherine.leopold.ngakoka@alliance.co.tz',
    phone: '+255710000054',
    branchCode: 'HQ',
    departmentCode: 'ADMINISTRATION',
    positionCode: 'OFFICE_ADMINISTRATOR',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000002',
  },
  {
    employeeNo: 'AICL-000029',
    hikvisionEmployeeNo: '00000009',
    firstName: 'Avril',
    lastName: 'Virginia Fernandes',
    gender: 'female',
    email: 'avril.virginia.fernandes@alliance.co.tz',
    phone: '+255710000009',
    branchCode: 'HQ',
    departmentCode: 'ADMINISTRATION',
    positionCode: 'RECEPTIONIST',
    roleNames: ['EMPLOYEE'],
    reportsToEmployeeNo: 'AICL-000002',
  },
];

export default class AdministrationEmployeesSeeder implements Seeder {
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
        ADMINISTRATION_EMPLOYEES,
        'Administration',
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][AdministrationEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
