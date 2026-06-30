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

// Maps position code → grade band designation code (company-wide)
const POSITION_TO_DESIGNATION_CODE: Record<string, string> = {
  // Executive
  CEO: 'EXECUTIVE',
  GENERAL_MANAGER: 'EXECUTIVE',
  CFO: 'EXECUTIVE',
  // Senior Manager (branch managers)
  BRANCH_MANAGER: 'SENIOR_MANAGER',
  // Managers
  ADMINISTRATION_MANAGER: 'MANAGER',
  OPERATIONS_MANAGER: 'MANAGER',
  HR_MANAGER: 'MANAGER',
  FINANCE_MANAGER: 'MANAGER',
  CLAIMS_MANAGER: 'MANAGER',
  UNDERWRITING_MANAGER: 'MANAGER',
  BANCASSURANCE_MANAGER: 'MANAGER',
  IT_MANAGER: 'MANAGER',
  IT_CONSULTANT: 'MANAGER',
  // Assistant Managers
  ASST_ADMINISTRATION_MANAGER: 'ASST_MANAGER',
  ASSISTANT_FINANCE_MANAGER: 'ASST_MANAGER',
  ASSISTANT_CLAIMS_MANAGER: 'ASST_MANAGER',
  ASSISTANT_UNDERWRITING_MANAGER: 'ASST_MANAGER',
  ASSISTANT_BANCASSURANCE_MANAGER: 'ASST_MANAGER',
  ASSISTANT_IT_MANAGER: 'ASST_MANAGER',
  // Senior Officers
  TALENT_ACQUISITION_OFFICER: 'SENIOR_OFFICER',
  SENIOR_ACCOUNTANT: 'SENIOR_OFFICER',
  CREDIT_CONTROLLER: 'SENIOR_OFFICER',
  SENIOR_CLAIMS_OFFICER: 'SENIOR_OFFICER',
  CLAIMS_INVESTIGATOR: 'SENIOR_OFFICER',
  SENIOR_UNDERWRITER: 'SENIOR_OFFICER',
  RISK_ANALYST: 'SENIOR_OFFICER',
  SYSTEMS_ADMINISTRATOR: 'SENIOR_OFFICER',
  SOFTWARE_DEVELOPER: 'SENIOR_OFFICER',
  // Officers
  HR_OFFICER: 'OFFICER',
  ACCOUNTANT: 'OFFICER',
  CLAIMS_OFFICER: 'OFFICER',
  UNDERWRITER: 'OFFICER',
  BANCASSURANCE_OFFICER: 'OFFICER',
  BUSINESS_DEVELOPMENT_OFFICER: 'OFFICER',
  SALES_AGENT: 'OFFICER',
  MARKETING_OFFICER: 'OFFICER',
  CUSTOMER_SERVICE_OFFICER: 'OFFICER',
  IT_OFFICER: 'OFFICER',
  // Support Staff
  OFFICE_ADMINISTRATOR: 'SUPPORT_STAFF',
  RECEPTIONIST: 'SUPPORT_STAFF',
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

      // Pass 1: upsert all positions (without reports_to_position_id — parent may not exist yet)
      for (const seed of ALLIANCE_POSITIONS) {
        const dept = seed.departmentCode
          ? (deptMap.get(seed.departmentCode) ?? null)
          : null;
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
            headcount: seed.headcount ?? 1,
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
          if (seed.headcount !== undefined) {
            position.headcount = seed.headcount;
          }
        }

        await positionRepo.save(position);
      }

      // Pass 2: set reports_to_position_id now that all positions exist
      const allPositions = await positionRepo.find({
        where: { company_id: company.id },
      });
      const positionByCode = new Map(allPositions.map((p) => [p.code!, p]));

      for (const seed of ALLIANCE_POSITIONS) {
        if (!seed.reportsToPositionCode) continue;

        const position = positionByCode.get(seed.code);
        const reportsTo = positionByCode.get(seed.reportsToPositionCode);
        if (!position || !reportsTo) continue;

        if (position.reports_to_position_id !== reportsTo.id) {
          position.reports_to_position_id = reportsTo.id;
          await positionRepo.save(position);
        }
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
