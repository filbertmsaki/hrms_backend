import { DataSource } from 'typeorm';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../../modules/companies/entities/company-user-permission.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { EmploymentStatusEnum } from '../../modules/hr/employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../../modules/hr/employees/enums/employment-type.enum';
import { FieldVisitCommercialPolicy } from '../../modules/hr/work-activities/entities/field-visit.entities';

const FIXTURE_MARKER = 'HRMS_MODULE8_UAT_ACCOUNT_V1';
const COMPANY_SLUG = 'alliance-insurance';

const ACCOUNTS = [
  {
    key: 'employee',
    email: 'module8.employee@example.test',
    userNo: 'M8-UAT-EMP-001',
    employeeNo: 'M8-UAT-EMP-001',
    firstName: 'Synthetic',
    lastName: 'Employee',
    roleName: 'EMPLOYEE',
    isManager: false,
  },
  {
    key: 'manager',
    email: 'module8.manager@example.test',
    userNo: 'M8-UAT-MGR-001',
    employeeNo: 'M8-UAT-MGR-001',
    firstName: 'Synthetic',
    lastName: 'Manager',
    roleName: 'DEPARTMENT_MANAGER',
    isManager: true,
  },
  {
    key: 'hr',
    email: 'module8.hr@example.test',
    userNo: 'M8-UAT-HR-001',
    employeeNo: 'M8-UAT-HR-001',
    firstName: 'Synthetic',
    lastName: 'HR',
    roleName: 'HR_MANAGER',
    isManager: false,
  },
  {
    key: 'unauthorized',
    email: 'module8.unauthorized@example.test',
    userNo: 'M8-UAT-UNAUTH-001',
    employeeNo: 'M8-UAT-UNAUTH-001',
    firstName: 'Synthetic',
    lastName: 'Unauthorized',
    roleName: 'EMPLOYEE',
    isManager: false,
  },
] as const;

const MANAGER_PERMISSIONS = [
  'work_activities:manager:read',
  'work_activities:manager:review',
  'field_visits:manager:read',
  'field_visits:manager:review',
];

