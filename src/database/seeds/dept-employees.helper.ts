import { QueryRunner } from 'typeorm';
import { hashPassword } from '../../common/utils/hash.util';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { EmploymentStatusEnum } from '../../modules/hr/employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../../modules/hr/employees/enums/employment-type.enum';
import { ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD } from './company-hr-structure.constants';

export type DeptEmployeeSeed = {
  employeeNo: string;
  hikvisionEmployeeNo?: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  email: string;
  phone: string;
  branchCode: string;
  departmentCode: string;
  positionCode: string;
  roleNames: string[];
  reportsToEmployeeNo: string | null;
  hireDate?: string;
};

const DEFAULT_HIRE_DATE = '2025-01-01';

/**
 * Upserts all employees in `seeds` for the given company.
 * Two-pass: first creates all users/employees, then wires reports_to.
 * Designed to be called from individual department seeder files.
 *
 * @param qr         Active QueryRunner (already in a transaction)
 * @param companyId  The company's DB id
 * @param seeds      The department's employee seed rows
 * @param label      Short label for console output, e.g. "Executive Management"
 */
export async function seedDeptEmployees(
  qr: QueryRunner,
  companyId: number,
  seeds: DeptEmployeeSeed[],
  label: string,
): Promise<void> {
  const userRepo = qr.manager.getRepository(User);
  const companyUserRepo = qr.manager.getRepository(CompanyUser);
  const companyUserRoleRepo = qr.manager.getRepository(CompanyUserRole);
  const roleRepo = qr.manager.getRepository(Role);
  const branchRepo = qr.manager.getRepository(Branch);
  const deptRepo = qr.manager.getRepository(Department);
  const positionRepo = qr.manager.getRepository(Position);
  const employeeRepo = qr.manager.getRepository(Employee);

  const branches = await branchRepo.find({ where: { company_id: companyId } });
  const branchMap = new Map(branches.map((b) => [b.code!, b]));

  const depts = await deptRepo.find({ where: { company_id: companyId } });
  const deptMap = new Map(depts.map((d) => [d.code!, d]));

  const positions = await positionRepo.find({
    where: { company_id: companyId },
  });
  const positionMap = new Map(positions.map((p) => [p.code!, p]));

  const roles = await roleRepo.find({ where: { company_id: companyId } });
  const roleMap = new Map(roles.map((r) => [r.name, r]));

  const defaultPassword = await hashPassword(
    ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD,
  );

  const employeeByNo = new Map<string, Employee>();

  // Pass 1: upsert users, company_users, roles, employees
  for (const seed of seeds) {
    const branch = branchMap.get(seed.branchCode) ?? null;
    const dept = deptMap.get(seed.departmentCode) ?? null;
    const position = positionMap.get(seed.positionCode) ?? null;

    let user = await userRepo.findOne({ where: { email: seed.email } });
    if (!user) {
      user = userRepo.create({
        user_no: `EMP-${seed.employeeNo}`,
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
      await userRepo.save(user);
    }

    let companyUser = await companyUserRepo.findOne({
      where: { company_id: companyId, user_id: user.id },
    });
    if (!companyUser) {
      companyUser = companyUserRepo.create({
        company_id: companyId,
        user_id: user.id,
        status: 'active',
        is_default: true,
      });
      await companyUserRepo.save(companyUser);
    }

    for (const roleName of seed.roleNames) {
      const role = roleMap.get(roleName);
      if (!role) continue;
      const exists = await companyUserRoleRepo.findOne({
        where: { company_user_id: companyUser.id, role_id: role.id },
      });
      if (!exists) {
        await companyUserRoleRepo.save(
          companyUserRoleRepo.create({
            company_user_id: companyUser.id,
            role_id: role.id,
          }),
        );
      }
    }

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
        employment_status: EmploymentStatusEnum.ACTIVE,
        employment_type: EmploymentTypeEnum.FULL_TIME,
        hire_date: seed.hireDate ?? DEFAULT_HIRE_DATE,
        nationality: 'Tanzanian',
        metadata: {
          seeded: true,
          source: label,
          ...(seed.hikvisionEmployeeNo && {
            hikvisionNo: seed.hikvisionEmployeeNo,
          }),
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
      employee.employment_status = EmploymentStatusEnum.ACTIVE;
    }
    await employeeRepo.save(employee);
    employeeByNo.set(seed.employeeNo, employee);
  }

  // Pass 2: wire reports_to — local map first, then DB fallback for cross-dept links
  for (const seed of seeds) {
    if (!seed.reportsToEmployeeNo) continue;

    const employee = employeeByNo.get(seed.employeeNo);
    if (!employee) continue;

    let manager = employeeByNo.get(seed.reportsToEmployeeNo);
    if (!manager) {
      // Cross-department link: look up by employee_no in the DB
      manager =
        (await employeeRepo.findOne({
          where: { employee_no: seed.reportsToEmployeeNo },
        })) ?? undefined;
    }
    if (!manager) continue;

    if (employee.reports_to !== manager.id) {
      employee.reports_to = manager.id;
      await employeeRepo.save(employee);
    }
  }

  console.log(`[Seeder][${label}] Upserted ${seeds.length} employee(s)`);
}
