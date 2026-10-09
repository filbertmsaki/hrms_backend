import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EntityManager, In, MoreThan, Repository } from 'typeorm';

import { PaginationDto } from 'src/common/dto/pagination.dto';
import { comparePasswords, hashPassword } from 'src/common/utils/hash.util';
import { hasPermission } from 'src/common/utils/permission.util';
import { normalizeTanzaniaOrUgandaPhone } from 'src/common/utils/tanzania-phone.util';
import { CompaniesService } from '../companies/companies.service';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { encryptTwoFactorSecret } from '../auth/2fa/utils/two-factor-secret.util';
import { normalizeCompanyMetadata } from '../../common/utils/company-modules.util';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UpdateDashboardCardStyleDto } from './dtos/update-dashboard-card-style.dto';
import { UserProfileDto } from './dtos/user-profile-dto';
import { User } from './entities/user.entity';
import { DefaultAvatarsService } from '../hr/default-avatars/default-avatars.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ProfileImageSourceEnum } from '../hr/employees/enums/profile-image-source.enum';
import { FilesService } from '../files/files.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import {
  IdentitySyncService,
  IdentityValues,
} from '../identity-sync/identity-sync.service';
import { IdentityChangeSource } from '../identity-sync/entities/identity-change-audit.entity';

type UploadedAccountProfilePhoto = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type EmployeeImportAccountResult = {
  user: User;
  membership: CompanyUser;
  action: 'CREATED' | 'REUSED';
};

