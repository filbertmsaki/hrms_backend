import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { CompanyUserDepartmentAccess } from '../../modules/hr/departments/entities/company-user-department-access.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { EmployeeDepartment } from '../../modules/hr/employees/entities/employee-department.entity';
import { EmployeePosition } from '../../modules/hr/employees/entities/employee-position.entity';
import { EmployeeReportingLine } from '../../modules/hr/employees/entities/employee-reporting-line.entity';
import { EmploymentStatusEnum } from '../../modules/hr/employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../../modules/hr/employees/enums/employment-type.enum';
import { EmployeeConfirmationStatusEnum } from '../../modules/hr/employees/enums/employee-confirmation-status.enum';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { EmployeeTimetable } from '../../modules/hr/attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../../modules/hr/attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { Timetable } from '../../modules/hr/attendance/timetable/timetables/entities/timetable.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { ALLIANCE_COMPANY_SLUG } from './company-structure.constants';

const HIRED_ON = '2026-01-05';
const EMPLOYEES = [
  {
    no: 'AIC-EMP-1001',
    first: 'Emmy',
    last: 'Malekela',
    email: 'developer.filymsaki@gmail.com',
    phone: '+255700001001',
    gender: 'female',
    dept: 'HQ_HUMAN_RESOURCES',
    position: 'HR Manager',
    role: 'HR_MANAGER',
  },
  {
    no: 'AIC-EMP-1002',
    first: 'Jasson',
    last: 'Kalemera',
    email: 'filymsaki@gmail.com',
    phone: '+255700001002',
    gender: 'male',
    dept: 'HQ_INFORMATION_TECHNOLOGY',
    position: 'IT Manager',
    role: 'IT_MANAGER',
  },
  {
    no: 'AIC-EMP-1003',
    first: 'Bosco',
    last: 'Odillo',
    email: 'msakifil111@gmail.com',
    phone: '+255700001003',
    gender: 'male',
    dept: 'HQ_INFORMATION_TECHNOLOGY',
    position: 'Employee',
    role: 'EMPLOYEE',
  },
  {
    no: 'AIC-EMP-1004',
    first: 'Janki',
    last: 'Sinha',
    email: 'inocentnuruva@gmail.com',
    phone: '+255700001004',
    gender: 'female',
    dept: 'HQ_CLAIMS',
    position: 'Claims Manager',
    role: 'CLAIMS_MANAGER',
  },
] as const;

