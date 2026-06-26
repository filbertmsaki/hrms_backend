import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Designation } from '../../modules/hr/designations/entities/designation.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

type DesignationSeed = {
  code: string;
  name: string;
  departmentCode: string | null;
  hierarchyLevel: number;
  gradeLevel: number;
  isManagerial: boolean;
  description: string;
};

const DESIGNATION_SEEDS: DesignationSeed[] = [
  // Administration
  { code: 'ADMIN_ASSISTANT', name: 'Administrative Assistant', departmentCode: 'ADMIN', hierarchyLevel: 1, gradeLevel: 1, isManagerial: false, description: 'Entry-level administrative support.' },
  { code: 'ADMIN_OFFICER', name: 'Administrative Officer', departmentCode: 'ADMIN', hierarchyLevel: 2, gradeLevel: 2, isManagerial: false, description: 'Handles administrative operations and coordination.' },
  { code: 'ADMIN_MANAGER', name: 'Administration Manager', departmentCode: 'ADMIN', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Manages administrative functions and facilities.' },
  // HR
  { code: 'HR_ASSISTANT', name: 'HR Assistant', departmentCode: 'HR', hierarchyLevel: 1, gradeLevel: 1, isManagerial: false, description: 'Entry-level HR support and administration.' },
  { code: 'HR_OFFICER', name: 'HR Officer', departmentCode: 'HR', hierarchyLevel: 2, gradeLevel: 2, isManagerial: false, description: 'HR operations, recruitment, and employee services.' },
  { code: 'HR_MANAGER', name: 'HR Manager', departmentCode: 'HR', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads HR function and workforce strategy.' },
  // Finance / Accounts
  { code: 'ACCOUNTS_OFFICER', name: 'Accounts Officer', departmentCode: 'ACCOUNTS', hierarchyLevel: 1, gradeLevel: 2, isManagerial: false, description: 'Day-to-day accounting and financial recording.' },
  { code: 'SENIOR_ACCOUNTANT', name: 'Senior Accountant', departmentCode: 'ACCOUNTS', hierarchyLevel: 2, gradeLevel: 3, isManagerial: false, description: 'Advanced accounting, reconciliation, and reporting.' },
  { code: 'FINANCE_MANAGER', name: 'Finance Manager', departmentCode: 'ACCOUNTS', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads financial planning and controls.' },
  // Claims
  { code: 'CLAIMS_OFFICER', name: 'Claims Officer', departmentCode: 'CLAIMS', hierarchyLevel: 1, gradeLevel: 2, isManagerial: false, description: 'First-line claims intake and settlement.' },
  { code: 'SENIOR_CLAIMS_OFFICER', name: 'Senior Claims Officer', departmentCode: 'CLAIMS', hierarchyLevel: 2, gradeLevel: 3, isManagerial: false, description: 'Manages complex claims and guides claims staff.' },
  { code: 'CLAIMS_MANAGER', name: 'Claims Manager', departmentCode: 'CLAIMS', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads claims team and ensures consistent resolution.' },
  // Underwriting
  { code: 'UNDERWRITER', name: 'Underwriter', departmentCode: 'UNDERWRITING', hierarchyLevel: 1, gradeLevel: 2, isManagerial: false, description: 'Evaluates risk and approves insurance applications.' },
  { code: 'SENIOR_UNDERWRITER', name: 'Senior Underwriter', departmentCode: 'UNDERWRITING', hierarchyLevel: 2, gradeLevel: 3, isManagerial: false, description: 'Reviews complex risks and mentors underwriting staff.' },
  { code: 'UNDERWRITING_MANAGER', name: 'Underwriting Manager', departmentCode: 'UNDERWRITING', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads underwriting and risk selection.' },
  // Bancassurance
  { code: 'BANCASSURANCE_OFFICER', name: 'Bancassurance Officer', departmentCode: 'BANCASSURANCE', hierarchyLevel: 1, gradeLevel: 2, isManagerial: false, description: 'Manages bank partnership and bancassurance sales.' },
  { code: 'BANCASSURANCE_MANAGER', name: 'Bancassurance Manager', departmentCode: 'BANCASSURANCE', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads bancassurance unit and distribution partners.' },
  // General Business
  { code: 'SALES_OFFICER', name: 'Sales Officer', departmentCode: 'GENERAL_BUSINESS', hierarchyLevel: 1, gradeLevel: 2, isManagerial: false, description: 'Drives insurance sales and customer acquisition.' },
  { code: 'SALES_MANAGER', name: 'Sales Manager', departmentCode: 'GENERAL_BUSINESS', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads sales team and revenue targets.' },
  // IT
  { code: 'IT_SUPPORT', name: 'IT Support Officer', departmentCode: 'IT', hierarchyLevel: 1, gradeLevel: 2, isManagerial: false, description: 'First-line IT support, hardware, and software.' },
  { code: 'SOFTWARE_DEVELOPER', name: 'Software Developer', departmentCode: 'IT', hierarchyLevel: 2, gradeLevel: 3, isManagerial: false, description: 'Designs, develops, and maintains software systems.' },
  { code: 'IT_CONSULTANT', name: 'IT Consultant', departmentCode: 'IT', hierarchyLevel: 2, gradeLevel: 3, isManagerial: false, description: 'Provides technical advice and system integration services.' },
  { code: 'IT_MANAGER', name: 'IT Manager', departmentCode: 'IT', hierarchyLevel: 3, gradeLevel: 4, isManagerial: true, description: 'Leads IT operations, infrastructure, and digital services.' },
  // Cross-functional executive level
  { code: 'DIRECTOR', name: 'Director', departmentCode: null, hierarchyLevel: 5, gradeLevel: 6, isManagerial: true, description: 'Executive-level leadership responsible for divisional strategy.' },
  { code: 'CEO', name: 'Chief Executive Officer', departmentCode: null, hierarchyLevel: 6, gradeLevel: 7, isManagerial: true, description: 'Overall leadership and strategic direction of the company.' },
];

export default class DesignationsSeeder implements Seeder {
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
      const deptRepo = qr.manager.getRepository(Department);
      const designationRepo = qr.manager.getRepository(Designation);

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

      const depts = await deptRepo.find({ where: { company_id: company.id } });
      const deptMap = new Map(depts.map((d) => [d.code!, d]));

      for (const seed of DESIGNATION_SEEDS) {
        const dept = seed.departmentCode
          ? (deptMap.get(seed.departmentCode) ?? null)
          : null;

        let designation = await designationRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!designation) {
          designation = designationRepo.create({
            company_id: company.id,
            department_id: dept?.id ?? null,
            name: seed.name,
            code: seed.code,
            hierarchy_level: seed.hierarchyLevel,
            grade_level: seed.gradeLevel,
            is_managerial: seed.isManagerial,
            description: seed.description,
            status: 'active',
          });
        } else {
          designation.name = seed.name;
          designation.department_id = dept?.id ?? null;
          designation.hierarchy_level = seed.hierarchyLevel;
          designation.grade_level = seed.gradeLevel;
          designation.is_managerial = seed.isManagerial;
          designation.description = seed.description;
          designation.status = 'active';
        }

        await designationRepo.save(designation);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Designations] Upserted ${DESIGNATION_SEEDS.length} designations for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Designations] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
