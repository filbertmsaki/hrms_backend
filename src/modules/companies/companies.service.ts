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
import { Company } from './entities/company.entity';
import { CompanyUser } from './entities/company-user.entity';
import { CompanyUserRole } from './entities/company-user-role.entity';
import { CompanyUserPermission } from './entities/company-user-permission.entity';
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

  private getUserRepository(manager?: EntityManager): Repository<User> {
    return manager?.getRepository(User) ?? this.userRepository;
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
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

  async createCompany(
    name: string,
    slug?: string,
    manager?: EntityManager,
  ): Promise<Company> {
    const companyRepository = this.getCompanyRepository(manager);
    const normalizedSlug = this.slugify(slug || name);

    if (!normalizedSlug) {
      throw new BadRequestException('Company slug could not be generated');
    }

    const existing = await companyRepository.findOne({
      where: { slug: normalizedSlug },
    });
    if (existing) {
      throw new ConflictException('Company slug already exists');
    }

    const company = companyRepository.create({
      name: name.trim(),
      slug: normalizedSlug,
      status: 'active',
    });

    return companyRepository.save(company);
  }

  async createCompanyWithAdministrator(createCompanyDto: CreateCompanyDto) {
    const {
      company_name,
      company_slug,
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

      const company = await this.createCompany(company_name, company_slug, manager);
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
          roleNames: ['ADMINISTRATOR'],
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

  async findAllCompanies() {
    const companies = await this.companyRepository
      .createQueryBuilder('company')
      .leftJoin('company.memberships', 'membership', "membership.status = 'active'")
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
      const namedRoles = await roleRepository.find({
        where: options.roleNames.map((name) => ({ name })),
      });
      if (namedRoles.length !== options.roleNames.length) {
        throw new NotFoundException(
          'One or more requested roles were not found',
        );
      }
      namedRoles.forEach((role) => roleIds.add(role.id));
    }

    if (!roleIds.size) {
      const viewerRole = await roleRepository.findOne({
        where: { name: 'VIEWER' },
      });

      if (!viewerRole) {
        throw new NotFoundException('Default viewer role not found');
      }

      roleIds.add(viewerRole.id);
    }

    const resolvedRoles = await roleRepository.find({
      where: Array.from(roleIds).map((id) => ({ id })),
    });

    if (resolvedRoles.length !== roleIds.size) {
      throw new NotFoundException('One or more requested roles were not found');
    }

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
    if (!role) {
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

    await this.companyUserRepository.delete({ id: membership.id });

    return { message: 'User removed from company successfully' };
  }

  async findCompanyUserContext(
    companyId: number,
    userId: number,
  ): Promise<CompanyMembershipContext> {
    return this.getMembershipContext(userId, companyId);
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
