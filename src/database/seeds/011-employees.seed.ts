import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Designation } from '../../modules/hr/designations/entities/designation.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { EmploymentStatusEnum } from '../../modules/hr/employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../../modules/hr/employees/enums/employment-type.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
  ALLIANCE_EMPLOYEES,
} from './company-structure.constants';
import { ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD } from './company-hr-structure.constants';

const DEFAULT_HIRE_DATE = '2025-01-01';

export default class EmployeesSeeder implements Seeder {
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
      const userRepo = qr.manager.getRepository(User);
      const companyUserRepo = qr.manager.getRepository(CompanyUser);
      const companyUserRoleRepo = qr.manager.getRepository(CompanyUserRole);
      const roleRepo = qr.manager.getRepository(Role);
      const branchRepo = qr.manager.getRepository(Branch);
      const deptRepo = qr.manager.getRepository(Department);
      const positionRepo = qr.manager.getRepository(Position);
      const designationRepo = qr.manager.getRepository(Designation);
      const employeeRepo = qr.manager.getRepository(Employee);

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

      // Build lookup maps
      const branches = await branchRepo.find({
        where: { company_id: company.id },
      });
      const branchMap = new Map(branches.map((b) => [b.code!, b]));

      const depts = await deptRepo.find({ where: { company_id: company.id } });
      const deptMap = new Map(depts.map((d) => [d.code!, d]));

      const positions = await positionRepo.find({
        where: { company_id: company.id },
      });
      const positionMap = new Map(positions.map((p) => [p.code!, p]));

      const designations = await designationRepo.find({
        where: { company_id: company.id },
      });

      const roles = await roleRepo.find({ where: { company_id: company.id } });
      const roleMap = new Map(roles.map((r) => [r.name, r]));

      const defaultPassword = await hashPassword(
        ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD,
      );

      // Map hikvision employee no → employee for reports_to linkage (second pass)
      const employeeByNo = new Map<string, Employee>();

      for (const seed of ALLIANCE_EMPLOYEES) {
        const branch = branchMap.get(seed.primaryBranchCode) ?? null;
        const dept = deptMap.get(seed.primaryDepartmentCode) ?? null;
        const position = positionMap.get(seed.positionCode) ?? null;

        // Derive designation from position
        const designation = position?.designation_id
          ? (designations.find((d) => d.id === position.designation_id) ?? null)
          : null;

        // Upsert User
        let user =
          (await userRepo.findOne({ where: { email: seed.email } })) ??
          (await userRepo.findOne({ where: { phone: seed.phone } }));

        const userNo = `EMP-${seed.employeeNo.padStart(5, '0')}`;

        if (!user) {
          user = userRepo.create({
            user_no: userNo,
            first_name: seed.firstName,
            last_name: seed.lastName,
            email: seed.email,
            phone: seed.phone,
            password: defaultPassword,
            user_type: 'COMPANY_USER',
            status: 'active',
            is_email_verified: true,
          });
          await userRepo.save(user);
        } else {
          user.first_name = seed.firstName;
          user.last_name = seed.lastName;
          user.user_type = 'COMPANY_USER';
          user.status = 'active';
          await userRepo.save(user);
        }

        // Upsert CompanyUser
        let companyUser = await companyUserRepo.findOne({
          where: { company_id: company.id, user_id: user.id },
        });
        if (!companyUser) {
          companyUser = companyUserRepo.create({
            company_id: company.id,
            user_id: user.id,
            status: 'active',
            is_default: true,
          });
          await companyUserRepo.save(companyUser);
        }

        // Assign roles
        const roleNames = seed.roleNames ?? ['EMPLOYEE'];
        for (const roleName of roleNames) {
          const role = roleMap.get(roleName);
          if (!role) continue;

          const existingAssignment = await companyUserRoleRepo.findOne({
            where: { company_user_id: companyUser.id, role_id: role.id },
          });
          if (!existingAssignment) {
            await companyUserRoleRepo.save(
              companyUserRoleRepo.create({
                company_user_id: companyUser.id,
                role_id: role.id,
              }),
            );
          }
        }

        // Upsert Employee
        let employee = await employeeRepo.findOne({
          where: { company_user_id: companyUser.id },
        });
        if (!employee) {
          employee = employeeRepo.create({
            company_user_id: companyUser.id,
            employee_no: seed.employeeNo,
            first_name: seed.firstName,
            last_name: seed.lastName,
            gender: seed.gender,
            primary_branch_id: branch?.id ?? null,
            primary_department_id: dept?.id ?? null,
            primary_position_id: position?.id ?? null,
            primary_designation_id: designation?.id ?? null,
            employment_status: EmploymentStatusEnum.ACTIVE,
            employment_type: EmploymentTypeEnum.FULL_TIME,
            hire_date: DEFAULT_HIRE_DATE,
            nationality: 'Tanzanian',
            metadata: {
              seeded: true,
              source: '011-employees',
              hikvisionNo: seed.hikvisionEmployeeNo,
            },
          });
        } else {
          employee.first_name = seed.firstName;
          employee.last_name = seed.lastName;
          employee.gender = seed.gender;
          employee.employee_no = seed.employeeNo;
          employee.primary_branch_id = branch?.id ?? null;
          employee.primary_department_id = dept?.id ?? null;
          employee.primary_position_id = position?.id ?? null;
          employee.primary_designation_id = designation?.id ?? null;
          employee.employment_status = EmploymentStatusEnum.ACTIVE;
        }

        await employeeRepo.save(employee);
        employeeByNo.set(seed.hikvisionEmployeeNo, employee);
      }

      // Second pass: set reports_to
      for (const seed of ALLIANCE_EMPLOYEES) {
        if (!seed.reportsToEmployeeNo) continue;

        const employee = employeeByNo.get(seed.hikvisionEmployeeNo);
        const manager = employeeByNo.get(seed.reportsToEmployeeNo);
        if (employee && manager && employee.reports_to !== manager.id) {
          employee.reports_to = manager.id;
          await employeeRepo.save(employee);
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][Employees] Upserted ${ALLIANCE_EMPLOYEES.length} employees for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][Employees] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
