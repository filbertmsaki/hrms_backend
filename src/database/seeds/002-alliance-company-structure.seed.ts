import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../../modules/companies/entities/company-user-permission.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Designation } from '../../modules/hr/designations/entities/designation.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { ContactTypeEnum } from '../../modules/hr/employees/enums/contact-type.enum';
import { EmployeePositionAssignmentTypeEnum } from '../../modules/hr/employees/enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from '../../modules/hr/employees/enums/employee-position-status.enum';
import { EmploymentStatusEnum } from '../../modules/hr/employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../../modules/hr/employees/enums/employment-type.enum';
import { EmployeeContact } from '../../modules/hr/employees/entities/employee-contact.entity';
import { EmployeeDesignation } from '../../modules/hr/employees/entities/employee-designation.entity';
import { EmployeeDepartment } from '../../modules/hr/employees/entities/employee-department.entity';
import { EmployeePosition } from '../../modules/hr/employees/entities/employee-position.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import {
  ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE,
  ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD,
  ALLIANCE_EMPLOYEE_HR_SEEDS,
  CompanyEmployeeHrSeed,
} from './company-hr-structure.constants';
import {
  ALLIANCE_BRANCHES,
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_DEPARTMENTS,
  ALLIANCE_EMPLOYEES,
  ALLIANCE_POSITIONS,
  CompanyDepartmentSeed,
  CompanyEmployeeSeed,
  CompanyPositionSeed,
} from './company-structure.constants';

type EntityMap<T> = Map<string, T>;

const POSITION_CATEGORY_TO_DEPARTMENT_CODE: Record<string, string> = {
  Administration: 'ADMIN',
  HR: 'HR',
  Accounts: 'ACCOUNTS',
  Claims: 'CLAIMS',
  Underwriting: 'UNDERWRITING',
  Bancassurance: 'BANCASSURANCE',
  'General Business': 'GENERAL_BUSINESS',
  IT: 'IT',
};

