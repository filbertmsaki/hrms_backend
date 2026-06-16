import { DataSource, IsNull, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { AccessOrganization } from '../../modules/access-control/access-organizations/entity/access-organization.entity';
import { AccessOrganizationSourceEnum } from '../../modules/access-control/access-organizations/enum/access-organization-source.enum';
import { AccessOrganizationSyncStatusEnum } from '../../modules/access-control/access-organizations/enum/access-organization-sync-status.enum';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../modules/access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../../modules/access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import { EmployeeDeviceAssignment } from '../../modules/access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../../modules/access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserPermission } from '../../modules/companies/entities/company-user-permission.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { Designation } from '../../modules/hr/designations/entities/designation.entity';
import { Department } from '../../modules/hr/departments/entities/department.entity';
import { AddressTypeEnum } from '../../modules/hr/employees/enums/address-type.enum';
import { ContactTypeEnum } from '../../modules/hr/employees/enums/contact-type.enum';
import { EmployeePositionAssignmentTypeEnum } from '../../modules/hr/employees/enums/employee-position-assignment-type.enum';
import { EmployeePositionStatusEnum } from '../../modules/hr/employees/enums/employee-position-status.enum';
import { EmploymentStatusEnum } from '../../modules/hr/employees/enums/employment-status.enum';
import { EmploymentTypeEnum } from '../../modules/hr/employees/enums/employment-type.enum';
import { IdentificationTypeEnum } from '../../modules/hr/employees/enums/identification-type.enum';
import { EmployeeAcademicQualification } from '../../modules/hr/employees/entities/employee-academic-qualification.entity';
import { EmployeeAddress } from '../../modules/hr/employees/entities/employee-address.entity';
import { EmployeeBankAccount } from '../../modules/hr/employees/entities/employee-bank-account.entity';
import { EmployeeContact } from '../../modules/hr/employees/entities/employee-contact.entity';
import { EmployeeDesignation } from '../../modules/hr/employees/entities/employee-designation.entity';
import { EmployeeDepartment } from '../../modules/hr/employees/entities/employee-department.entity';
import { EmployeeExperience } from '../../modules/hr/employees/entities/employee-experience.entity';
import { EmployeeIdentification } from '../../modules/hr/employees/entities/employee-identification.entity';
import { EmployeePosition } from '../../modules/hr/employees/entities/employee-position.entity';
import { EmployeeProfessionalQualification } from '../../modules/hr/employees/entities/employee-professional-qualification.entity';
import { EmployeeRelative } from '../../modules/hr/employees/entities/employee-relative.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { Position } from '../../modules/hr/positions/entities/position.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { EmployeeDeviceIdentity } from '../../modules/hr/attendance/processing/entities/employee-device-identity.entity';
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

const DEFAULT_ACCESS_ORGANIZATION_NAME = 'Alliance staff';
const DEFAULT_HIKVISION_DEVICE_IP_ADDRESS = '192.168.1.216';
const DEFAULT_HIKVISION_DEVICE_PORT = 80;
const DEFAULT_HIKVISION_DEVICE_CODE_SUFFIX = 'MAIN';
const DEFAULT_HIKVISION_DEVICE_SERIAL = 'AA4693697';
const DEFAULT_HIKVISION_DEVICE_TIMEZONE = 'Africa/Dar_es_Salaam';

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
      const employeeAddressRepo = manager.getRepository(EmployeeAddress);
      const employeeBankAccountRepo = manager.getRepository(EmployeeBankAccount);
      const employeeRelativeRepo = manager.getRepository(EmployeeRelative);
      const employeeIdentificationRepo = manager.getRepository(EmployeeIdentification);
      const employeeAcademicQualificationRepo = manager.getRepository(
        EmployeeAcademicQualification,
      );
      const employeeProfessionalQualificationRepo = manager.getRepository(
        EmployeeProfessionalQualification,
      );
      const employeeExperienceRepo = manager.getRepository(EmployeeExperience);
      const employeeDepartmentRepo = manager.getRepository(EmployeeDepartment);
      const employeePositionRepo = manager.getRepository(EmployeePosition);
      const employeeDesignationRepo = manager.getRepository(EmployeeDesignation);
      const employeeDeviceIdentityRepo = manager.getRepository(EmployeeDeviceIdentity);
      const attendanceDeviceRepo = manager.getRepository(AttendanceDevice);
      const accessOrganizationRepo = manager.getRepository(AccessOrganization);
      const employeeDeviceAssignmentRepo = manager.getRepository(EmployeeDeviceAssignment);

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
        employeeAddressRepo,
        employeeBankAccountRepo,
        employeeRelativeRepo,
        employeeIdentificationRepo,
        employeeAcademicQualificationRepo,
        employeeProfessionalQualificationRepo,
        employeeExperienceRepo,
        employeeDepartmentRepo,
        employeePositionRepo,
        employeeDesignationRepo,
        employeeDeviceIdentityRepo,
        attendanceDeviceRepo,
        accessOrganizationRepo,
        employeeDeviceAssignmentRepo,
        company,
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
    employeeAddressRepo: Repository<EmployeeAddress>,
    employeeBankAccountRepo: Repository<EmployeeBankAccount>,
    employeeRelativeRepo: Repository<EmployeeRelative>,
    employeeIdentificationRepo: Repository<EmployeeIdentification>,
    employeeAcademicQualificationRepo: Repository<EmployeeAcademicQualification>,
    employeeProfessionalQualificationRepo: Repository<EmployeeProfessionalQualification>,
    employeeExperienceRepo: Repository<EmployeeExperience>,
    employeeDepartmentRepo: Repository<EmployeeDepartment>,
    employeePositionRepo: Repository<EmployeePosition>,
    employeeDesignationRepo: Repository<EmployeeDesignation>,
    employeeDeviceIdentityRepo: Repository<EmployeeDeviceIdentity>,
    attendanceDeviceRepo: Repository<AttendanceDevice>,
    accessOrganizationRepo: Repository<AccessOrganization>,
    employeeDeviceAssignmentRepo: Repository<EmployeeDeviceAssignment>,
    company: Company,
    branchMap: EntityMap<Branch>,
    departmentMap: EntityMap<Department>,
    positionMap: EntityMap<Position>,
  ): Promise<void> {
    const companyId = company.id;
    const roleMap = await this.resolveRoleMap(roleRepo, companyId);
    const permissionMap = await this.resolvePermissionMap(permissionRepo);
    const defaultDevice = await this.ensureDefaultAttendanceDevice(
      attendanceDeviceRepo,
      companyId,
      branchMap,
    );
    const defaultOrganization = await this.ensureDefaultAccessOrganization(
      accessOrganizationRepo,
      companyId,
    );
    const employeeNumberPrefix = this.resolveEmployeeNumberPrefix(company);

    const hrSeedMap = new Map<string, CompanyEmployeeHrSeed>(
      ALLIANCE_EMPLOYEE_HR_SEEDS.map((seed) => [seed.employeeNo, seed]),
    );

    const existingEmployees = await employeeRepo.find({
      where: { company_user: { company_id: companyId } },
      relations: ['company_user'],
    });
    const employeeByCompanyUserId = new Map(
      existingEmployees.map((employee) => [employee.company_user_id, employee]),
    );
    const employeeBySeedKey = new Map<string, Employee>();
    const employeeByHikvisionNo = new Map<string, Employee>();
    for (const existingEmployee of existingEmployees) {
      const hikvisionEmployeeNo = this.extractSeededHikvisionEmployeeNo(existingEmployee);
      if (hikvisionEmployeeNo) {
        employeeByHikvisionNo.set(hikvisionEmployeeNo, existingEmployee);
      }
    }
    let nextEmployeeSequence = this.resolveNextEmployeeSequence(
      existingEmployees,
      employeeNumberPrefix,
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
      const sequence = this.getEmployeeSequence(seed.hikvisionEmployeeNo);

      let employee =
        employeeByCompanyUserId.get(membership.id) ??
        employeeByHikvisionNo.get(seed.hikvisionEmployeeNo) ??
        null;
      if (!employee) {
        employee = employeeRepo.create({
          company_user_id: membership.id,
        });
      }
      const employeeNo = this.resolveEmployeeNumberForSeededEmployee(
        employee,
        employeeNumberPrefix,
        nextEmployeeSequence,
      );
      if (this.isGeneratedEmployeeNumber(employee.employee_no, employeeNumberPrefix)) {
        const existingSequence = this.parseGeneratedEmployeeNumberSequence(
          employee.employee_no,
          employeeNumberPrefix,
        );
        if (existingSequence !== null && existingSequence >= nextEmployeeSequence) {
          nextEmployeeSequence = existingSequence + 1;
        }
      } else {
        nextEmployeeSequence += 1;
      }

      employee.company_user_id = membership.id;
      employee.employee_no = employeeNo;
      employee.first_name = seed.firstName;
      employee.middle_name = this.generateMiddleName(seed.firstName);
      employee.last_name = seed.lastName;
      employee.preferred_name = seed.firstName;
      employee.gender = sequence % 2 === 0 ? 'female' : 'male';
      employee.date_of_birth = this.buildDate(1986 + (sequence % 8), sequence, sequence + 7);
      employee.marital_status = sequence % 3 === 0 ? 'married' : 'single';
      employee.nationality = 'Tanzanian';
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
        fullProfileSeeded: true,
        hikvision: {
          employee_no: seed.hikvisionEmployeeNo,
          source: 'alliance-company-structure-seed',
        },
      };

      employee = await employeeRepo.save(employee);
      employeeByCompanyUserId.set(membership.id, employee);
      employeeBySeedKey.set(seed.employeeNo, employee);
      employeeByHikvisionNo.set(seed.hikvisionEmployeeNo, employee);

      await this.ensureWorkContact(employeeContactRepo, employee.id, seed);
      await this.ensurePersonalContact(employeeContactRepo, employee.id, seed, sequence);
      await this.ensurePrimaryAddress(employeeAddressRepo, employee.id, sequence);
      await this.ensurePrimaryRelative(employeeRelativeRepo, employee.id, seed, sequence);
      await this.ensurePrimaryIdentification(
        employeeIdentificationRepo,
        employee.id,
        seed,
        sequence,
      );
      await this.ensurePrimaryBankAccount(
        employeeBankAccountRepo,
        employee.id,
        seed,
        sequence,
      );
      await this.ensureAcademicQualification(
        employeeAcademicQualificationRepo,
        employee.id,
        membership.id,
        sequence,
      );
      await this.ensureProfessionalQualification(
        employeeProfessionalQualificationRepo,
        employee.id,
        membership.id,
        sequence,
      );
      await this.ensureExperienceDetail(employeeExperienceRepo, employee.id, sequence);
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
      await this.ensureEmployeeDeviceAssignment(
        employeeDeviceAssignmentRepo,
        companyId,
        employee,
        defaultDevice,
        defaultOrganization,
        seed.hikvisionEmployeeNo,
      );
      await this.ensureHikvisionIdentity(
        employeeDeviceIdentityRepo,
        companyId,
        employee.id,
        seed.hikvisionEmployeeNo,
        null,
      );
      await this.ensureHikvisionIdentity(
        employeeDeviceIdentityRepo,
        companyId,
        employee.id,
        seed.hikvisionEmployeeNo,
        defaultDevice.id,
      );
    }

    for (const seed of ALLIANCE_EMPLOYEES) {
      const employee = employeeBySeedKey.get(seed.employeeNo);
      if (!employee) {
        continue;
      }

      employee.reports_to = seed.reportsToEmployeeNo
        ? employeeBySeedKey.get(seed.reportsToEmployeeNo)?.id ?? null
        : null;

      await employeeRepo.save(employee);
    }
  }

  private async ensureUser(
    userRepo: Repository<User>,
    seed: CompanyEmployeeSeed,
  ): Promise<User> {
    const [userByNo, userByEmail, userByPhone] = await Promise.all([
      userRepo.findOne({
        where: { user_no: seed.employeeNo },
        select: [
          'id',
          'user_no',
          'first_name',
          'last_name',
          'phone',
          'email',
          'password',
          'status',
          'user_type',
          'is_email_verified',
        ],
      }),
      userRepo.findOne({
        where: { email: seed.email },
        select: [
          'id',
          'user_no',
          'first_name',
          'last_name',
          'phone',
          'email',
          'password',
          'status',
          'user_type',
          'is_email_verified',
        ],
      }),
      userRepo.findOne({
        where: { phone: seed.phone },
        select: [
          'id',
          'user_no',
          'first_name',
          'last_name',
          'phone',
          'email',
          'password',
          'status',
          'user_type',
          'is_email_verified',
        ],
      }),
    ]);

    const user = userByNo ?? userByEmail ?? userByPhone ?? userRepo.create();

    const resolvedIds = new Set(
      [userByNo?.id, userByEmail?.id, userByPhone?.id].filter(
        (id): id is number => typeof id === 'number',
      ),
    );

    if (resolvedIds.size > 1) {
      console.warn(
        `[Seeder][AllianceCompanyStructure] Conflicting user identifiers for ${seed.employeeNo}; reusing user id=${user.id}.`,
      );
    }

    if (!userByNo || userByNo.id === user.id) {
      user.user_no = seed.employeeNo;
    }
    user.first_name = seed.firstName;
    user.last_name = seed.lastName;

    if (!userByPhone || userByPhone.id === user.id) {
      user.phone = seed.phone;
    }

    if (!userByEmail || userByEmail.id === user.id) {
      user.email = seed.email;
    }

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

  private async ensurePersonalContact(
    employeeContactRepo: Repository<EmployeeContact>,
    employeeId: number,
    seed: CompanyEmployeeSeed,
    sequence: number,
  ): Promise<void> {
    const contacts = await employeeContactRepo.find({
      where: {
        employee_id: employeeId,
        contact_type: ContactTypeEnum.PERSONAL,
      },
      order: { id: 'ASC' },
    });

    const contact = contacts[0] ?? employeeContactRepo.create();
    contact.employee_id = employeeId;
    contact.contact_type = ContactTypeEnum.PERSONAL;
    contact.phone_number = `+255711${String(sequence).padStart(6, '0')}`;
    contact.email = this.buildPersonalEmail(seed);
    contact.is_primary = false;
    contact.is_verified = true;
    contact.notes = 'Seeded personal contact';

    await employeeContactRepo.save(contact);
  }

  private async ensurePrimaryAddress(
    employeeAddressRepo: Repository<EmployeeAddress>,
    employeeId: number,
    sequence: number,
  ): Promise<void> {
    const addresses = await employeeAddressRepo.find({
      where: { employee_id: employeeId, address_type: AddressTypeEnum.HOME },
      order: { id: 'ASC' },
    });

    await employeeAddressRepo.update(
      { employee_id: employeeId, address_type: AddressTypeEnum.HOME },
      { is_primary: false },
    );

    const address = addresses[0] ?? employeeAddressRepo.create();
    address.employee_id = employeeId;
    address.address_type = AddressTypeEnum.HOME;
    address.address_line_1 = `House ${100 + sequence}, Mikocheni`;
    address.address_line_2 = 'Kinondoni District';
    address.city = 'Dar es Salaam';
    address.state = 'Dar es Salaam';
    address.country = 'Tanzania';
    address.postal_code = `11${String(sequence).padStart(3, '0')}`;
    address.is_primary = true;

    await employeeAddressRepo.save(address);
  }

  private async ensurePrimaryRelative(
    employeeRelativeRepo: Repository<EmployeeRelative>,
    employeeId: number,
    seed: CompanyEmployeeSeed,
    sequence: number,
  ): Promise<void> {
    const relatives = await employeeRelativeRepo.find({
      where: { employee_id: employeeId },
      order: { id: 'ASC' },
    });

    await employeeRelativeRepo.update({ employee_id: employeeId }, { is_primary: false });

    const relative = relatives[0] ?? employeeRelativeRepo.create();
    relative.employee_id = employeeId;
    relative.full_name = `Asha ${seed.lastName}`;
    relative.relationship = 'Sibling';
    relative.phone = `+255756${String(sequence).padStart(6, '0')}`;
    relative.email = `relative.${this.slugify(seed.firstName)}.${this.slugify(seed.lastName)}@mail.com`;
    relative.address = 'Dar es Salaam, Tanzania';
    relative.occupation = 'Business Owner';
    relative.is_emergency_contact = true;
    relative.is_primary = true;

    await employeeRelativeRepo.save(relative);
  }

  private async ensurePrimaryIdentification(
    employeeIdentificationRepo: Repository<EmployeeIdentification>,
    employeeId: number,
    seed: CompanyEmployeeSeed,
    sequence: number,
  ): Promise<void> {
    const identifications = await employeeIdentificationRepo.find({
      where: { employee_id: employeeId, identification_type: IdentificationTypeEnum.NATIONAL_ID },
      order: { id: 'ASC' },
    });

    await employeeIdentificationRepo.update(
      { employee_id: employeeId, identification_type: IdentificationTypeEnum.NATIONAL_ID },
      { is_primary: false },
    );

    const identification = identifications[0] ?? employeeIdentificationRepo.create();
    identification.employee_id = employeeId;
    identification.identification_type = IdentificationTypeEnum.NATIONAL_ID;
    identification.identification_number = `NIDA${String(sequence).padStart(8, '0')}`;
    identification.issued_country = 'Tanzania';
    identification.expiry_date = null;
    identification.is_primary = true;

    await employeeIdentificationRepo.save(identification);

    const taxIdentifications = await employeeIdentificationRepo.find({
      where: { employee_id: employeeId, identification_type: IdentificationTypeEnum.TAX_ID },
      order: { id: 'ASC' },
    });

    const taxIdentification = taxIdentifications[0] ?? employeeIdentificationRepo.create();
    taxIdentification.employee_id = employeeId;
    taxIdentification.identification_type = IdentificationTypeEnum.TAX_ID;
    taxIdentification.identification_number = `TIN${String(20000000 + sequence)}`;
    taxIdentification.issued_country = 'Tanzania';
    taxIdentification.expiry_date = null;
    taxIdentification.is_primary = false;

    await employeeIdentificationRepo.save(taxIdentification);
  }

  private async ensurePrimaryBankAccount(
    employeeBankAccountRepo: Repository<EmployeeBankAccount>,
    employeeId: number,
    seed: CompanyEmployeeSeed,
    sequence: number,
  ): Promise<void> {
    const bankAccounts = await employeeBankAccountRepo.find({
      where: { employee_id: employeeId },
      order: { id: 'ASC' },
    });

    await employeeBankAccountRepo.update({ employee_id: employeeId }, { is_primary: false });

    const account = bankAccounts[0] ?? employeeBankAccountRepo.create();
    account.employee_id = employeeId;
    account.bank_name = 'NMB Bank';
    account.account_name = `${seed.firstName} ${seed.lastName}`;
    account.account_number = `010${String(sequence).padStart(9, '0')}`;
    account.branch_name = 'Samora Branch';
    account.swift_code = 'NMIBTZTZ';
    account.mobile_money_provider = 'M-Pesa';
    account.is_primary = true;

    await employeeBankAccountRepo.save(account);
  }

  private async ensureAcademicQualification(
    employeeAcademicQualificationRepo: Repository<EmployeeAcademicQualification>,
    employeeId: number,
    uploadedByCompanyUserId: number,
    sequence: number,
  ): Promise<void> {
    const records = await employeeAcademicQualificationRepo.find({
      where: { employee_id: employeeId },
      order: { id: 'ASC' },
    });

    const record = records[0] ?? employeeAcademicQualificationRepo.create();
    const startYear = 2006 + (sequence % 6);
    const endYear = startYear + 3;

    record.employee_id = employeeId;
    record.country_of_residence = 'Tanzania';
    record.education_level = 'Bachelor';
    record.institution_name = 'University of Dar es Salaam';
    record.degree_or_certificate = 'Bachelor Degree';
    record.field_of_study = 'Business Administration';
    record.start_date = `${startYear}-10-01`;
    record.end_date = `${endYear}-07-15`;
    record.academic_certificate_document_url = `https://seed-docs.alliance.co.tz/academic/${employeeId}.pdf`;
    record.uploaded_by_company_user_id = uploadedByCompanyUserId;

    await employeeAcademicQualificationRepo.save(record);
  }

  private async ensureProfessionalQualification(
    employeeProfessionalQualificationRepo: Repository<EmployeeProfessionalQualification>,
    employeeId: number,
    uploadedByCompanyUserId: number,
    sequence: number,
  ): Promise<void> {
    const records = await employeeProfessionalQualificationRepo.find({
      where: { employee_id: employeeId },
      order: { id: 'ASC' },
    });

    const record = records[0] ?? employeeProfessionalQualificationRepo.create();
    const issueYear = 2018 + (sequence % 6);

    record.employee_id = employeeId;
    record.country_of_residence = 'Tanzania';
    record.institution_name = 'College of Insurance and Actuarial Studies';
    record.programme_name = 'Insurance Operations';
    record.issuing_organization = 'Tanzania Insurance Institute';
    record.issue_date = `${issueYear}-09-01`;
    record.expiry_date = null;
    record.professional_certificate_document_url = `https://seed-docs.alliance.co.tz/professional/${employeeId}.pdf`;
    record.uploaded_by_company_user_id = uploadedByCompanyUserId;

    await employeeProfessionalQualificationRepo.save(record);
  }

  private async ensureExperienceDetail(
    employeeExperienceRepo: Repository<EmployeeExperience>,
    employeeId: number,
    sequence: number,
  ): Promise<void> {
    const experiences = await employeeExperienceRepo.find({
      where: { employee_id: employeeId },
      order: { id: 'ASC' },
    });

    const experience = experiences[0] ?? employeeExperienceRepo.create();
    const startYear = 2012 + (sequence % 8);

    experience.employee_id = employeeId;
    experience.company_name = 'Tanzania Assurance Group';
    experience.job_title = 'Associate Officer';
    experience.responsibilities_description =
      'Handled daily policy servicing, customer support, and internal reporting tasks.';
    experience.start_date = `${startYear}-01-15`;
    experience.end_date = `${startYear + 2}-12-20`;
    experience.currently_working = false;

    await employeeExperienceRepo.save(experience);
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

  private async ensureHikvisionIdentity(
    employeeDeviceIdentityRepo: Repository<EmployeeDeviceIdentity>,
    companyId: number,
    employeeId: number,
    hikvisionEmployeeNo: string,
    deviceId: number | null,
  ): Promise<void> {
    const normalizedEmployeeNo = hikvisionEmployeeNo.trim();
    if (!normalizedEmployeeNo) {
      return;
    }

    let identity = await employeeDeviceIdentityRepo.findOne({
      where: { companyId, employeeId, deviceId: deviceId ?? IsNull() },
    });

    if (!identity) {
      identity = await employeeDeviceIdentityRepo.findOne({
        where: {
          companyId,
          employeeNo: normalizedEmployeeNo,
          deviceId: deviceId ?? IsNull(),
        },
      });
    }

    if (!identity) {
      identity = employeeDeviceIdentityRepo.create({
        companyId,
        employeeId,
        employeeNo: normalizedEmployeeNo,
        deviceId,
        isActive: true,
      });
    } else {
      identity.companyId = companyId;
      identity.employeeId = employeeId;
      identity.employeeNo = normalizedEmployeeNo;
      identity.deviceId = deviceId;
      identity.isActive = true;
    }

    identity.metadata = {
      ...(identity.metadata ?? {}),
      seeded: true,
      source: 'alliance-company-structure-seed',
    };

    await employeeDeviceIdentityRepo.save(identity);
  }

  private async ensureDefaultAttendanceDevice(
    attendanceDeviceRepo: Repository<AttendanceDevice>,
    companyId: number,
    branchMap: EntityMap<Branch>,
  ): Promise<AttendanceDevice> {
    const hqBranch = this.getRequiredBranch(branchMap, 'HQ', 'default Hikvision device');
    const existing = await attendanceDeviceRepo.findOne({
      where: {
        companyId,
        ipAddress: DEFAULT_HIKVISION_DEVICE_IP_ADDRESS,
        port: DEFAULT_HIKVISION_DEVICE_PORT,
      },
    });

    const device = existing ?? attendanceDeviceRepo.create({ companyId });
    device.companyId = companyId;
    device.branchId = hqBranch.id;
    device.deviceName = 'Main Hikvision Device';
    device.deviceCode =
      device.deviceCode || `HIK-${companyId}-${DEFAULT_HIKVISION_DEVICE_CODE_SUFFIX}`;
    device.deviceSerialNumber = device.deviceSerialNumber || DEFAULT_HIKVISION_DEVICE_SERIAL;
    device.deviceModel = 'DS-K1T201AMF';
    device.ipAddress = DEFAULT_HIKVISION_DEVICE_IP_ADDRESS;
    device.port = DEFAULT_HIKVISION_DEVICE_PORT;
    device.apiUsername = 'admin';
    device.apiPassword = 'Hikvision12';
    device.protocol = 'ISAPI';
    device.vendorName = 'Hikvision';
    device.integrationType = 'hikvision';
    device.authType = 'digest';
    device.syncMode = AttendanceDeviceSyncModeEnum.PULL;
    device.status = AttendanceDeviceStatusEnum.ACTIVE;
    device.timezone = device.timezone || DEFAULT_HIKVISION_DEVICE_TIMEZONE;
    device.firmwareVersion = 'V1.3.41';
    device.macAddress = 'BC:5E:33:54:C0:A2';
    device.deviceType = 'ACS';

    return attendanceDeviceRepo.save(device);
  }

  private async ensureDefaultAccessOrganization(
    accessOrganizationRepo: Repository<AccessOrganization>,
    companyId: number,
  ): Promise<AccessOrganization> {
    const existing = await accessOrganizationRepo.findOne({
      where: { companyId, orgName: DEFAULT_ACCESS_ORGANIZATION_NAME },
    });

    if (existing) {
      return existing;
    }

    return accessOrganizationRepo.save(
      accessOrganizationRepo.create({
        companyId,
        branchId: null,
        departmentId: null,
        deviceId: null,
        parentId: null,
        hikvisionOrgIndex: null,
        hikvisionGroupNo: null,
        name: DEFAULT_ACCESS_ORGANIZATION_NAME,
        orgName: DEFAULT_ACCESS_ORGANIZATION_NAME,
        orgCode: null,
        description: null,
        source: AccessOrganizationSourceEnum.MANUAL,
        syncStatus: AccessOrganizationSyncStatusEnum.PENDING,
        isActive: true,
        lastSyncedAt: null,
        metadata: null,
      }),
    );
  }

  private async ensureEmployeeDeviceAssignment(
    employeeDeviceAssignmentRepo: Repository<EmployeeDeviceAssignment>,
    companyId: number,
    employee: Employee,
    device: AttendanceDevice,
    organization: AccessOrganization,
    hikvisionEmployeeNo: string,
  ): Promise<void> {
    const normalizedEmployeeNo = hikvisionEmployeeNo.trim();
    if (!normalizedEmployeeNo) {
      return;
    }

    let assignment = await employeeDeviceAssignmentRepo.findOne({
      where: { companyId, employeeId: employee.id, deviceId: device.id },
    });

    if (!assignment) {
      assignment = await employeeDeviceAssignmentRepo.findOne({
        where: { companyId, deviceId: device.id, employeeNo: normalizedEmployeeNo },
      });
    }

    if (!assignment) {
      assignment = employeeDeviceAssignmentRepo.create({
        companyId,
        employeeId: employee.id,
        employeeNo: normalizedEmployeeNo,
        deviceId: device.id,
        syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.PENDING,
      });
    }

    assignment.companyId = companyId;
    assignment.employeeId = employee.id;
    assignment.employeeNo = normalizedEmployeeNo;
    assignment.employeeName = this.buildEmployeeDisplayName(employee);
    assignment.deviceId = device.id;
    assignment.organizationId = organization.id;
    assignment.metadata = {
      ...(assignment.metadata ?? {}),
      seeded: true,
      source: 'alliance-company-structure-seed',
      backend_employee_no: employee.employee_no,
      hikvision_employee_no: normalizedEmployeeNo,
    };

    await employeeDeviceAssignmentRepo.save(assignment);
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

  private getEmployeeSequence(employeeNo: string): number {
    const numericPart = employeeNo.replace(/\D/g, '');
    const parsed = Number(numericPart);
    return Number.isNaN(parsed) ? 1 : parsed;
  }

  private resolveEmployeeNumberPrefix(company: Company): string {
    const metadataPrefix =
      typeof company.metadata?.employee_no_prefix === 'string'
        ? company.metadata.employee_no_prefix
        : null;
    const normalizedMetadataPrefix = metadataPrefix?.trim().toUpperCase() ?? '';
    if (normalizedMetadataPrefix) {
      return normalizedMetadataPrefix;
    }

    const initials = company.name
      .trim()
      .split(/\s+/)
      .map((segment) => segment.replace(/[^A-Za-z0-9]/g, ''))
      .filter(Boolean)
      .map((segment) => segment[0]?.toUpperCase() ?? '')
      .join('');

    return initials || 'EMP';
  }

  private resolveNextEmployeeSequence(
    employees: Employee[],
    prefix: string,
  ): number {
    let maxSequence = 0;

    for (const employee of employees) {
      const sequence = this.parseGeneratedEmployeeNumberSequence(
        employee.employee_no,
        prefix,
      );
      if (sequence !== null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    return maxSequence + 1;
  }

  private resolveEmployeeNumberForSeededEmployee(
    employee: Employee,
    prefix: string,
    sequence: number,
  ): string {
    if (this.isGeneratedEmployeeNumber(employee.employee_no, prefix)) {
      return employee.employee_no;
    }

    return this.formatGeneratedEmployeeNumber(prefix, sequence);
  }

  private isGeneratedEmployeeNumber(
    employeeNo: string | null | undefined,
    prefix: string,
  ): boolean {
    return this.parseGeneratedEmployeeNumberSequence(employeeNo, prefix) !== null;
  }

  private parseGeneratedEmployeeNumberSequence(
    employeeNo: string | null | undefined,
    prefix: string,
  ): number | null {
    const normalizedEmployeeNo = employeeNo?.trim() ?? '';
    const pattern = new RegExp(`^${this.escapeRegExp(prefix)}-(\\d{4,})$`);
    const match = normalizedEmployeeNo.match(pattern);
    if (!match) {
      return null;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private formatGeneratedEmployeeNumber(prefix: string, sequence: number): string {
    return `${prefix}-${String(sequence).padStart(4, '0')}`;
  }

  private extractSeededHikvisionEmployeeNo(employee: Employee): string | null {
    const metadata = employee.metadata ?? {};
    const hikvision = typeof metadata.hikvision === 'object' && metadata.hikvision !== null
      ? (metadata.hikvision as Record<string, unknown>)
      : null;
    const value =
      typeof hikvision?.employee_no === 'string'
        ? hikvision.employee_no
        : /^\d{8}$/.test(employee.employee_no)
          ? employee.employee_no
          : null;

    return value?.trim() || null;
  }

  private buildEmployeeDisplayName(employee: Employee): string {
    const displayName = [employee.first_name, employee.middle_name, employee.last_name]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();

    return displayName || employee.employee_no;
  }

  private generateMiddleName(firstName: string): string {
    return `${firstName.charAt(0).toUpperCase()}.`;
  }

  private buildDate(year: number, monthSeed: number, daySeed: number): string {
    const month = String(((monthSeed - 1) % 12) + 1).padStart(2, '0');
    const day = String(((daySeed - 1) % 28) + 1).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private slugify(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private buildPersonalEmail(seed: CompanyEmployeeSeed): string {
    return `${this.slugify(seed.firstName)}.${this.slugify(seed.lastName)}.personal@alliance.co.tz`;
  }

  private normalizeKey(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
