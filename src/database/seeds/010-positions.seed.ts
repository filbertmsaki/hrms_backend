import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Designation } from '../../modules/hr/designations/entities/designation.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
  ALLIANCE_POSITIONS,
} from './company-structure.constants';

// Maps ALLIANCE_POSITIONS category → department code
const CATEGORY_TO_DEPT_CODE: Record<string, string> = {
  Administration: 'ADMIN',
  HR: 'HR',
  Accounts: 'ACCOUNTS',
  Claims: 'CLAIMS',
  Underwriting: 'UNDERWRITING',
  Bancassurance: 'BANCASSURANCE',
  'General Business': 'GENERAL_BUSINESS',
  IT: 'IT',
  Executive: 'ADMIN',
};

// Maps position code → designation code
const POSITION_TO_DESIGNATION_CODE: Record<string, string> = {
  OFFICE_ADMINISTRATOR: 'ADMIN_OFFICER',
  RECEPTIONIST: 'ADMIN_ASSISTANT',
  OPERATIONS_MANAGER: 'ADMIN_MANAGER',
  HR_OFFICER: 'HR_OFFICER',
  HR_MANAGER: 'HR_MANAGER',
  TALENT_ACQUISITION_OFFICER: 'HR_OFFICER',
  ACCOUNTANT: 'ACCOUNTS_OFFICER',
  SENIOR_ACCOUNTANT: 'SENIOR_ACCOUNTANT',
  FINANCE_MANAGER: 'FINANCE_MANAGER',
  CREDIT_CONTROLLER: 'ACCOUNTS_OFFICER',
  CLAIMS_OFFICER: 'CLAIMS_OFFICER',
  SENIOR_CLAIMS_OFFICER: 'SENIOR_CLAIMS_OFFICER',
  CLAIMS_MANAGER: 'CLAIMS_MANAGER',
  CLAIMS_INVESTIGATOR: 'SENIOR_CLAIMS_OFFICER',
  UNDERWRITER: 'UNDERWRITER',
  SENIOR_UNDERWRITER: 'SENIOR_UNDERWRITER',
  UNDERWRITING_MANAGER: 'UNDERWRITING_MANAGER',
  RISK_ANALYST: 'SENIOR_UNDERWRITER',
  BANCASSURANCE_OFFICER: 'BANCASSURANCE_OFFICER',
  BANCASSURANCE_RELATIONSHIP_MANAGER: 'BANCASSURANCE_MANAGER',
  BUSINESS_DEVELOPMENT_OFFICER: 'SALES_OFFICER',
  SALES_AGENT: 'SALES_OFFICER',
  MARKETING_OFFICER: 'SALES_OFFICER',
  CUSTOMER_SERVICE_OFFICER: 'SALES_OFFICER',
  CEO: 'CEO',
  GENERAL_MANAGER: 'DIRECTOR',
  BRANCH_MANAGER: 'ADMIN_MANAGER',
  IT_OFFICER: 'IT_SUPPORT',
  ASSISTANT_IT_MANAGER: 'IT_MANAGER',
  IT_MANAGER: 'IT_MANAGER',
  IT_CONSULTANT: 'IT_CONSULTANT',
  SYSTEMS_ADMINISTRATOR: 'SOFTWARE_DEVELOPER',
  SOFTWARE_DEVELOPER: 'SOFTWARE_DEVELOPER',
};

export default class PositionsSeeder implements Seeder {
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
      const positionRepo = qr.manager.getRepository(Position);

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

      const designations = await designationRepo.find({
        where: { company_id: company.id },
      });
      const designationMap = new Map(designations.map((d) => [d.code!, d]));

      for (const seed of ALLIANCE_POSITIONS) {
        const deptCode = CATEGORY_TO_DEPT_CODE[seed.category] ?? null;
        const dept = deptCode ? (deptMap.get(deptCode) ?? null) : null;
        const designationCode = POSITION_TO_DESIGNATION_CODE[seed.code] ?? null;
        const designation = designationCode
          ? (designationMap.get(designationCode) ?? null)
          : null;

        let position = await positionRepo.findOne({
          where: { company_id: company.id, code: seed.code },
        });

        if (!position) {
          position = positionRepo.create({
            company_id: company.id,
            department_id: dept?.id ?? null,
            designation_id: designation?.id ?? null,
            name: seed.name,
            code: seed.code,
            level: seed.level,
            is_manager: seed.isManager,
            description: seed.description ?? null,
            status: 'active',
            is_active: true,
            headcount: 1,
          });
        } else {
          position.department_id = dept?.id ?? null;
          position.designation_id = designation?.id ?? null;
          position.name = seed.name;
          position.level = seed.level;
          position.is_manager = seed.isManager;
          position.description = seed.description ?? null;
          position.status = 'active';
          position.is_active = true;
        }

        await positionRepo.save(position);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Positions] Upserted ${ALLIANCE_POSITIONS.length} positions for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Positions] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