/** Idempotently provisions role-based synthetic accounts in the guarded Module 8 UAT database. */
export async function seedModule8UatTestAccounts(dataSource: DataSource) {
  const password = process.env.MODULE8_UAT_ACCOUNT_PASSWORD?.trim();
  if (!password || password.length < 16) {
    throw new Error(
      'MODULE8_UAT_ACCOUNT_PASSWORD must be set to a 16+ character test-only password.',
    );
  }

  return dataSource.transaction(async (manager) => {
    const companies = manager.getRepository(Company);
    const users = manager.getRepository(User);
    const memberships = manager.getRepository(CompanyUser);
    const companyRoles = manager.getRepository(CompanyUserRole);
    const companyPermissions = manager.getRepository(CompanyUserPermission);
    const roles = manager.getRepository(Role);
    const permissions = manager.getRepository(Permission);
    const employees = manager.getRepository(Employee);
    const branches = manager.getRepository(Branch);
    const departments = manager.getRepository(Department);
    const positions = manager.getRepository(Position);
    const commercialPolicies = manager.getRepository(
      FieldVisitCommercialPolicy,
    );

    const company = await companies.findOne({ where: { slug: COMPANY_SLUG } });
    if (!company || company.name !== 'HRMS Module 8 Synthetic UAT') {
      throw new Error(
        'Expected the synthetic Module 8 company from the isolated test baseline.',
      );
    }
    const branch = await branches.findOne({
      where: { company_id: company.id, code: 'HQ', status: 'active' },
    });
    const department = await departments.findOne({
      where: { company_id: company.id, code: 'HQ_HUMAN_RESOURCES' },
    });
    const managerPosition = await positions.findOne({
      where: { company_id: company.id, is_manager: true, status: 'active' },
      order: { id: 'ASC' },
    });
    const employeePosition = await positions.findOne({
      where: { company_id: company.id, is_manager: false, status: 'active' },
      order: { id: 'ASC' },
    });
    if (!branch || !department || !managerPosition || !employeePosition) {
      throw new Error(
        'Synthetic company branch, HR department, or positions are missing; run the guarded baseline seed first.',
      );
    }

    const roleByName = new Map<string, Role>();
    for (const name of new Set(ACCOUNTS.map((account) => account.roleName))) {
      const role = await roles.findOne({
        where: { company_id: company.id, name },
      });
      if (!role) throw new Error(`Required company role ${name} is missing.`);
      roleByName.set(name, role);
    }

    const permissionByName = new Map<string, Permission>();
    for (const name of MANAGER_PERMISSIONS) {
      const permission = await permissions.findOne({ where: { name } });
      if (!permission) throw new Error(`Permission ${name} is missing.`);
      permissionByName.set(name, permission);
    }

    const passwordHash = await hashPassword(password);
    const provisioned: Record<
      string,
      { employeeId: number; companyUserId: number }
    > = {};
    let managerEmployeeId: number | null = null;
    let createdAccountCount = 0;

    for (const account of ACCOUNTS) {
      let user = await users.findOne({ where: { email: account.email } });
      if (user && user.user_no !== account.userNo) {
        throw new Error(
          `Refusing to reuse non-fixture account ${account.email}.`,
        );
      }
      if (!user) {
        createdAccountCount += 1;
        user = await users.save(
          users.create({
            user_no: account.userNo,
            first_name: account.firstName,
            last_name: account.lastName,
            phone: `+1555555020${ACCOUNTS.indexOf(account) + 1}`,
            email: account.email,
            password: passwordHash,
            status: 'active',
            user_type: 'COMPANY_USER',
            is_email_verified: true,
            must_set_password: false,
            auth_token_version: 1,
          }),
        );
      }

      let membership = await memberships.findOne({
        where: { company_id: company.id, user_id: user.id },
      });
      if (!membership) {
        membership = await memberships.save(
          memberships.create({
            company_id: company.id,
            user_id: user.id,
            status: 'active',
            is_default: true,
          }),
        );
      }

      const role = roleByName.get(account.roleName)!;
      if (
        !(await companyRoles.findOne({
          where: { company_user_id: membership.id, role_id: role.id },
        }))
      ) {
        await companyRoles.save(
          companyRoles.create({
            company_user_id: membership.id,
            role_id: role.id,
          }),
        );
      }

      let employee = await employees.findOne({
        where: { company_id: company.id, employee_no: account.employeeNo },
      });
      if (employee && employee.notes !== FIXTURE_MARKER) {
        throw new Error(
          `Refusing to reuse non-fixture employee ${account.employeeNo}.`,
        );
      }
      if (!employee) {
        createdAccountCount += 1;
        employee = await employees.save(
          employees.create({
            company_id: company.id,
            company_user_id: membership.id,
            employee_no: account.employeeNo,
            first_name: account.firstName,
            last_name: account.lastName,
            gender: 'other',
            primary_branch_id: branch.id,
            primary_department_id: department.id,
            primary_position_id: account.isManager
              ? managerPosition.id
              : employeePosition.id,
            employment_status: EmploymentStatusEnum.ACTIVE,
            employment_type: EmploymentTypeEnum.FULL_TIME,
            hire_date: '2026-01-01',
            reports_to: null,
            notes: FIXTURE_MARKER,
            metadata: { fixture: FIXTURE_MARKER, role: account.roleName },
          }),
        );
      }

      if (account.key === 'manager') managerEmployeeId = employee.id;
      provisioned[account.key] = {
        employeeId: employee.id,
        companyUserId: membership.id,
      };

      if (account.key === 'manager') {
        for (const permission of permissionByName.values()) {
          if (
            !(await companyPermissions.findOne({
              where: {
                company_user_id: membership.id,
                permission_id: permission.id,
              },
            }))
          ) {
            await companyPermissions.save(
              companyPermissions.create({
                company_user_id: membership.id,
                permission_id: permission.id,
              }),
            );
          }
        }
      }
    }

    const employee = await employees.findOneOrFail({
      where: {
        company_id: company.id,
        employee_no: 'M8-UAT-EMP-001',
      },
    });
    if (!managerEmployeeId)
      throw new Error('Manager employee was not created.');
    employee.reports_to = managerEmployeeId;
    await employees.save(employee);

    const managerEmployee = await employees.findOneOrFail({
      where: {
        company_id: company.id,
        employee_no: 'M8-UAT-MGR-001',
      },
    });
    if (
      department.manager_employee_id &&
      department.manager_employee_id !== managerEmployee.id
    ) {
      throw new Error('Refusing to replace a different department manager.');
    }
    department.manager_employee_id = managerEmployee.id;
    await departments.save(department);

    const commercialPolicy = await commercialPolicies.findOne({
      where: { companyId: company.id },
    });
    if (!commercialPolicy) {
      await commercialPolicies.save(
        commercialPolicies.create({
          companyId: company.id,
          defaultCurrency: 'TZS',
          supportedCurrencies: ['TZS'],
          allowEmployeeOpportunityValues: true,
          updatedByCompanyUserId: null,
        }),
      );
    }

    return {
      companyId: company.id,
      companyName: company.name,
      departmentId: department.id,
      managerEmployeeId: managerEmployee.id,
      accounts: provisioned,
      fixtureMarker: FIXTURE_MARKER,
      alreadyProvisioned: createdAccountCount === 0,
    };
  });
}