type EmployeeImportAccountMetadata = {
  provisioned?: boolean;
  requires_password_change?: boolean;
  provisioned_at?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    private readonly companiesService: CompaniesService,
    private readonly defaultAvatarsService: DefaultAvatarsService,
    private readonly authSessionsService: AuthSessionsService,
    private readonly configService: ConfigService,
    private readonly identitySyncService: IdentitySyncService,
    private readonly filesService?: FilesService,
  ) {}

  private extractRoleIds(
    roles?: Array<{ id?: number } | number>,
  ): number[] | undefined {
    if (!roles?.length) {
      return undefined;
    }

    const roleIds = roles
      .map((role) => (typeof role === 'number' ? role : role?.id))
      .filter((roleId): roleId is number => typeof roleId === 'number');

    return roleIds.length ? roleIds : undefined;
  }

  private static readonly PASSWORD_CHANGE_EXEMPT_ROLE_NAMES = [
    'COMPANY_ADMIN',
    'SYSTEM_ADMIN',
  ];

  private async hasAdminRole(roleIds?: number[]): Promise<boolean> {
    if (!roleIds?.length) {
      return false;
    }

    const roles = await this.roleRepository.findBy({ id: In(roleIds) });
    return roles.some((role) =>
      UsersService.PASSWORD_CHANGE_EXEMPT_ROLE_NAMES.includes(
        role.name?.trim().toUpperCase(),
      ),
    );
  }

  private async findOrFail(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      // Guards evaluate inherited permissions on every authenticated request.
      relations: ['roles', 'roles.permissions', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  private getMembershipRoleEntities(membership: CompanyUser) {
    const roleMap = new Map<number, Role>();

    membership.role_assignments?.forEach((assignment) => {
      if (assignment.role?.id) {
        roleMap.set(assignment.role.id, assignment.role);
      }
    });

    return Array.from(roleMap.values()).map((role) => ({
      id: role.id,
      name: role.name,
      display_name: role.display_name,
      description: role.description,
      company_id: role.company_id,
      is_system_generated: role.is_system_generated,
      created_at: role.created_at,
      updated_at: role.updated_at,
    }));
  }

  private getMembershipPermissionEntities(membership: CompanyUser) {
    const permissionMap = new Map<number, Permission>();

    membership.permission_assignments?.forEach((assignment) => {
      if (assignment.permission?.id) {
        permissionMap.set(assignment.permission.id, assignment.permission);
      }
    });

    membership.role_assignments?.forEach((assignment) => {
      assignment.role?.permissions?.forEach((permission) => {
        if (permission?.id) {
          permissionMap.set(permission.id, permission);
        }
      });
    });

    return Array.from(permissionMap.values()).map((permission) => ({
      id: permission.id,
      name: permission.name,
      display_name: permission.display_name,
      description: permission.description,
      is_system_generated: permission.is_system_generated,
      created_at: permission.created_at,
      updated_at: permission.updated_at,
    }));
  }

  private getMembershipPermissionNames(membership: CompanyUser): string[] {
    const permissionNames = new Set<string>();

    membership.permission_assignments?.forEach((assignment) => {
      if (assignment.permission?.name) {
        permissionNames.add(assignment.permission.name);
      }
    });

    membership.role_assignments?.forEach((assignment) => {
      assignment.role?.permissions?.forEach((permission) => {
        if (permission?.name) {
          permissionNames.add(permission.name);
        }
      });
    });

    return Array.from(permissionNames);
  }

  private async resolveRoleEntitiesByNames(
    roleNames: string[],
    companyId: number,
  ) {
    if (!roleNames.length) {
      return [];
    }

    const uniqueNames = Array.from(
      new Set(roleNames.map((name) => name.trim())),
    );
    const roles = await this.roleRepository
      .createQueryBuilder('role')
      .where('role.name IN (:...roleNames)', { roleNames: uniqueNames })
      .andWhere('role.company_id = :companyId', {
        companyId,
      })
      .getMany();

    const roleMap = new Map<number, Role>();
    roles.forEach((role) => {
      roleMap.set(role.id, role);
    });

    return Array.from(roleMap.values()).map((role) => ({
      id: role.id,
      name: role.name,
      display_name: role.display_name,
      description: role.description,
      company_id: role.company_id,
      is_system_generated: role.is_system_generated,
      created_at: role.created_at,
      updated_at: role.updated_at,
    }));
  }

  private async resolvePermissionEntitiesByNames(permissionNames: string[]) {
    if (!permissionNames.length) {
      return [];
    }

    const uniqueNames = Array.from(
      new Set(permissionNames.map((name) => name.trim())),
    );

    const permissions = await this.permissionRepository.find({
      where: uniqueNames.map((name) => ({ name })),
    });

    const permissionMap = new Map<number, Permission>();
    permissions.forEach((permission) => {
      permissionMap.set(permission.id, permission);
    });

    return Array.from(permissionMap.values()).map((permission) => ({
      id: permission.id,
      name: permission.name,
      display_name: permission.display_name,
      description: permission.description,
      is_system_generated: permission.is_system_generated,
      created_at: permission.created_at,
      updated_at: permission.updated_at,
    }));
  }

  private async findActiveMembershipWithDetails(
    userId: number,
    companyId: number,
  ): Promise<CompanyUser | null> {
    const membershipRepository =
      this.userRepository.manager.getRepository(CompanyUser);

    return membershipRepository
      .createQueryBuilder('membership')
      .innerJoinAndSelect('membership.company', 'company')
      .leftJoinAndSelect('membership.employee', 'employee')
      .leftJoinAndSelect('membership.role_assignments', 'roleAssignments')
      .leftJoinAndSelect('roleAssignments.role', 'role')
      .leftJoinAndSelect('role.permissions', 'rolePermissions')
      .leftJoinAndSelect(
        'membership.permission_assignments',
        'permissionAssignments',
      )
      .leftJoinAndSelect('permissionAssignments.permission', 'permission')
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.company_id = :companyId', { companyId })
      .andWhere('membership.status = :activeStatus', { activeStatus: 'active' })
      .andWhere('company.status = :companyStatus', { companyStatus: 'active' })
      .getOne();
  }

  private async findCompanyEmployeeOrFail(userId: number, companyId: number) {
    const membership = await this.findActiveMembershipWithDetails(
      userId,
      companyId,
    );

    if (!membership) {
      throw new NotFoundException('Active company membership not found');
    }

    const employee = await this.employeeRepository.findOne({
      where: { company_user_id: membership.id },
      relations: {
        default_avatar: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return {
      membership,
      employee,
    };
  }

  private async findCompanyMembershipWithOptionalEmployee(
    userId: number,
    companyId: number,
  ): Promise<{ membership: CompanyUser; employee: Employee | null }> {
    try {
      return await this.findCompanyEmployeeOrFail(userId, companyId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
      const membership = await this.findActiveMembershipWithDetails(
        userId,
        companyId,
      );
      if (!membership) {
        throw error;
      }
      return { membership, employee: membership.employee ?? null };
    }
  }

  private readEmployeeImportAccountMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): EmployeeImportAccountMetadata | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const raw = metadata.employee_import_account;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    return raw as EmployeeImportAccountMetadata;
  }

  private hasPendingEmployeeImportPasswordChange(
    metadata: Record<string, unknown> | null | undefined,
  ): boolean {
    return (
      this.readEmployeeImportAccountMetadata(metadata)
        ?.requires_password_change === true
    );
  }

  private clearEmployeeImportPasswordChangeMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== 'object') {
      return metadata ?? null;
    }

    const current = this.readEmployeeImportAccountMetadata(metadata);
    if (!current?.requires_password_change) {
      return metadata;
    }

    return {
      ...metadata,
      employee_import_account: {
        ...current,
        requires_password_change: false,
      },
    };
  }

  private async findEmployeesForUser(userId: number, companyId?: number) {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('membership.user_id = :userId', { userId });

    if (companyId) {
      query.andWhere('membership.company_id = :companyId', { companyId });
    }

    return query.getMany();
  }

  resolveEmployeeInitialPassword(): string {
    const defaultPassword = this.configService.get<string>(
      'EMPLOYEE_IMPORT_DEFAULT_PASSWORD',
    );
    return defaultPassword && defaultPassword.length > 0
      ? defaultPassword
      : randomBytes(24).toString('base64url');
  }

  async generateUserNo(manager?: EntityManager): Promise<string> {
    const repository = manager?.getRepository(User) ?? this.userRepository;
    const year = new Date().getFullYear();
    const prefix = `USER-${year}-`;

    const qb = repository
      .createQueryBuilder('user')
      .where('user.user_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('user.user_no', 'DESC')
      .limit(1);

    const lastUser = await qb.getOne();

    let nextNumber = 1;
    if (lastUser?.user_no) {
      const numPart = lastUser.user_no.substring(prefix.length);
      const parsed = Number(numPart);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  }

  private async generateImportPlaceholderPhone(
    manager?: EntityManager,
  ): Promise<string> {
    const repository = manager?.getRepository(User) ?? this.userRepository;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `+999${Math.floor(
        100000000 + Math.random() * 900000000,
      )}`;
      const existing = await repository.findOne({
        where: { phone: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Could not generate a unique placeholder phone number for the import user',
    );
  }

  async ensureEmployeeImportAccount(
    companyId: number,
    input: {
      email: string;
      firstName: string;
      lastName: string;
      roleNames?: string[];
    },
    manager?: EntityManager,
  ): Promise<EmployeeImportAccountResult> {
    const repository = manager?.getRepository(User) ?? this.userRepository;
    const membershipRepository =
      manager?.getRepository(CompanyUser) ??
      this.userRepository.manager.getRepository(CompanyUser);

    const email = input.email.trim().toLowerCase();
    let user = await repository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'status',
        'user_type',
        'is_email_verified',
        'must_set_password',
        'activated_at',
        'account_provisioning_status',
      ],
    });
    let action: EmployeeImportAccountResult['action'] = 'REUSED';

    if (!user) {
      const hashedPassword = await hashPassword(
        this.resolveEmployeeInitialPassword(),
      );
      user = await repository.save(
        repository.create({
          user_no: await this.generateUserNo(manager),
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          phone: await this.generateImportPlaceholderPhone(manager),
          email,
          password: hashedPassword,
          status: 'active',
          user_type: 'COMPANY_USER',
          is_email_verified: false,
          must_set_password: true,
          activated_at: new Date(),
          account_provisioning_status: 'active',
        }),
      );
      action = 'CREATED';
    }

    await this.companiesService.addUserToCompany(
      user.id,
      companyId,
      {
        roleNames:
          input.roleNames?.length && input.roleNames.length > 0
            ? input.roleNames
            : ['EMPLOYEE'],
      },
      manager,
    );

    const membership = await membershipRepository.findOne({
      where: {
        company_id: companyId,
        user_id: user.id,
        status: 'active',
      },
    });

    if (!membership) {
      throw new NotFoundException('Company membership could not be created');
    }

    return {
      user,
      membership,
      action,
    };
  }

  async hasPendingImportedPasswordChange(
    userId: number,
    companyId?: number,
  ): Promise<boolean> {
    const employees = await this.findEmployeesForUser(userId, companyId);
    return employees.some((employee) =>
      this.hasPendingEmployeeImportPasswordChange(employee.metadata),
    );
  }

  async clearPendingImportedPasswordChange(userId: number): Promise<void> {
    const employees = await this.findEmployeesForUser(userId);
    const employeesToUpdate = employees.filter((employee) =>
      this.hasPendingEmployeeImportPasswordChange(employee.metadata),
    );

    if (employeesToUpdate.length === 0) {
      return;
    }

    for (const employee of employeesToUpdate) {
      employee.metadata = this.clearEmployeeImportPasswordChangeMetadata(
        employee.metadata,
      );
    }

    await this.employeeRepository.save(employeesToUpdate);
  }

  async createForCompany(
    companyId: number,
    createUserDto: CreateUserDto,
  ): Promise<UserProfileDto | { message: string; user: UserProfileDto }> {
    const { roles, password, ...userData } = createUserDto;
    const normalizedPhone = normalizeTanzaniaOrUgandaPhone(userData.phone);

    if (!normalizedPhone) {
      throw new BadRequestException(
        'Phone number must be a valid Tanzanian (+255) or Ugandan (+256) number',
      );
    }

    userData.phone = normalizedPhone;
    const existingByEmail = await this.userRepository.findOne({
      where: { email: userData.email },
    });
    const existingByPhone = await this.userRepository.findOne({
      where: { phone: userData.phone },
    });

    if (
      existingByEmail &&
      existingByPhone &&
      existingByEmail.id !== existingByPhone.id
    ) {
      throw new ConflictException(
        'Email and phone belong to different existing users',
      );
    }

    const existingUser = existingByEmail ?? existingByPhone;
    const roleIds = this.extractRoleIds(roles as Array<{ id?: number }>);

    if (existingUser) {
      if (existingByEmail && existingByEmail.phone !== userData.phone) {
        throw new ConflictException(
          'This email already exists with a different phone number',
        );
      }

      if (existingByPhone && existingByPhone.email !== userData.email) {
        throw new ConflictException(
          'This phone number already exists with a different email address',
        );
      }

      const currentMembership = await this.companiesService
        .findCompanyUserContext(companyId, existingUser.id)
        .catch(() => null);

      if (currentMembership) {
        throw new ConflictException('User already belongs to this company');
      }

      await this.companiesService.addUserToCompany(existingUser.id, companyId, {
        roleIds,
      });

      return {
        message: 'Existing user added to company successfully',
        user: await this.findProfileInCompany(existingUser.id, companyId),
      };
    }

    const mustSetPassword = !(await this.hasAdminRole(roleIds));
    const hashedPassword = await hashPassword(password);
    const user = this.userRepository.create({
      ...userData,
      password: hashedPassword,
      user_no: userData.user_no ?? (await this.generateUserNo()),
      status: userData.status ?? 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: false,
      must_set_password: mustSetPassword,
    });

    const savedUser = await this.userRepository.save(user);

    await this.companiesService.addUserToCompany(savedUser.id, companyId, {
      roleIds,
    });

    return this.findProfileInCompany(savedUser.id, companyId);
  }

  async findByEmailWithRelations(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findByEmailForAuth(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'password',
        'status',
        'user_type',
        'first_name',
        'last_name',
        'user_no',
        'phone',
        'last_login_at',
        'last_login_ip',
        'is_email_verified',
        'is_two_factor_enabled',
        'two_factor_setup_required',
        'force_two_factor',
        'auth_token_invalid_before',
        'auth_token_version',
      ],
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      relations: ['roles', 'permissions'],
    });
  }

  async findAllPaginatedInCompany(companyId: number, query: PaginationDto) {
    return this.companiesService.findCompanyUsersPaginated(companyId, query);
  }

  async findByIdWithRelations(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findById(id: number): Promise<User> {
    return this.findOrFail(id);
  }

  async findByIdWithTwoFactor(id: number): Promise<User> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.two_factor_secret',
        'user.two_factor_backup_codes',
        'user.two_factor_setup_required',
        'user.two_factor_enabled_at',
        'user.two_factor_enabled_by',
        'user.two_factor_disabled_at',
        'user.two_factor_disabled_by',
        'user.two_factor_disabled_reason',
        'user.auth_token_invalid_before',
        'user.auth_token_version',
      ])
      .where('user.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findMyProfileById(
    id: number,
    companyId: number,
  ): Promise<UserProfileDto> {
    const user = await this.findOrFail(id);
    const currentCompany = await this.companiesService.findCompanyUserContext(
      companyId,
      id,
    );
    const membership = await this.findActiveMembershipWithDetails(
      id,
      companyId,
    );

    const roleEntities = membership
      ? this.getMembershipRoleEntities(membership)
      : await this.resolveRoleEntitiesByNames(currentCompany.roles, companyId);
    const permissionEntities = membership
      ? this.getMembershipPermissionEntities(membership)
      : await this.resolvePermissionEntitiesByNames(currentCompany.permissions);
    const dashboardType = hasPermission(
      permissionEntities.map((permission) => permission.name),
      'view_company_dashboard',
    )
      ? 'admin'
      : 'employee';
    const resolvedAvatar =
      await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
        companyId,
        membership?.employee ??
          (membership
            ? {
                id: membership.id,
                profile_photo_url: membership.profile_photo_url,
                profile_image_source:
                  membership.profile_image_source as ProfileImageSourceEnum | null,
                default_avatar_id: membership.default_avatar_id,
                gender: null,
              }
            : null),
      );

    return new UserProfileDto({
      id: user.id,
      user_no: user.user_no,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email,
      profile_photo_url: resolvedAvatar.profile_photo_url,
      uploaded_profile_photo_url: resolvedAvatar.uploaded_profile_photo_url,
      profile_photo_source: resolvedAvatar.profile_photo_source,
      default_avatar_id: resolvedAvatar.default_avatar_id,
      profile_picture:
        this.defaultAvatarsService.buildProfilePicturePayload(resolvedAvatar),
      status: user.status,
      user_type: user.user_type,
      dashboard_type: dashboardType,
      is_email_verified: user.is_email_verified,
      is_two_factor_enabled: user.is_two_factor_enabled,
      two_factor_setup_required: user.two_factor_setup_required,
      requires_password_change: this.hasPendingEmployeeImportPasswordChange(
        membership?.employee?.metadata,
      ),
      email_verification_expires: user.email_verification_expires,
      last_login_at: user.last_login_at,
      last_login_ip: user.last_login_ip,
      created_at: user.created_at,
      updated_at: user.updated_at,
      roles: roleEntities,
      permissions: permissionEntities,
      active_company: membership?.company
        ? {
            id: membership.company.id,
            name: membership.company.name,
            slug: membership.company.slug,
            status: membership.company.status,
            metadata: normalizeCompanyMetadata(membership.company.metadata),
            created_at: membership.company.created_at,
            updated_at: membership.company.updated_at,
          }
        : null,
      active_company_membership: membership
        ? {
            id: membership.id,
            company_id: membership.company_id,
            user_id: membership.user_id,
            status: membership.status,
            is_default: membership.is_default,
            last_accessed_at: membership.last_accessed_at,
            created_at: membership.created_at,
            updated_at: membership.updated_at,
          }
        : null,
    });
  }

  async getMyDashboardCardStyle(
    userId: number,
  ): Promise<{ palette: string; artwork: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'dashboard_card_style'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user.dashboard_card_style ?? { palette: 'ocean', artwork: 'waves' };
  }

  async updateMyDashboardCardStyle(
    userId: number,
    style: UpdateDashboardCardStyleDto,
  ): Promise<{ palette: string; artwork: string }> {
    const result = await this.userRepository.update(userId, {
      dashboard_card_style: {
        palette: style.palette,
        artwork: style.artwork,
      },
    });
    if (!result.affected) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return { palette: style.palette, artwork: style.artwork };
  }

  async findProfileInCompany(
    id: number,
    companyId: number,
  ): Promise<UserProfileDto> {
    const user = await this.findOrFail(id);
    const companyContext = await this.companiesService.findCompanyUserContext(
      companyId,
      id,
    );
    const membership = await this.findActiveMembershipWithDetails(
      id,
      companyId,
    );

    const roleEntities = membership
      ? this.getMembershipRoleEntities(membership)
      : await this.resolveRoleEntitiesByNames(companyContext.roles, companyId);
    const permissionEntities = membership
      ? this.getMembershipPermissionEntities(membership)
      : await this.resolvePermissionEntitiesByNames(companyContext.permissions);
    const dashboardType = hasPermission(
      permissionEntities.map((permission) => permission.name),
      'view_company_dashboard',
    )
      ? 'admin'
      : 'employee';
    const resolvedAvatar =
      await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
        companyId,
        membership?.employee ??
          (membership
            ? {
                id: membership.id,
                profile_photo_url: membership.profile_photo_url,
                profile_image_source:
                  membership.profile_image_source as ProfileImageSourceEnum | null,
                default_avatar_id: membership.default_avatar_id,
                gender: null,
              }
            : null),
      );

    return new UserProfileDto({
      id: user.id,
      user_no: user.user_no,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email,
      profile_photo_url: resolvedAvatar.profile_photo_url,
      uploaded_profile_photo_url: resolvedAvatar.uploaded_profile_photo_url,
      profile_photo_source: resolvedAvatar.profile_photo_source,
      default_avatar_id: resolvedAvatar.default_avatar_id,
      profile_picture:
        this.defaultAvatarsService.buildProfilePicturePayload(resolvedAvatar),
      status: user.status,
      user_type: user.user_type,
      dashboard_type: dashboardType,
      is_email_verified: user.is_email_verified,
      is_two_factor_enabled: user.is_two_factor_enabled,
      two_factor_setup_required: user.two_factor_setup_required,
      requires_password_change: this.hasPendingEmployeeImportPasswordChange(
        membership?.employee?.metadata,
      ),
      email_verification_expires: user.email_verification_expires,
      last_login_at: user.last_login_at,
      last_login_ip: user.last_login_ip,
      created_at: user.created_at,
      updated_at: user.updated_at,
      roles: roleEntities,
      permissions: permissionEntities,
      active_company: membership?.company
        ? {
            id: membership.company.id,
            name: membership.company.name,
            slug: membership.company.slug,
            status: membership.company.status,
            metadata: normalizeCompanyMetadata(membership.company.metadata),
            created_at: membership.company.created_at,
            updated_at: membership.company.updated_at,
          }
        : null,
      active_company_membership: membership
        ? {
            id: membership.id,
            company_id: membership.company_id,
            user_id: membership.user_id,
            status: membership.status,
            is_default: membership.is_default,
            last_accessed_at: membership.last_accessed_at,
            created_at: membership.created_at,
            updated_at: membership.updated_at,
          }
        : null,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async listMyAvailableAvatars(companyId: number, userId: number) {
    const { membership } = await this.findCompanyMembershipWithOptionalEmployee(
      userId,
      companyId,
    );

    return this.defaultAvatarsService.listAvailableForGender(
      companyId,
      membership.employee?.gender ?? null,
    );
  }

  async updateMySelectedAvatar(
    companyId: number,
    userId: number,
    avatarId: number,
  ): Promise<UserProfileDto> {
    const { membership, employee } =
      await this.findCompanyMembershipWithOptionalEmployee(userId, companyId);
    const selectedAvatar =
      await this.defaultAvatarsService.assertAvatarAvailableForEmployee(
        companyId,
        avatarId,
        employee?.gender ?? null,
      );

    if (employee) {
      employee.default_avatar_id = selectedAvatar.id;
      employee.default_avatar = selectedAvatar;
      employee.profile_image_source = ProfileImageSourceEnum.DEFAULT_AVATAR;
      await this.employeeRepository.save(employee);
    } else {
      membership.default_avatar_id = selectedAvatar.id;
      membership.profile_image_source = ProfileImageSourceEnum.DEFAULT_AVATAR;
      await this.userRepository.manager
        .getRepository(CompanyUser)
        .save(membership);
    }

    return this.findMyProfileById(userId, companyId);
  }

  async updateUserSelectedAvatar(
    companyId: number,
    userId: number,
    avatarId: number,
  ): Promise<UserProfileDto> {
    const { employee } = await this.findCompanyEmployeeOrFail(
      userId,
      companyId,
    );
    const selectedAvatar =
      await this.defaultAvatarsService.assertAvatarAvailableForEmployee(
        companyId,
        avatarId,
        employee.gender,
      );

    employee.default_avatar_id = selectedAvatar.id;
    employee.default_avatar = selectedAvatar;
    employee.profile_image_source = ProfileImageSourceEnum.DEFAULT_AVATAR;

    await this.employeeRepository.save(employee);

    return this.findProfileInCompany(userId, companyId);
  }

  async clearMySelectedAvatar(
    companyId: number,
    userId: number,
  ): Promise<UserProfileDto> {
    const { membership, employee } =
      await this.findCompanyMembershipWithOptionalEmployee(userId, companyId);

    if (employee) {
      employee.default_avatar_id = null;
      employee.default_avatar = null;
      employee.profile_image_source = employee.profile_photo_url
        ? ProfileImageSourceEnum.UPLOADED
        : null;
      await this.employeeRepository.save(employee);
    } else {
      membership.default_avatar_id = null;
      membership.profile_image_source = membership.profile_photo_url
        ? ProfileImageSourceEnum.UPLOADED
        : null;
      await this.userRepository.manager
        .getRepository(CompanyUser)
        .save(membership);
    }

    return this.findMyProfileById(userId, companyId);
  }

  async uploadMyAccountProfilePhoto(
    companyId: number,
    userId: number,
    file: UploadedAccountProfilePhoto,
  ): Promise<UserProfileDto> {
    const membership = await this.findActiveMembershipWithDetails(
      userId,
      companyId,
    );
    if (!membership) {
      throw new NotFoundException('Active company membership not found');
    }
    if (membership.employee) {
      throw new BadRequestException(
        'Employee accounts must use /me/profile/photo so the correct approval policy is applied.',
      );
    }

    if (!this.filesService) {
      throw new Error('Profile photo storage is unavailable.');
    }

    const storedFile = await this.filesService.saveBufferFile({
      buffer: file.buffer,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      directorySegments: ['profile-photos', `company-${companyId}`],
      fileNamePrefix: `user-${userId}`,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxFileSizeBytes: 5 * 1024 * 1024,
      validateFileSignature: true,
    });

    const previousPath = membership.profile_photo_url;
    try {
      membership.profile_photo_url = storedFile.publicPath;
      membership.profile_image_source = ProfileImageSourceEnum.UPLOADED;
      await this.userRepository.manager
        .getRepository(CompanyUser)
        .save(membership);
      await this.filesService.removeManagedFile(previousPath);
      return this.findMyProfileById(userId, companyId);
    } catch (error) {
      await this.filesService.removeManagedFile(storedFile.publicPath);
      throw error;
    }
  }

  async clearUserSelectedAvatar(
    companyId: number,
    userId: number,
  ): Promise<UserProfileDto> {
    const { employee } = await this.findCompanyEmployeeOrFail(
      userId,
      companyId,
    );

    employee.default_avatar_id = null;
    employee.default_avatar = null;
    employee.profile_image_source = employee.profile_photo_url
      ? ProfileImageSourceEnum.UPLOADED
      : null;

    await this.employeeRepository.save(employee);

    return this.findProfileInCompany(userId, companyId);
  }

  async findByPhone(phone: string): Promise<User | null> {
    const normalizedPhone = normalizeTanzaniaOrUgandaPhone(phone);
    if (!normalizedPhone) {
      return null;
    }

    return this.userRepository.findOne({ where: { phone: normalizedPhone } });
  }

  async findByUserNo(userNo: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { user_no: userNo } });
  }

  async existsByUserNo(userNo: string): Promise<boolean> {
    return !!(await this.findByUserNo(userNo));
  }

  async updateLastLogin(
    id: number,
    lastLoginAt: Date,
    lastLoginIp: string | null = null,
  ): Promise<void> {
    await this.userRepository.update(id, {
      last_login_at: lastLoginAt,
      last_login_ip: lastLoginIp,
    });
  }

  async revokeAllSessions(
    userId: number,
    invalidBefore = new Date(),
  ): Promise<void> {
    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        auth_token_invalid_before: invalidBefore,
        auth_token_version: () => '"auth_token_version" + 1',
      })
      .where('id = :userId', {
        userId,
      })
      .execute();

    await this.authSessionsService.revokeAllSessionsForUser(
      userId,
      'all_sessions_revoked',
    );
  }

  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    await this.userRepository.update(id, {
      password: hashedPassword,
      must_set_password: false,
    });
    await this.clearPendingImportedPasswordChange(id);
  }

  async updatePasswordAndRevokeSessions(
    userId: number,
    hashedPassword: string,
  ): Promise<void> {
    await this.userRepository.manager.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .createQueryBuilder()
        .update(User)
        .set({
          password: hashedPassword,
          must_set_password: false,
          auth_token_invalid_before: new Date(),
          auth_token_version: () => '"auth_token_version" + 1',
        })
        .where('id = :userId', {
          userId,
        })
        .execute();
    });

    await this.authSessionsService.revokeAllSessionsForUser(
      userId,
      'password_changed',
    );
    await this.clearPendingImportedPasswordChange(userId);
  }

  /**
   * Updates a user. Shared identity fields (names, email, phone) are synced
   * to every linked employee and audited in the same transaction.
   */
  async update(
    id: number,
    updateUserDto: UpdateUserDto,
    audit: {
      actor: AuthenticatedUser;
      companyId?: number | null;
      context?: AuditRequestContext | null;
    } | null = null,
  ): Promise<User> {
    await this.findOrFail(id);
    const { roles, first_name, last_name, email, phone, ...otherFields } =
      updateUserDto as UpdateUserDto & { roles?: unknown };
    void roles;
    const identity: IdentityValues = { first_name, last_name, email, phone };
    if (typeof phone === 'string') {
      const normalizedPhone = normalizeTanzaniaOrUgandaPhone(phone);
      if (!normalizedPhone) {
        throw new BadRequestException(
          'Phone number must be a valid Tanzanian (+255) or Ugandan (+256) number',
        );
      }

      identity.phone = normalizedPhone;
    }

    await this.userRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      if (Object.keys(otherFields).length) {
        const user = await repository.findOneByOrFail({ id });
        Object.assign(user, otherFields);
        await repository.save(user);
      }
      if (Object.values(identity).some((value) => value !== undefined)) {
        await this.identitySyncService.sync(manager, {
          companyId:
            audit?.companyId ?? (await this.resolveAuditCompanyId(manager, id)),
          userId: id,
          values: identity,
          source: IdentityChangeSource.USER_UPDATE,
          actor: audit?.actor ?? null,
          context: audit?.context,
        });
      }
    });
    return this.findOrFail(id);
  }

  /** Fallback audit company for users acting outside a company context. */
  private async resolveAuditCompanyId(
    manager: EntityManager,
    userId: number,
  ): Promise<number> {
    const membership = await manager.getRepository(CompanyUser).findOne({
      where: { user_id: userId },
      order: { id: 'ASC' },
    });
    return membership?.company_id ?? 0;
  }

  async updateInCompany(
    companyId: number,
    id: number,
    updateUserDto: UpdateUserDto,
    actor: AuthenticatedUser,
    context?: AuditRequestContext | null,
  ): Promise<UserProfileDto> {
    await this.companiesService.findCompanyUserContext(companyId, id);
    await this.update(id, updateUserDto, { actor, companyId, context });
    return this.findProfileInCompany(id, companyId);
  }

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await comparePasswords(oldPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password incorrect');
    }

    const isSamePassword = await comparePasswords(newPassword, user.password);
    if (isSamePassword) {
      throw new UnauthorizedException(
        'New password must be different from the current password',
      );
    }

    const hashed = await hashPassword(newPassword);
    await this.updatePasswordAndRevokeSessions(userId, hashed);

    return {
      message: 'Password changed successfully. Please log in again.',
    };
  }

  async resetPasswordInCompany(
    companyId: number,
    userId: number,
    newPassword: string,
  ): Promise<{ message: string }> {
    await this.companiesService.findCompanyUserContext(companyId, userId);

    await this.userRepository.update(userId, {
      password: await hashPassword(newPassword),
      must_set_password: true,
    });
    await this.revokeAllSessions(userId);

    return {
      message:
        'Password reset successfully. The user must change their temporary password after logging in.',
    };
  }

  async updateVerificationToken(
    userId: number,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      email_verification_token: token,
      email_verification_expires: expires,
    });
  }

  async markEmailVerified(userId: number): Promise<void> {
    await this.userRepository.update(userId, {
      is_email_verified: true,
      email_verification_token: null,
      email_verification_expires: null,
    });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: {
        email_verification_token: token,
        email_verification_expires: MoreThan(new Date()),
      },
    });
  }

  async update2FASecret(userId: number, secret: string): Promise<void> {
    await this.userRepository.update(userId, {
      two_factor_secret: encryptTwoFactorSecret(secret),
      two_factor_backup_codes: null,
      two_factor_setup_required: true,
    });
  }

  async complete2FASetup(
    userId: number,
    secret: string,
    backupCodes: string[],
  ): Promise<void> {
    const current = await this.findByIdWithTwoFactor(userId);
    const update: {
      is_two_factor_enabled: boolean;
      two_factor_setup_required: boolean;
      two_factor_secret: string | null;
      two_factor_backup_codes: string[];
      two_factor_disabled_at: null;
      two_factor_disabled_by: null;
      two_factor_disabled_reason: null;
      two_factor_enabled_at?: Date;
      two_factor_enabled_by?: null;
    } = {
      is_two_factor_enabled: true,
      two_factor_setup_required: false,
      two_factor_secret: encryptTwoFactorSecret(secret),
      two_factor_backup_codes: backupCodes,
      two_factor_disabled_at: null,
      two_factor_disabled_by: null,
      two_factor_disabled_reason: null,
    };

    if (!current.is_two_factor_enabled || !current.two_factor_enabled_at) {
      update.two_factor_enabled_at = new Date();
    }

    if (!current.is_two_factor_enabled) {
      update.two_factor_enabled_by = null;
    }

    await this.userRepository.update(userId, update);
  }

  async requireTwoFactorSetup(userId: number): Promise<void> {
    await this.userRepository.update(userId, {
      is_two_factor_enabled: true,
      two_factor_setup_required: true,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    });
  }

  async setForceTwoFactor(userId: number, force: boolean): Promise<void> {
    await this.userRepository.update(userId, { force_two_factor: force });
  }

  async updateBackupCodes(
    userId: number,
    backupCodes: string[],
  ): Promise<void> {
    await this.userRepository.update(userId, {
      two_factor_backup_codes: backupCodes,
    });
  }

  async disable2FA(userId: number): Promise<void> {
    await this.userRepository.update(userId, {
      is_two_factor_enabled: false,
      two_factor_setup_required: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    });
  }

  async adminEnableTwoFactor(
    userId: number,
    administratorId: number,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      is_two_factor_enabled: true,
      two_factor_setup_required: true,
      two_factor_secret: null,
      two_factor_backup_codes: null,
      two_factor_enabled_at: new Date(),
      two_factor_enabled_by: administratorId,
      two_factor_disabled_at: null,
      two_factor_disabled_by: null,
      two_factor_disabled_reason: null,
    });
  }

  async adminDisableTwoFactor(
    userId: number,
    administratorId: number,
    reason: string | null,
    revokedAt: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      is_two_factor_enabled: false,
      two_factor_setup_required: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
      two_factor_disabled_at: revokedAt,
      two_factor_disabled_by: administratorId,
      two_factor_disabled_reason: reason,
      auth_token_invalid_before: revokedAt,
    });

    await this.authSessionsService.revokeAllSessionsForUser(
      userId,
      'two_factor_disabled',
    );
  }

  async markAuthTokensInvalidBefore(
    userId: number,
    invalidBefore: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      auth_token_invalid_before: invalidBefore,
    });

    await this.authSessionsService.revokeAllSessionsForUser(
      userId,
      'tokens_invalidated',
    );
  }

  async hasAnotherProtectedTwoFactorAdmin(
    companyId: number,
    excludedUserId: number,
  ): Promise<boolean> {
    const membershipRepository =
      this.userRepository.manager.getRepository(CompanyUser);

    const memberships = await membershipRepository.find({
      where: {
        company_id: companyId,
        status: 'active',
      },
      relations: {
        user: true,
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

    return memberships.some((membership) => {
      if (
        membership.user_id === excludedUserId ||
        membership.user?.status !== 'active' ||
        !membership.user.is_two_factor_enabled ||
        membership.user.two_factor_setup_required
      ) {
        return false;
      }

      const permissionNames = this.getMembershipPermissionNames(membership);
      return hasPermission(permissionNames, 'users:disable-2fa');
    });
  }

  async assignRoleInCompany(
    companyId: number,
    userId: number,
    roleId: number,
  ): Promise<UserProfileDto> {
    await this.companiesService.assignRole(companyId, userId, roleId);
    return this.findProfileInCompany(userId, companyId);
  }

  async revokeRoleInCompany(
    companyId: number,
    userId: number,
    roleId: number,
  ): Promise<UserProfileDto> {
    await this.companiesService.revokeRole(companyId, userId, roleId);
    return this.findProfileInCompany(userId, companyId);
  }

  async removeFromCompany(
    companyId: number,
    userId: number,
  ): Promise<{ message: string }> {
    return this.companiesService.removeUserFromCompany(companyId, userId);
  }
}
