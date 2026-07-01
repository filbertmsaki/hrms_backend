import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hashPassword } from '../../common/utils/hash.util';
import { Role } from '../roles/entities/role.entity';
import { PaginationDto, SortDirection } from '../../common/dto/pagination.dto';
import { User } from '../users/entities/user.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { Repository } from 'typeorm';
import { EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendancePolicy } from '../hr/attendance/policies/entities/attendance-policy.entity';
import { Timetable } from '../hr/attendance/timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../hr/attendance/timetable/timetables/enums/timetable-status.enum';
import { Branch } from '../hr/branches/entities/branch.entity';
import { Department } from '../hr/departments/entities/department.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { Company } from './entities/company.entity';
import { CompanyUser } from './entities/company-user.entity';
import { CompanyUserRole } from './entities/company-user-role.entity';
import { CompanyUserPermission } from './entities/company-user-permission.entity';
import { AddCompanyUserDto } from './dtos/add-company-user.dto';
import { UpdateCompanyDto } from './dtos/update-company.dto';
import { CreateCompanyDto } from './dtos/create-company.dto';
import {
  CompanyMembershipContext,
  CompanySummary,
} from './interfaces/company-membership-context.interface';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,

    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,

    @InjectRepository(CompanyUserPermission)
    private readonly companyUserPermissionRepository: Repository<CompanyUserPermission>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,

    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,

    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,

    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,

    @InjectRepository(Timetable)
    private readonly timetableRepository: Repository<Timetable>,

    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
  ) {}

  private getCompanyRepository(manager?: EntityManager): Repository<Company> {
    return manager?.getRepository(Company) ?? this.companyRepository;
  }

  private getCompanyUserRepository(
    manager?: EntityManager,
  ): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getCompanyUserRoleRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserRole> {
    return (
      manager?.getRepository(CompanyUserRole) ?? this.companyUserRoleRepository
    );
  }

  private getRoleRepository(manager?: EntityManager): Repository<Role> {
    return manager?.getRepository(Role) ?? this.roleRepository;
  }

  private async findRoleByNameForCompany(
    name: string,
    companyId: number,
    manager?: EntityManager,
  ): Promise<Role | null> {
    const roleRepository = this.getRoleRepository(manager);

    return roleRepository
      .createQueryBuilder('role')
      .where('role.name = :name', { name })
      .andWhere('(role.company_id = :companyId OR role.company_id IS NULL)', {
        companyId,
      })
      .orderBy(
        'CASE WHEN role.company_id = :companyId THEN 0 ELSE 1 END',
        'ASC',
      )
      .addOrderBy('role.id', 'ASC')
      .setParameter('companyId', companyId)
      .getOne();
  }

  private async resolveRolesByIdsForCompany(
    roleIds: number[],
    companyId: number,
    manager?: EntityManager,
  ): Promise<Role[]> {
    const uniqueRoleIds = Array.from(new Set(roleIds));

    if (!uniqueRoleIds.length) {
      return [];
    }

    const roleRepository = this.getRoleRepository(manager);
    const roles = await roleRepository.find({
      where: uniqueRoleIds.map((id) => ({ id })),
    });

    if (
      roles.length !== uniqueRoleIds.length ||
      roles.some(
        (role) => role.company_id !== null && role.company_id !== companyId,
      )
    ) {
      throw new NotFoundException('One or more requested roles were not found');
    }

    const byId = new Map(roles.map((role) => [role.id, role]));
    return uniqueRoleIds.map((roleId) => byId.get(roleId)!);
  }

  private async resolveRolesByNamesForCompany(
    roleNames: string[],
    companyId: number,
    manager?: EntityManager,
  ): Promise<Role[]> {
    const uniqueRoleNames = Array.from(new Set(roleNames));
    const roles: Role[] = [];

    for (const roleName of uniqueRoleNames) {
      const role = await this.findRoleByNameForCompany(
        roleName,
        companyId,
        manager,
      );

      if (!role) {
        throw new NotFoundException(
          `Role "${roleName}" was not found for this company`,
        );
      }

      roles.push(role);
    }

    return roles;
  }

  private getUserRepository(manager?: EntityManager): Repository<User> {
    return manager?.getRepository(User) ?? this.userRepository;
  }

  private slugify(value: string): string {
    return value
      .trim()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private buildSlugCandidate(baseSlug: string, suffix: number): string {
    if (suffix === 0) {
      return baseSlug;
    }

    const suffixText = `-${suffix}`;
    const maxBaseLength = Math.max(1, 120 - suffixText.length);
    const trimmedBase = baseSlug.slice(0, maxBaseLength).replace(/-+$/g, '');
    const safeBase = trimmedBase || 'company';

    return `${safeBase}${suffixText}`;
  }

  private async generateUniqueCompanySlug(
    name: string,
    manager?: EntityManager,
  ): Promise<string> {
    const companyRepository = this.getCompanyRepository(manager);
    const baseSlug = this.slugify(name);

    if (!baseSlug) {
      throw new BadRequestException('Company slug could not be generated');
    }

    let suffix = 0;
    while (true) {
      const candidateSlug = this.buildSlugCandidate(baseSlug, suffix);
      const existing = await companyRepository.findOne({
        where: { slug: candidateSlug },
        select: ['id'],
      });

      if (!existing) {
        return candidateSlug;
      }

      suffix += 1;
    }
  }

  private isDuplicateEntryError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (
      error as QueryFailedError & {
        driverError?: { code?: string | number };
      }
    ).driverError;

    return (
      driverError?.code === 'ER_DUP_ENTRY' ||
      String(driverError?.code ?? '') === '1062'
    );
  }

  private getMembershipPermissions(membership: CompanyUser): string[] {
    const permissions = new Set<string>();

    membership.permission_assignments?.forEach((assignment) => {
      if (assignment.permission?.name) {
        permissions.add(assignment.permission.name);
      }
    });

    membership.role_assignments?.forEach((assignment) => {
      assignment.role?.permissions?.forEach((permission) => {
        if (permission?.name) {
          permissions.add(permission.name);
        }
      });
    });

    return Array.from(permissions);
  }

  private mapMembershipSummary(membership: CompanyUser): CompanySummary {
    return {
      companyId: membership.company_id,
      companyName: membership.company.name,
      companySlug: membership.company.slug,
      membershipId: membership.id,
      employeeId: membership.employee?.id ?? null,
      employeeNo: membership.employee?.employee_no ?? null,
      isDefault: membership.is_default,
      roles:
        membership.role_assignments?.map(
          (assignment) => assignment.role.name,
        ) ?? [],
      permissions: this.getMembershipPermissions(membership),
    };
  }

  private async generateUserNo(manager?: EntityManager): Promise<string> {
    const repository = this.getUserRepository(manager);
    const year = new Date().getFullYear();
    const prefix = `USER-${year}-`;

    const lastUser = await repository
      .createQueryBuilder('user')
      .where('user.user_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('user.user_no', 'DESC')
      .limit(1)
      .getOne();

    const nextNumber = lastUser?.user_no
      ? Number(lastUser.user_no.substring(prefix.length)) + 1
      : 1;

    return `${prefix}${String(nextNumber || 1).padStart(5, '0')}`;
  }

  async createCompany(name: string, manager?: EntityManager): Promise<Company> {
    const companyRepository = this.getCompanyRepository(manager);
    const normalizedName = name.trim();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const uniqueSlug = await this.generateUniqueCompanySlug(
        normalizedName,
        manager,
      );
      const company = companyRepository.create({
        name: normalizedName,
        slug: uniqueSlug,
        status: 'active',
      });

      try {
        return await companyRepository.save(company);
      } catch (error) {
        if (this.isDuplicateEntryError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('Unable to generate a unique company slug');
  }

  async createCompanyWithAdministrator(createCompanyDto: CreateCompanyDto) {
    const {
      company_name,
      admin_first_name,
      admin_last_name,
      admin_email,
      admin_phone,
      admin_password,
    } = createCompanyDto;

    return this.companyRepository.manager.transaction(async (manager) => {
      const userRepository = this.getUserRepository(manager);

      const existingUser = await userRepository.findOne({
        where: [{ email: admin_email }, { phone: admin_phone }],
      });

      if (existingUser) {
        throw new ConflictException(
          existingUser.email === admin_email
            ? 'Administrator email already exists'
            : 'Administrator phone number already exists',
        );
      }

      const company = await this.createCompany(company_name, manager);
      const hashedPassword = await hashPassword(admin_password);
      const userNo = await this.generateUserNo(manager);

      const administrator = await userRepository.save(
        userRepository.create({
          user_no: userNo,
          first_name: admin_first_name,
          last_name: admin_last_name,
          phone: admin_phone,
          email: admin_email,
          password: hashedPassword,
          status: 'active',
          user_type: 'COMPANY_USER',
          is_email_verified: true,
        }),
      );

      const companyContext = await this.addUserToCompany(
        administrator.id,
        company.id,
        {
          isDefault: true,
          roleNames: ['COMPANY_ADMIN'],
        },
        manager,
      );

      return {
        message: 'Company and first administrator created successfully',
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          status: company.status,
          created_at: company.created_at,
        },
        administrator: {
          id: administrator.id,
          user_no: administrator.user_no,
          first_name: administrator.first_name,
          last_name: administrator.last_name,
          phone: administrator.phone,
          email: administrator.email,
          status: administrator.status,
          user_type: administrator.user_type,
          roles: companyContext.roles,
          permissions: companyContext.permissions,
        },
      };
    });
  }

  async findActiveCompanyBySlug(
    slug: string,
    manager?: EntityManager,
  ): Promise<Company | null> {
    const companyRepository = this.getCompanyRepository(manager);

    return companyRepository.findOne({
      where: {
        slug: slug.trim().toLowerCase(),
        status: 'active',
      },
    });
  }

  async findAllCompanies() {
    const companies = await this.companyRepository
      .createQueryBuilder('company')
      .leftJoin(
        'company.memberships',
        'membership',
        "membership.status = 'active'",
      )
      .select([
        'company.id AS id',
        'company.name AS name',
        'company.slug AS slug',
        'company.status AS status',
        'company.created_at AS created_at',
        'COUNT(membership.id) AS active_users_count',
      ])
      .groupBy('company.id')
      .addGroupBy('company.name')
      .addGroupBy('company.slug')
      .addGroupBy('company.status')
      .addGroupBy('company.created_at')
      .orderBy('company.name', 'ASC')
      .getRawMany<{
        id: number;
        name: string;
        slug: string;
        status: string;
        created_at: Date;
        active_users_count: string;
      }>();

    return companies.map((company) => ({
      id: Number(company.id),
      name: company.name,
      slug: company.slug,
      status: company.status,
      created_at: company.created_at,
      active_users_count: Number(company.active_users_count ?? 0),
    }));
  }

  async listUserCompanies(
    userId: number,
    manager?: EntityManager,
  ): Promise<CompanySummary[]> {
    const companyUserRepository = this.getCompanyUserRepository(manager);

    const memberships = await companyUserRepository.find({
      where: {
        user_id: userId,
        status: 'active',
      },
      relations: {
        company: true,
        employee: true,
        role_assignments: {
          role: {
            permissions: true,
          },
        },
        permission_assignments: {
          permission: true,
        },
      },
      order: {
        is_default: 'DESC',
        last_accessed_at: 'DESC',
        company: {
          name: 'ASC',
        },
      },
    });

    return memberships
      .filter((membership) => membership.company?.status === 'active')
      .map((membership) => this.mapMembershipSummary(membership));
  }

  async getMembershipContext(
    userId: number,
    companyId: number,
    manager?: EntityManager,
  ): Promise<CompanyMembershipContext> {
    const companyUserRepository = this.getCompanyUserRepository(manager);

    const membership = await companyUserRepository.findOne({
      where: {
        user_id: userId,
        company_id: companyId,
        status: 'active',
      },
      relations: {
        company: true,
        employee: true,
        role_assignments: {
          role: {
            permissions: true,
          },
        },
        permission_assignments: {
          permission: true,
        },
      },
    });

    if (!membership || membership.company.status !== 'active') {
      throw new NotFoundException('Active company membership not found');
    }

    return {
      ...this.mapMembershipSummary(membership),
      status: membership.status,
    };
  }

  async setActiveMembership(
    userId: number,
    companyId: number,
    manager?: EntityManager,
  ): Promise<CompanyMembershipContext> {
    const companyUserRepository = this.getCompanyUserRepository(manager);
    const membership = await this.getMembershipContext(
      userId,
      companyId,
      manager,
    );

    await companyUserRepository.update(
      { user_id: userId, status: 'active' },
      { is_default: false },
    );
    await companyUserRepository.update(membership.membershipId, {
      is_default: true,
      last_accessed_at: new Date(),
    });

    return this.getMembershipContext(userId, companyId, manager);
  }

  async addUserToCompany(
    userId: number,
    companyId: number,
    options?: {
      isDefault?: boolean;
      roleIds?: number[];
      roleNames?: string[];
    },
    manager?: EntityManager,
  ): Promise<CompanyMembershipContext> {
    const companyRepository = this.getCompanyRepository(manager);
    const companyUserRepository = this.getCompanyUserRepository(manager);
    const companyUserRoleRepository =
      this.getCompanyUserRoleRepository(manager);
    const userRepository = this.getUserRepository(manager);
    const roleRepository = this.getRoleRepository(manager);

    const company = await companyRepository.findOne({
      where: { id: companyId, status: 'active' },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const user = await userRepository.findOne({
      where: { id: userId },
      select: ['id', 'user_type'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.user_type === 'OWNER') {
      throw new BadRequestException(
        'OWNER users cannot be assigned to any company',
      );
    }

    const existingMembership = await companyUserRepository.findOne({
      where: { company_id: companyId, user_id: userId },
    });

    let membership = existingMembership;
    if (!membership) {
      const hasOtherMemberships =
        (await companyUserRepository.count({
          where: { user_id: userId, status: 'active' },
        })) > 0;

      membership = companyUserRepository.create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: options?.isDefault ?? !hasOtherMemberships,
      });
      membership = await companyUserRepository.save(membership);
    } else if (membership.status !== 'active') {
      membership.status = 'active';
      membership.is_default = options?.isDefault ?? membership.is_default;
      membership = await companyUserRepository.save(membership);
    }

    if (membership.is_default) {
      await companyUserRepository.update(
        { user_id: userId },
        { is_default: false },
      );
      membership.is_default = true;
      membership = await companyUserRepository.save(membership);
    }

    const roleIds = new Set<number>();

    options?.roleIds?.forEach((roleId) => {
      if (roleId) {
        roleIds.add(roleId);
      }
    });

    if (options?.roleNames?.length) {
      const namedRoles = await this.resolveRolesByNamesForCompany(
        options.roleNames,
        companyId,
        manager,
      );
      namedRoles.forEach((role) => roleIds.add(role.id));
    }

    if (!roleIds.size) {
      const viewerRole = await this.findRoleByNameForCompany(
        'EMPLOYEE',
        companyId,
        manager,
      );

      if (!viewerRole) {
        throw new NotFoundException('Default employee role not found');
      }

      roleIds.add(viewerRole.id);
    }

    const resolvedRoles = await this.resolveRolesByIdsForCompany(
      Array.from(roleIds),
      companyId,
      manager,
    );

    for (const roleId of roleIds) {
      const existingAssignment = await companyUserRoleRepository.findOne({
        where: {
          company_user_id: membership.id,
          role_id: roleId,
        },
      });

      if (!existingAssignment) {
        await companyUserRoleRepository.save(
          companyUserRoleRepository.create({
            company_user_id: membership.id,
            role_id: roleId,
          }),
        );
      }
    }

    return this.getMembershipContext(userId, companyId, manager);
  }

  async assignRole(
    companyId: number,
    userId: number,
    roleId: number,
  ): Promise<CompanyMembershipContext> {
    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this company');
    }

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role || (role.company_id !== null && role.company_id !== companyId)) {
      throw new NotFoundException('Role not found');
    }

    const existingAssignment = await this.companyUserRoleRepository.findOne({
      where: {
        company_user_id: membership.id,
        role_id: roleId,
      },
    });

    if (!existingAssignment) {
      await this.companyUserRoleRepository.save(
        this.companyUserRoleRepository.create({
          company_user_id: membership.id,
          role_id: roleId,
        }),
      );
    }

    return this.getMembershipContext(userId, companyId);
  }

  async revokeRole(
    companyId: number,
    userId: number,
    roleId: number,
  ): Promise<CompanyMembershipContext> {
    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this company');
    }

    await this.companyUserRoleRepository.delete({
      company_user_id: membership.id,
      role_id: roleId,
    });

    return this.getMembershipContext(userId, companyId);
  }

  async touchMembership(membershipId: number): Promise<void> {
    await this.companyUserRepository.update(membershipId, {
      last_accessed_at: new Date(),
    });
  }

  async removeUserFromCompany(
    companyId: number,
    userId: number,
  ): Promise<{ message: string }> {
    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this company');
    }

    const activeMembershipCount = await this.companyUserRepository.count({
      where: { company_id: companyId, status: 'active' },
    });

    if (activeMembershipCount <= 1) {
      throw new BadRequestException(
        'Cannot remove the last active user from the company',
      );
    }

    membership.status = 'inactive';
    membership.is_default = false;
    await this.companyUserRepository.save(membership);

    return { message: 'User removed from company successfully' };
  }

  async findCompanyUserContext(
    companyId: number,
    userId: number,
  ): Promise<CompanyMembershipContext> {
    return this.getMembershipContext(userId, companyId);
  }

  async findOneCompany(companyId: number) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const activeUsersCount = await this.companyUserRepository.count({
      where: { company_id: company.id, status: 'active' },
    });

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
      metadata: company.metadata ?? null,
      active_users_count: activeUsersCount,
      created_at: company.created_at,
      updated_at: company.updated_at,
    };
  }

  async updateCompany(companyId: number, dto: UpdateCompanyDto) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (!name) {
        throw new BadRequestException('Company name cannot be empty');
      }

      company.name = name;
    }

    if (dto.metadata !== undefined) {
      company.metadata = dto.metadata;
    }

    const saved = await this.companyRepository.save(company);

    return {
      message: 'Company updated successfully',
      data: {
        id: saved.id,
        name: saved.name,
        slug: saved.slug,
        status: saved.status,
        metadata: saved.metadata ?? null,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
      },
    };
  }

  async activateCompany(companyId: number) {
    return this.changeCompanyStatus(companyId, 'active');
  }

  async suspendCompany(companyId: number) {
    return this.changeCompanyStatus(companyId, 'suspended');
  }

  async addExistingUserToCurrentCompany(
    companyId: number,
    dto: AddCompanyUserDto,
  ) {
    const existingMembership = await this.companyUserRepository.findOne({
      where: { company_id: companyId, user_id: dto.user_id, status: 'active' },
    });

    if (existingMembership) {
      throw new ConflictException('User is already active in this company');
    }

    return this.addUserToCompany(dto.user_id, companyId, {
      isDefault: dto.is_default,
      roleIds: dto.role_ids,
      roleNames: dto.role_names,
    });
  }

  async assignPermission(
    companyId: number,
    userId: number,
    permissionId: number,
  ) {
    const membership = await this.companyUserRepository.findOne({
      where: { company_id: companyId, user_id: userId, status: 'active' },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this company');
    }

    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const existing = await this.companyUserPermissionRepository.findOne({
      where: { company_user_id: membership.id, permission_id: permissionId },
    });

    if (!existing) {
      await this.companyUserPermissionRepository.save(
        this.companyUserPermissionRepository.create({
          company_user_id: membership.id,
          permission_id: permissionId,
        }),
      );
    }

    return this.getMembershipContext(userId, companyId);
  }

  async revokePermission(
    companyId: number,
    userId: number,
    permissionId: number,
  ) {
    const membership = await this.companyUserRepository.findOne({
      where: { company_id: companyId, user_id: userId, status: 'active' },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this company');
    }

    await this.companyUserPermissionRepository.delete({
      company_user_id: membership.id,
      permission_id: permissionId,
    });

    return this.getMembershipContext(userId, companyId);
  }

  async getCurrentCompanyOnboardingStatus(companyId: number) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const [
      activeUsersCount,
      branchesCount,
      departmentsCount,
      employeesCount,
      activeAttendancePolicyCount,
      defaultTimetableCount,
      attendanceDevicesCount,
    ] = await Promise.all([
      this.companyUserRepository.count({
        where: { company_id: companyId, status: 'active' },
      }),
      this.branchRepository.count({
        where: { company_id: companyId, status: 'active' },
      }),
      this.departmentRepository.count({
        where: { company_id: companyId, status: 'active' },
      }),
      this.employeeRepository
        .createQueryBuilder('employee')
        .innerJoin('employee.company_user', 'companyUser')
        .where('companyUser.company_id = :companyId', { companyId })
        .getCount(),
      this.attendancePolicyRepository.count({
        where: { company_id: companyId, is_active: true },
      }),
      this.timetableRepository.count({
        where: {
          companyId,
          isDefault: true,
          status: TimetableStatusEnum.ACTIVE,
        },
      }),
      this.attendanceDeviceRepository.count({
        where: { companyId, status: AttendanceDeviceStatusEnum.ACTIVE },
      }),
    ]);

    const checks = [
      {
        code: 'COMPANY_CREATED',
        label: 'Company profile created',
        complete: true,
        count: 1,
        required: true,
      },
      {
        code: 'ADMIN_USER_CONFIGURED',
        label: 'At least one active company user exists',
        complete: activeUsersCount > 0,
        count: activeUsersCount,
        required: true,
      },
      {
        code: 'BRANCH_CONFIGURED',
        label: 'At least one active branch exists',
        complete: branchesCount > 0,
        count: branchesCount,
        required: true,
      },
      {
        code: 'DEPARTMENT_CONFIGURED',
        label: 'At least one active department exists',
        complete: departmentsCount > 0,
        count: departmentsCount,
        required: true,
      },
      {
        code: 'EMPLOYEE_CONFIGURED',
        label: 'At least one employee exists',
        complete: employeesCount > 0,
        count: employeesCount,
        required: true,
      },
      {
        code: 'ACTIVE_ATTENDANCE_POLICY_CONFIGURED',
        label: 'Active attendance policy configured',
        complete: activeAttendancePolicyCount > 0,
        count: activeAttendancePolicyCount,
        required: true,
      },
      {
        code: 'DEFAULT_TIMETABLE_CONFIGURED',
        label: 'Default active timetable configured',
        complete: defaultTimetableCount > 0,
        count: defaultTimetableCount,
        required: true,
      },
      {
        code: 'ATTENDANCE_DEVICE_CONFIGURED',
        label: 'At least one active attendance device configured',
        complete: attendanceDevicesCount > 0,
        count: attendanceDevicesCount,
        required: false,
      },
    ];

    const requiredChecks = checks.filter((item) => item.required);
    const completedRequiredChecks = requiredChecks.filter(
      (item) => item.complete,
    );
    const missing = checks
      .filter((item) => item.required && !item.complete)
      .map((item) => item.label);
    const warnings = checks
      .filter((item) => !item.required && !item.complete)
      .map((item) => item.label);
    const completionPercentage = Math.round(
      (completedRequiredChecks.length / requiredChecks.length) * 100,
    );

    return {
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
      },
      is_complete: missing.length === 0,
      completion_percentage: completionPercentage,
      counts: {
        active_users: activeUsersCount,
        branches: branchesCount,
        departments: departmentsCount,
        employees: employeesCount,
        active_attendance_policies: activeAttendancePolicyCount,
        default_timetables: defaultTimetableCount,
        active_attendance_devices: attendanceDevicesCount,
      },
      missing,
      warnings,
      checks,
      next_steps: this.buildCompanyOnboardingNextSteps(checks),
    };
  }

  private async changeCompanyStatus(companyId: number, status: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    company.status = status;
    const saved = await this.companyRepository.save(company);

    return {
      message: `Company ${status} successfully`,
      data: {
        id: saved.id,
        name: saved.name,
        slug: saved.slug,
        status: saved.status,
        metadata: saved.metadata ?? null,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
      },
    };
  }

  private buildCompanyOnboardingNextSteps(
    checks: Array<{
      code: string;
      label: string;
      complete: boolean;
      required: boolean;
    }>,
  ) {
    const actions: Record<string, string> = {
      ADMIN_USER_CONFIGURED: 'Add at least one active company user.',
      BRANCH_CONFIGURED: 'Create at least one branch.',
      DEPARTMENT_CONFIGURED: 'Create at least one department.',
      EMPLOYEE_CONFIGURED: 'Register employees.',
      ACTIVE_ATTENDANCE_POLICY_CONFIGURED:
        'Create and activate an attendance policy.',
      DEFAULT_TIMETABLE_CONFIGURED: 'Create one active default timetable.',
      ATTENDANCE_DEVICE_CONFIGURED:
        'Add attendance devices if biometric/device attendance is required.',
    };

    return checks
      .filter((item) => !item.complete)
      .map((item) => ({
        code: item.code,
        label: item.label,
        required: item.required,
        action: actions[item.code] ?? 'Complete this setup item.',
      }));
  }

  async findCompanyUsersPaginated(companyId: number, query: PaginationDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
    } = query;

    const qb = this.companyUserRepository
      .createQueryBuilder('membership')
      .innerJoinAndSelect('membership.user', 'user')
      .innerJoinAndSelect('membership.company', 'company')
      .leftJoinAndSelect('membership.role_assignments', 'roleAssignments')
      .leftJoinAndSelect('roleAssignments.role', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect(
        'membership.permission_assignments',
        'permissionAssignments',
      )
      .leftJoinAndSelect('permissionAssignments.permission', 'permissions')
      .where('membership.company_id = :companyId', { companyId })
      .andWhere('membership.status = :status', { status: 'active' });

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(user.first_name LIKE :term OR ' +
          'user.last_name LIKE :term OR ' +
          'user.email LIKE :term OR ' +
          'user.phone LIKE :term OR ' +
          'user.user_no LIKE :term)',
        { term },
      );
    }

    const allowedSortFields = [
      'id',
      'user_no',
      'first_name',
      'last_name',
      'email',
      'phone',
      'status',
      'created_at',
      'updated_at',
    ];

    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    qb.orderBy(`user.${safeSortBy}`, direction);

    const skip = (page - 1) * limit;
    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data: items.map((membership) => ({
        id: membership.user.id,
        user_no: membership.user.user_no,
        first_name: membership.user.first_name,
        last_name: membership.user.last_name,
        phone: membership.user.phone,
        email: membership.user.email,
        status: membership.user.status,
        is_email_verified: membership.user.is_email_verified,
        is_two_factor_enabled: membership.user.is_two_factor_enabled,
        last_login_at: membership.user.last_login_at,
        last_login_ip: membership.user.last_login_ip,
        created_at: membership.user.created_at,
        updated_at: membership.user.updated_at,
        roles:
          membership.role_assignments?.map(
            (assignment) => assignment.role.name,
          ) ?? [],
        permissions: this.getMembershipPermissions(membership),
      })),
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }
}