/** Explicitly invoked Alliance employee provisioning. Existing profile/account data is preserved. */
export default class AllianceEmployeesSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;
    const rawPassword = process.env.EMPLOYEE_IMPORT_DEFAULT_PASSWORD;
    if (!rawPassword) {
      throw new Error('Set EMPLOYEE_IMPORT_DEFAULT_PASSWORD.');
    }

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const companies = qr.manager.getRepository(Company);
      const users = qr.manager.getRepository(User);
      const memberships = qr.manager.getRepository(CompanyUser);
      const roles = qr.manager.getRepository(Role);
      const branches = qr.manager.getRepository(Branch);
      const departments = qr.manager.getRepository(Department);
      const positions = qr.manager.getRepository(Position);
      const employees = qr.manager.getRepository(Employee);
      const empDepartments = qr.manager.getRepository(EmployeeDepartment);
      const empPositions = qr.manager.getRepository(EmployeePosition);
      const timetables = qr.manager.getRepository(Timetable);
      const employeeTimetables = qr.manager.getRepository(EmployeeTimetable);
      const deptAccess = qr.manager.getRepository(CompanyUserDepartmentAccess);
      const roleAssignments = qr.manager.getRepository(CompanyUserRole);
      const reportingLines = qr.manager.getRepository(EmployeeReportingLine);

      const company = await companies.findOneBy({
        slug: ALLIANCE_COMPANY_SLUG,
      });
      if (!company)
        throw new Error(
          'Alliance company missing; run the standard company and structure seeds first.',
        );
      const branch = await branches.findOneBy({
        company_id: company.id,
        code: 'HQ',
      });
      const timetable = await timetables.findOneBy({
        companyId: company.id,
        code: 'STD-OFFICE',
      });
      if (!branch || !timetable)
        throw new Error(
          'Alliance HQ branch or STD-OFFICE timetable missing; run standard structure and timetable seeds first.',
        );

      const roleSeeds = [
        {
          name: 'IT_MANAGER',
          display_name: 'IT Manager',
          description:
            'Department-scoped manager permissions for Information Technology.',
        },
        {
          name: 'CLAIMS_MANAGER',
          display_name: 'Claims Manager',
          description: 'Department-scoped manager permissions for Claims.',
        },
      ];
      const departmentManager = await roles.findOne({
        where: { company_id: company.id, name: 'DEPARTMENT_MANAGER' },
        relations: ['permissions'],
      });
      if (!departmentManager)
        throw new Error(
          'DEPARTMENT_MANAGER role missing; run 005-company-roles.seed.ts first.',
        );
      for (const seed of roleSeeds) {
        let role = await roles.findOne({
          where: { company_id: company.id, name: seed.name },
          relations: ['permissions'],
        });
        if (!role) {
          role = roles.create({
            ...seed,
            company_id: company.id,
            is_system_generated: true,
            permissions: departmentManager.permissions,
          });
          await roles.save(role);
        }
        if (
          role.permissions.length !== departmentManager.permissions.length ||
          !departmentManager.permissions.every((p) =>
            role.permissions.some((rp) => rp.id === p.id),
          )
        ) {
          throw new Error(
            `${seed.name} already exists with a nonstandard permission mapping; refusing to overwrite it.`,
          );
        }
      }

      const departmentByCode = new Map<string, Department>();
      for (const seed of EMPLOYEES) {
        let department = await departments.findOneBy({
          company_id: company.id,
          code: seed.dept,
        });
        if (!department) {
          department = await departments.save(
            departments.create({
              company_id: company.id,
              branch_id: branch.id,
              code: seed.dept,
              name:
                seed.dept === 'HQ_HUMAN_RESOURCES'
                  ? 'Human Resources'
                  : seed.dept === 'HQ_INFORMATION_TECHNOLOGY'
                    ? 'Information Technology'
                    : 'Claims',
              description: null,
              status: 'active',
            }),
          );
        }
        departmentByCode.set(seed.dept, department);
      }

      const employeesByNo = new Map<string, Employee>();
      for (const seed of EMPLOYEES) {
        const department = departmentByCode.get(seed.dept)!;
        let position = await positions.findOneBy({
          company_id: company.id,
          code: seed.no,
        });
        if (!position)
          position = await positions.save(
            positions.create({
              company_id: company.id,
              branch_id: branch.id,
              department_id: department.id,
              code: seed.no,
              name: seed.position,
              level: seed.role === 'EMPLOYEE' ? 5 : 9,
              is_manager: seed.role !== 'EMPLOYEE',
              headcount: 1,
              is_active: true,
              status: 'active',
              description: `Seeded position: ${seed.position}.`,
            }),
          );

        let user = await users.findOneBy({ email: seed.email });
        if (!user) {
          if (
            (await users.findOneBy({ phone: seed.phone })) ||
            (await users.findOneBy({ user_no: seed.no }))
          )
            throw new Error(`Account identifier collision for ${seed.email}.`);
          user = await users.save(
            users.create({
              user_no: seed.no,
              first_name: seed.first,
              last_name: seed.last,
              email: seed.email,
              phone: seed.phone,
              password: await hashPassword(rawPassword),
              user_type: 'COMPANY_USER',
              status: 'active',
              is_email_verified: true,
              must_set_password: true,
              activated_at: new Date(),
              account_provisioning_status: 'active',
            }),
          );
        } else if (
          user.status !== 'active' ||
          user.user_type !== 'COMPANY_USER'
        ) {
          throw new Error(
            `Existing account ${seed.email} is not an active company user; refusing to change it.`,
          );
        }

        let membership = await memberships.findOneBy({
          company_id: company.id,
          user_id: user.id,
        });
        if (!membership)
          membership = await memberships.save(
            memberships.create({
              company_id: company.id,
              user_id: user.id,
              status: 'active',
              is_default: true,
            }),
          );
        else if (membership.status !== 'active')
          throw new Error(
            `Existing Alliance membership for ${seed.email} is not active.`,
          );

        const role = await roles.findOneBy({
          company_id: company.id,
          name: seed.role,
        });
        if (!role) throw new Error(`Required role ${seed.role} is missing.`);
        if (
          !(await roleAssignments.findOneBy({
            company_user_id: membership.id,
            role_id: role.id,
          }))
        )
          await roleAssignments.save(
            roleAssignments.create({
              company_user_id: membership.id,
              role_id: role.id,
            }),
          );

        const departmentAssignment = await deptAccess.findOneBy({
          company_user_id: membership.id,
          department_id: department.id,
        });
        if (!departmentAssignment)
          await deptAccess.save(
            deptAccess.create({
              company_user_id: membership.id,
              department_id: department.id,
            }),
          );

        let employee = await employees.findOneBy({
          company_id: company.id,
          employee_no: seed.no,
        });
        if (!employee) {
          const linked = await employees.findOneBy({
            company_user_id: membership.id,
          });
          if (linked)
            throw new Error(
              `${seed.email} is already linked to employee ${linked.employee_no}; refusing to reassign it.`,
            );
          employee = employees.create({
            company_id: company.id,
            company_user_id: membership.id,
            employee_no: seed.no,
            first_name: seed.first,
            last_name: seed.last,
            gender: seed.gender,
            primary_branch_id: branch.id,
            primary_department_id: department.id,
            primary_position_id: position.id,
            employment_status: EmploymentStatusEnum.ACTIVE,
            employment_type: EmploymentTypeEnum.FULL_TIME,
            hire_date: HIRED_ON,
            confirmation_status: EmployeeConfirmationStatusEnum.CONFIRMED,
            confirmation_date: HIRED_ON,
            status_changed_at: new Date(),
            notes: 'Created by the explicit Alliance employee seeder.',
          });
        } else {
          if (
            employee.company_user_id &&
            employee.company_user_id !== membership.id
          )
            throw new Error(
              `Employee number ${seed.no} is linked to a different account.`,
            );
          employee.company_user_id = membership.id;
          employee.employment_status = EmploymentStatusEnum.ACTIVE;
          employee.primary_branch_id ??= branch.id;
          employee.primary_department_id ??= department.id;
          employee.primary_position_id ??= position.id;
        }
        employee = await employees.save(employee);
        employeesByNo.set(seed.no, employee);

        if (
          !(await empDepartments.findOneBy({
            employee_id: employee.id,
            department_id: department.id,
          }))
        )
          await empDepartments.save(
            empDepartments.create({
              employee_id: employee.id,
              department_id: department.id,
              is_primary: true,
            }),
          );
        if (
          !(await empPositions.findOneBy({
            company_id: company.id,
            employee_id: employee.id,
            position_id: position.id,
          }))
        )
          await empPositions.save(
            empPositions.create({
              company_id: company.id,
              employee_id: employee.id,
              position_id: position.id,
              is_primary: true,
              start_date: HIRED_ON,
            }),
          );
        const timetableAssignment = await employeeTimetables.findOneBy({
          companyId: company.id,
          employeeId: employee.id,
          timetableId: timetable.id,
          status: EmployeeTimetableStatusEnum.ACTIVE,
        });
        if (!timetableAssignment)
          await employeeTimetables.save(
            employeeTimetables.create({
              companyId: company.id,
              employeeId: employee.id,
              timetableId: timetable.id,
              effectiveFrom: HIRED_ON,
              effectiveTo: null,
              status: EmployeeTimetableStatusEnum.ACTIVE,
              assignedBy: null,
            }),
          );
      }

      const bosco = employeesByNo.get('AIC-EMP-1003')!;
      const jasson = employeesByNo.get('AIC-EMP-1002')!;
      if (bosco.reports_to !== jasson.id) {
        bosco.reports_to = jasson.id;
        await employees.save(bosco);
      }
      if (
        !(await reportingLines.findOneBy({
          company_id: company.id,
          employee_id: bosco.id,
          manager_employee_id: jasson.id,
          status: 'ACTIVE' as never,
        }))
      )
        await reportingLines.save(
          reportingLines.create({
            company_id: company.id,
            employee_id: bosco.id,
            manager_employee_id: jasson.id,
            effective_from: HIRED_ON,
            effective_to: null,
            status: 'ACTIVE' as never,
            assignment_reason: 'Department reporting line.',
          }),
        );
      for (const seed of EMPLOYEES.filter((e) => e.role !== 'EMPLOYEE')) {
        const employee = employeesByNo.get(seed.no)!;
        const department = departmentByCode.get(seed.dept)!;
        if (department.manager_employee_id !== employee.id) {
          department.manager_employee_id = employee.id;
          await departments.save(department);
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][AllianceEmployees] Ensured ${EMPLOYEES.length} active Alliance employees. New accounts require a password change at first login.`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }
}
