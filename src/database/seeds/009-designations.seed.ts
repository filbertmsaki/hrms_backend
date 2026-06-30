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

// Company-wide grade band designations — not department-specific.
// Positions link to these via designation_id; departments do not own grade bands.
const DESIGNATION_SEEDS: DesignationSeed[] = [
  {
    code: 'EXECUTIVE',
    name: 'Executive',
    departmentCode: null,
    hierarchyLevel: 5,
    gradeLevel: 5,
    isManagerial: true,
    description: 'C-suite and top executive leadership (CEO, GM, CFO).',
  },
  {
    code: 'SENIOR_MANAGER',
    name: 'Senior Manager',
    departmentCode: null,
    hierarchyLevel: 4,
    gradeLevel: 4,
    isManagerial: true,
    description: 'Senior management responsible for cross-functional strategy.',
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    departmentCode: null,
    hierarchyLevel: 3,
    gradeLevel: 3,
    isManagerial: true,
    description: 'Department-level management and team leadership.',
  },
  {
    code: 'ASST_MANAGER',
    name: 'Assistant Manager',
    departmentCode: null,
    hierarchyLevel: 3,
    gradeLevel: 2,
    isManagerial: true,
    description: 'Deputy management supporting department heads.',
  },
  {
    code: 'SENIOR_OFFICER',
    name: 'Senior Officer',
    departmentCode: null,
    hierarchyLevel: 2,
    gradeLevel: 2,
    isManagerial: false,
    description: 'Experienced individual contributors with specialist expertise.',
  },
  {
    code: 'OFFICER',
    name: 'Officer',
    departmentCode: null,
    hierarchyLevel: 1,
    gradeLevel: 1,
    isManagerial: false,
    description: 'Standard operational staff across all departments.',
  },
  {
    code: 'SUPPORT_STAFF',
    name: 'Support Staff',
    departmentCode: null,
    hierarchyLevel: 1,
    gradeLevel: 1,
    isManagerial: false,
    description: 'Support and administrative staff.',
  },
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