export default class AllianceCompanyStructureSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
      const companyRepo = manager.getRepository(Company);
      const branchRepo = manager.getRepository(Branch);
      const departmentRepo = manager.getRepository(Department);
      const designationRepo = manager.getRepository(Designation);
      const positionRepo = manager.getRepository(Position);
      const userRepo = manager.getRepository(User);
      const companyUserRepo = manager.getRepository(CompanyUser);
      const roleRepo = manager.getRepository(Role);
      const permissionRepo = manager.getRepository(Permission);
      const companyUserRoleRepo = manager.getRepository(CompanyUserRole);
      const companyUserPermissionRepo = manager.getRepository(CompanyUserPermission);
      const employeeRepo = manager.getRepository(Employee);
      const employeeContactRepo = manager.getRepository(EmployeeContact);
      const employeeDepartmentRepo = manager.getRepository(EmployeeDepartment);
      const employeePositionRepo = manager.getRepository(EmployeePosition);
      const employeeDesignationRepo = manager.getRepository(EmployeeDesignation);

      const company = await this.findExistingCompany(companyRepo);
      const branchMap = await this.syncBranches(branchRepo, company.id);
      const departmentMap = await this.syncDepartments(
        departmentRepo,
        company.id,
        branchMap,
      );
      const positionMap = await this.syncPositions(
        designationRepo,
        positionRepo,
        company.id,
        departmentMap,
      );

      await this.syncEmployees(
        userRepo,
        companyUserRepo,
        roleRepo,
        permissionRepo,
        companyUserRoleRepo,
        companyUserPermissionRepo,
        employeeRepo,
        employeeContactRepo,
        employeeDepartmentRepo,
        employeePositionRepo,
        employeeDesignationRepo,
        company.id,
        branchMap,
        departmentMap,
        positionMap,
      );

      await queryRunner.commitTransaction();
      console.log(`[Seeder][AllianceCompanyStructure] Completed for ${company.name}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[Seeder][AllianceCompanyStructure] Failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findExistingCompany(
    companyRepo: Repository<Company>,
  ): Promise<Company> {
    const companyName = (
      process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME
    ).trim();

    const company = await companyRepo.findOne({
      where: { name: companyName },
    });

    if (!company) {
      throw new Error(
        'Default company not found. Please run 001-initial-rbac.seed.ts first to create the Alliance company.',
      );
    }

    return company;
  }

  private async syncBranches(
    branchRepo: Repository<Branch>,
    companyId: number,
  ): Promise<EntityMap<Branch>> {
    const existingBranches = await branchRepo.find({
      where: { company_id: companyId },
    });
    const branchMap = new Map<string, Branch>();

    for (const seed of ALLIANCE_BRANCHES) {
      let branch =
        existingBranches.find(
          (item) => this.normalizeKey(item.code) === this.normalizeKey(seed.code),
        ) ??
        existingBranches.find(
          (item) => this.normalizeKey(item.name) === this.normalizeKey(seed.name),
        ) ??
        null;

      if (!branch) {
        branch = branchRepo.create({
          company_id: companyId,
        });
      }

      branch.name = seed.name;
      branch.code = seed.code;
      branch.city = seed.city;
      branch.country = seed.country;
      branch.status = seed.status ?? 'active';

      branch = await branchRepo.save(branch);
      branchMap.set(this.normalizeKey(seed.code), branch);
      branchMap.set(this.normalizeKey(seed.name), branch);
    }

    return branchMap;
  }

  private async syncDepartments(
    departmentRepo: Repository<Department>,
    companyId: number,
    branchMap: EntityMap<Branch>,
  ): Promise<EntityMap<Department>> {
    const existingDepartments = await departmentRepo.find({
      where: { company_id: companyId },
    });
    const departmentMap = new Map<string, Department>();

    for (const seed of ALLIANCE_DEPARTMENTS) {
      const branch = this.getRequiredBranch(branchMap, seed.branchCode, seed.name);

      let department =
        existingDepartments.find(
          (item) => this.normalizeKey(item.code) === this.normalizeKey(seed.code),
        ) ??
        existingDepartments.find(
          (item) => this.normalizeKey(item.name) === this.normalizeKey(seed.name),
        ) ??
        null;

      if (!department) {
        department = departmentRepo.create({
          company_id: companyId,
        });
      }

      department.branch_id = branch.id;
      department.parent_id = null;
      department.name = seed.name;
      department.code = seed.code;
      department.description = seed.description;
      department.status = 'active';

      department = await departmentRepo.save(department);
      departmentMap.set(this.normalizeKey(seed.code), department);
      departmentMap.set(this.normalizeKey(seed.name), department);
    }

    return departmentMap;
  }

  private async syncPositions(
    designationRepo: Repository<Designation>,
    positionRepo: Repository<Position>,
    companyId: number,
    departmentMap: EntityMap<Department>,
  ): Promise<EntityMap<Position>> {
    const existingDesignations = await designationRepo.find({
      where: { company_id: companyId },
    });
    const existingPositions = await positionRepo.find({
      where: { company_id: companyId },
    });
    const positionMap = new Map<string, Position>();

    for (const seed of ALLIANCE_POSITIONS) {
      const departmentCode = POSITION_CATEGORY_TO_DEPARTMENT_CODE[seed.category] ?? null;
      const department = departmentCode
        ? this.getRequiredDepartmentByCode(departmentMap, departmentCode, seed.name)
        : null;

      let designation =
        existingDesignations.find(
          (item) => this.normalizeKey(item.code) === this.normalizeKey(seed.code),
        ) ??
        existingDesignations.find(
          (item) =>
            this.normalizeKey(item.name) === this.normalizeKey(seed.name) &&
            item.department_id === (department?.id ?? null),
        ) ??
        null;

      if (!designation) {
        designation = designationRepo.create({
          company_id: companyId,
        });
        existingDesignations.push(designation);
      }

      designation.department_id = department?.id ?? null;
      designation.name = seed.name;
      designation.code = seed.code;
      designation.hierarchy_level = seed.level;
      designation.grade_level = null;
      designation.is_managerial = seed.isManager;
      designation.description = seed.description;
      designation.status = 'active';

      designation = await designationRepo.save(designation);

      let position =
        existingPositions.find(
          (item) => this.normalizeKey(item.code) === this.normalizeKey(seed.code),
        ) ??
        existingPositions.find(
          (item) => this.normalizeKey(item.name) === this.normalizeKey(seed.name),
        ) ??
        null;

      if (!position) {
        position = positionRepo.create({
          company_id: companyId,
        });
        existingPositions.push(position);
      }

      position.branch_id = department?.branch_id ?? null;
      position.department_id = department?.id ?? null;
      position.designation_id = designation.id;
      position.reports_to_position_id = null;
      position.name = seed.name;
      position.code = seed.code;
      position.level = seed.level;
      position.is_manager = seed.isManager;
      position.headcount = 1;
      position.is_active = true;
      position.description = seed.description;
      position.status = 'active';

      position = await positionRepo.save(position);
      positionMap.set(this.normalizeKey(seed.code), position);
    }

    return positionMap;
  }

  private async syncEmployees(
    userRepo: Repository<User>,
    companyUserRepo: Repository<CompanyUser>,
    roleRepo: Repository<Role>,
    permissionRepo: Repository<Permission>,
    companyUserRoleRepo: Repository<CompanyUserRole>,
    companyUserPermissionRepo: Repository<CompanyUserPermission>,
    employeeRepo: Repository<Employee>,
    employeeContactRepo: Repository<EmployeeContact>,
    employeeDepartmentRepo: Repository<EmployeeDepartment>,
    employeePositionRepo: Repository<EmployeePosition>,
    employeeDesignationRepo: Repository<EmployeeDesignation>,
    companyId: number,
    branchMap: EntityMap<Branch>,
    departmentMap: EntityMap<Department>,
    positionMap: EntityMap<Position>,
  ): Promise<void> {
    const roleMap = await this.resolveRoleMap(roleRepo, companyId);
    const permissionMap = await this.resolvePermissionMap(permissionRepo);

    const hrSeedMap = new Map<string, CompanyEmployeeHrSeed>(
      ALLIANCE_EMPLOYEE_HR_SEEDS.map((seed) => [seed.employeeNo, seed]),
    );

    const existingEmployees = await employeeRepo.find({
      where: { company_user: { company_id: companyId } },
      relations: ['company_user'],
    });
    const employeeByNo = new Map(
      existingEmployees.map((employee) => [employee.employee_no, employee]),
    );

    for (const seed of ALLIANCE_EMPLOYEES) {
      const user = await this.ensureUser(userRepo, seed);
      const membership = await this.ensureMembership(companyUserRepo, companyId, user.id);
      await this.ensureMembershipAccess(
        companyUserRoleRepo,
        companyUserPermissionRepo,
        membership.id,
        seed,
        roleMap,
        permissionMap,
      );
      const branch = this.getRequiredBranch(
        branchMap,
        seed.primaryBranchCode,
        seed.employeeNo,
      );
      const department = this.getRequiredDepartment(
        departmentMap,
        seed.primaryDepartmentCode,
        seed.employeeNo,
      );
      const position = this.getRequiredPosition(positionMap, seed.positionCode, seed.employeeNo);

      let employee = employeeByNo.get(seed.employeeNo) ?? null;
      if (!employee) {
        employee = employeeRepo.create({
          company_user_id: membership.id,
        });
      }

      employee.company_user_id = membership.id;
      employee.employee_no = seed.employeeNo;
      employee.first_name = seed.firstName;
      employee.middle_name = null;
      employee.last_name = seed.lastName;
      employee.preferred_name = null;
      employee.gender = null;
      employee.date_of_birth = null;
      employee.marital_status = null;
      employee.nationality = null;
      employee.profile_photo_url = null;
      employee.primary_branch_id = branch.id;
      employee.primary_department_id = department.id;
      employee.primary_position_id = position.id;
      employee.primary_designation_id = position.designation_id ?? null;
      employee.employment_status = EmploymentStatusEnum.ACTIVE;
      employee.employment_type = EmploymentTypeEnum.FULL_TIME;
      employee.hire_date = ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE;
      employee.probation_end_date = null;
      employee.confirmation_date = null;
      employee.exit_date = null;
      employee.exit_reason = null;
      employee.notes = 'Seeded Alliance company structure employee';
      employee.metadata = {
        seeded: true,
      };

      employee = await employeeRepo.save(employee);
      employeeByNo.set(seed.employeeNo, employee);

      await this.ensureWorkContact(employeeContactRepo, employee.id, seed);
      await this.ensureDepartmentAssignments(
        employeeDepartmentRepo,
        employee.id,
        department.id,
        hrSeedMap.get(seed.employeeNo),
        departmentMap,
      );
      await this.ensurePositionAssignment(
        employeePositionRepo,
        companyId,
        employee.id,
        position.id,
        position.designation_id ?? null,
      );
      await this.ensureDesignationAssignment(
        employeeDesignationRepo,
        companyId,
        employee.id,
        position.designation_id ?? null,
      );
    }

    for (const seed of ALLIANCE_EMPLOYEES) {
      const employee = employeeByNo.get(seed.employeeNo);
      if (!employee) {
        continue;
      }

      employee.reports_to = seed.reportsToEmployeeNo
        ? employeeByNo.get(seed.reportsToEmployeeNo)?.id ?? null
        : null;

      await employeeRepo.save(employee);
    }
  }

  private async ensureUser(
    userRepo: Repository<User>,
    seed: CompanyEmployeeSeed,
  ): Promise<User> {
    const user =
      (await userRepo.findOne({
        where: [{ email: seed.email }, { phone: seed.phone }],
      })) ?? userRepo.create();

    user.user_no = seed.employeeNo;
    user.first_name = seed.firstName;
    user.last_name = seed.lastName;
    user.phone = seed.phone;
    user.email = seed.email;
    user.status = 'active';
    user.user_type = 'COMPANY_USER';
    user.is_email_verified = true;

    if (!user.password) {
      user.password = await hashPassword(ALLIANCE_EMPLOYEE_DEFAULT_PASSWORD);
    }

    return userRepo.save(user);
  }

  private async ensureMembership(
    companyUserRepo: Repository<CompanyUser>,
    companyId: number,
    userId: number,
  ): Promise<CompanyUser> {
    let membership = await companyUserRepo.findOne({
      where: { company_id: companyId, user_id: userId },
    });

    if (!membership) {
      membership = companyUserRepo.create({
        company_id: companyId,
        user_id: userId,
      });
    }

    membership.status = 'active';
    if (membership.is_default === null || membership.is_default === undefined) {
      membership.is_default = false;
    }

    return companyUserRepo.save(membership);
  }

  private async resolveRoleMap(
    roleRepo: Repository<Role>,
    companyId: number,
  ): Promise<Map<string, Role>> {
    const requiredRoleNamesForQuery = new Set<string>();
    const requiredRoleNamesNormalized = new Set<string>();

    ALLIANCE_EMPLOYEES.forEach((seed) => {
      const roleNames = seed.roleNames?.length ? seed.roleNames : ['USER'];
      roleNames.forEach((roleName) => {
        requiredRoleNamesForQuery.add(roleName.trim());
        requiredRoleNamesNormalized.add(this.normalizeKey(roleName));
      });
    });

    if (!requiredRoleNamesForQuery.size) {
      return new Map<string, Role>();
    }

    const roles = await roleRepo
      .createQueryBuilder('role')
      .where('role.name IN (:...roleNames)', {
        roleNames: Array.from(requiredRoleNamesForQuery),
      })
      .andWhere('(role.company_id = :companyId OR role.company_id IS NULL)', {
        companyId,
      })
      .getMany();

    const roleMap = new Map<string, Role>();

    roles.forEach((role) => {
      const key = this.normalizeKey(role.name);
      const existing = roleMap.get(key);

      if (!existing || (existing.company_id === null && role.company_id === companyId)) {
        roleMap.set(key, role);
      }
    });

    for (const roleName of requiredRoleNamesNormalized) {
      if (!roleMap.has(roleName)) {
        throw new Error(
          `Role "${roleName}" was not found for company_id=${companyId}. Run 001-initial-rbac.seed.ts first.`,
        );
      }
    }

    return roleMap;
  }

  private async resolvePermissionMap(
    permissionRepo: Repository<Permission>,
  ): Promise<Map<string, Permission>> {
    const requiredPermissionNamesForQuery = new Set<string>();
    const requiredPermissionNamesNormalized = new Set<string>();

    ALLIANCE_EMPLOYEES.forEach((seed) => {
      seed.permissionNames?.forEach((permissionName) => {
        requiredPermissionNamesForQuery.add(permissionName.trim());
        requiredPermissionNamesNormalized.add(this.normalizeKey(permissionName));
      });
    });

    if (!requiredPermissionNamesForQuery.size) {
      return new Map<string, Permission>();
    }

    const permissions = await permissionRepo.find({
      where: Array.from(requiredPermissionNamesForQuery).map((permissionName) => ({
        name: permissionName,
      })),
    });

    const permissionMap = new Map<string, Permission>();
    permissions.forEach((permission) => {
      permissionMap.set(this.normalizeKey(permission.name), permission);
    });

    for (const permissionName of requiredPermissionNamesNormalized) {
      if (!permissionMap.has(permissionName)) {
        throw new Error(
          `Permission "${permissionName}" was not found. Run 001-initial-rbac.seed.ts first.`,
        );
      }
    }

    return permissionMap;
  }

  private async ensureMembershipAccess(
    companyUserRoleRepo: Repository<CompanyUserRole>,
    companyUserPermissionRepo: Repository<CompanyUserPermission>,
    companyUserId: number,
    seed: CompanyEmployeeSeed,
    roleMap: Map<string, Role>,
    permissionMap: Map<string, Permission>,
  ): Promise<void> {
    const roleNames = seed.roleNames?.length ? seed.roleNames : ['USER'];
    const permissionNames = seed.permissionNames ?? [];

    for (const roleName of roleNames) {
      const role = roleMap.get(this.normalizeKey(roleName));
      if (!role) {
        throw new Error(
          `Role "${roleName}" not found while assigning access for employee_no=${seed.employeeNo}.`,
        );
      }

      const existingRoleAssignment = await companyUserRoleRepo.findOne({
        where: {
          company_user_id: companyUserId,
          role_id: role.id,
        },
      });

      if (!existingRoleAssignment) {
        await companyUserRoleRepo.save(
          companyUserRoleRepo.create({
            company_user_id: companyUserId,
            role_id: role.id,
          }),
        );
      }
    }

    for (const permissionName of permissionNames) {
      const permission = permissionMap.get(this.normalizeKey(permissionName));
      if (!permission) {
        throw new Error(
          `Permission "${permissionName}" not found while assigning access for employee_no=${seed.employeeNo}.`,
        );
      }

      const existingPermissionAssignment = await companyUserPermissionRepo.findOne({
        where: {
          company_user_id: companyUserId,
          permission_id: permission.id,
        },
      });

      if (!existingPermissionAssignment) {
        await companyUserPermissionRepo.save(
          companyUserPermissionRepo.create({
            company_user_id: companyUserId,
            permission_id: permission.id,
          }),
        );
      }
    }
  }

  private async ensureWorkContact(
    employeeContactRepo: Repository<EmployeeContact>,
    employeeId: number,
    seed: CompanyEmployeeSeed,
  ): Promise<void> {
    const contacts = await employeeContactRepo.find({
      where: {
        employee_id: employeeId,
        contact_type: ContactTypeEnum.WORK,
      },
      order: { id: 'ASC' },
    });

    await employeeContactRepo.update(
      {
        employee_id: employeeId,
        contact_type: ContactTypeEnum.WORK,
      },
      { is_primary: false },
    );

    const contact = contacts[0] ?? employeeContactRepo.create();
    contact.employee_id = employeeId;
    contact.contact_type = ContactTypeEnum.WORK;
    contact.phone_number = seed.phone;
    contact.email = seed.email;
    contact.is_primary = true;
    contact.is_verified = true;
    contact.notes = 'Seeded primary work contact';

    await employeeContactRepo.save(contact);
  }

  private async ensureDepartmentAssignments(
    employeeDepartmentRepo: Repository<EmployeeDepartment>,
    employeeId: number,
    primaryDepartmentId: number,
    hrSeed: CompanyEmployeeHrSeed | undefined,
    departmentMap: EntityMap<Department>,
  ): Promise<void> {
    await employeeDepartmentRepo.update({ employee_id: employeeId }, { is_primary: false });

    const departmentIds = [
      primaryDepartmentId,
      ...((hrSeed?.secondaryDepartmentCodes ?? []).map((code) =>
        this.getRequiredDepartmentByCode(
          departmentMap,
          code,
          hrSeed?.employeeNo ?? `employee_id=${employeeId}`,
        ).id,
      )),
    ];

    for (const [index, departmentId] of departmentIds.entries()) {
      let assignment = await employeeDepartmentRepo.findOne({
        where: {
          employee_id: employeeId,
          department_id: departmentId,
        },
      });

      if (!assignment) {
        assignment = employeeDepartmentRepo.create({
          employee_id: employeeId,
          department_id: departmentId,
        });
      }

      assignment.is_primary = index === 0;
      await employeeDepartmentRepo.save(assignment);
    }
  }

  private async ensurePositionAssignment(
    employeePositionRepo: Repository<EmployeePosition>,
    companyId: number,
    employeeId: number,
    positionId: number,
    designationId: number | null,
  ): Promise<void> {
    await employeePositionRepo.update(
      { employee_id: employeeId },
      {
        is_primary: false,
        assignment_type: EmployeePositionAssignmentTypeEnum.SECONDARY,
        status: EmployeePositionStatusEnum.INACTIVE,
        end_date: ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE,
      },
    );

    let assignment = await employeePositionRepo.findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        position_id: positionId,
      },
    });

    if (!assignment) {
      assignment = employeePositionRepo.create({
        company_id: companyId,
        employee_id: employeeId,
        position_id: positionId,
      });
    }

    assignment.designation_id = designationId;
    assignment.is_primary = true;
    assignment.start_date = ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE;
    assignment.end_date = null;
    assignment.assignment_type = EmployeePositionAssignmentTypeEnum.PRIMARY;
    assignment.status = EmployeePositionStatusEnum.ACTIVE;
    assignment.notes = 'Seeded primary position assignment';

    await employeePositionRepo.save(assignment);
  }

  private async ensureDesignationAssignment(
    employeeDesignationRepo: Repository<EmployeeDesignation>,
    companyId: number,
    employeeId: number,
    designationId: number | null,
  ): Promise<void> {
    if (!designationId) {
      return;
    }

    await employeeDesignationRepo.update(
      { employee_id: employeeId },
      {
        is_current: false,
        end_date: ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE,
      },
    );

    let assignment = await employeeDesignationRepo.findOne({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        designation_id: designationId,
      },
    });

    if (!assignment) {
      assignment = employeeDesignationRepo.create({
        company_id: companyId,
        employee_id: employeeId,
        designation_id: designationId,
      });
    }

    assignment.start_date = ALLIANCE_EMPLOYEE_DEFAULT_HIRE_DATE;
    assignment.end_date = null;
    assignment.is_current = true;
    assignment.remarks = 'Seeded primary designation assignment';

    await employeeDesignationRepo.save(assignment);
  }

  private getRequiredBranch(
    branchMap: EntityMap<Branch>,
    branchKey: string,
    context: string,
  ): Branch {
    const branch = branchMap.get(this.normalizeKey(branchKey));
    if (!branch) {
      throw new Error(`Branch "${branchKey}" not found for ${context}.`);
    }

    return branch;
  }

  private getRequiredDepartment(
    departmentMap: EntityMap<Department>,
    departmentKey: string,
    context: string,
  ): Department {
    const department = departmentMap.get(this.normalizeKey(departmentKey));
    if (!department) {
      throw new Error(`Department "${departmentKey}" not found for ${context}.`);
    }

    return department;
  }

  private getRequiredDepartmentByCode(
    departmentMap: EntityMap<Department>,
    departmentCode: string,
    context: string,
  ): Department {
    return this.getRequiredDepartment(departmentMap, departmentCode, context);
  }

  private getRequiredPosition(
    positionMap: EntityMap<Position>,
    positionCode: string,
    context: string,
  ): Position {
    const position = positionMap.get(this.normalizeKey(positionCode));
    if (!position) {
      throw new Error(`Position "${positionCode}" not found for ${context}.`);
    }

    return position;
  }

  private normalizeKey(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }
}
