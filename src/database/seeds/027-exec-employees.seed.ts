import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';
import { DeptEmployeeSeed, seedDeptEmployees } from './dept-employees.helper';

export const EXEC_EMPLOYEES: DeptEmployeeSeed[] = [
  {
    employeeNo: 'AICL-000001',
    hikvisionEmployeeNo: '00000103',
    firstName: 'Rajiv',
    lastName: 'Kumar',
    email: 'rajiv.kumar@alliance.co.tz',
    phone: '+255710000103',
    branchCode: 'HQ',
    departmentCode: 'EXEC',
    positionCode: 'CEO',
    roleNames: ['ADMINISTRATOR', 'HR_MANAGER'],
    reportsToEmployeeNo: null,
  },
  {
    employeeNo: 'AICL-000002',
    firstName: 'Krishnan',
    lastName: 'KVA',
    email: 'krishnan.kva@alliance.co.tz',
    phone: '+255710000200',
    branchCode: 'HQ',
    departmentCode: 'EXEC',
    positionCode: 'GENERAL_MANAGER',
    roleNames: ['ADMINISTRATOR', 'HR_MANAGER'],
    reportsToEmployeeNo: 'AICL-000001',
  },
  {
    employeeNo: 'AICL-000003',
    hikvisionEmployeeNo: '00000031',
    firstName: 'Gwamaka',
    lastName: 'Leonald Stambuli',
    email: 'gwamaka.leonald.stambuli@alliance.co.tz',
    phone: '+255710000031',
    branchCode: 'HQ',
    departmentCode: 'EXEC',
    positionCode: 'CFO',
    roleNames: ['ADMINISTRATOR', 'HR_MANAGER'],
    reportsToEmployeeNo: 'AICL-000001',
  },
];

export default class ExecEmployeesSeeder implements Seeder {
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
        EXEC_EMPLOYEES,
        'Executive Management',
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][ExecEmployees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
