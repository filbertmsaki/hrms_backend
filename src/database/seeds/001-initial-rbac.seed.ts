import { DataSource, Repository } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { CompanyUserRole } from '../../modules/companies/entities/company-user-role.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { ALLIANCE_COMPANY_NAME } from './company-structure.constants';

type PermissionSeed = {
  name: string;
  displayName: string;
  description: string;
};

type RoleSeed = {
  name: string;
  displayName: string;
  description: string;
  permissionNames: string[];
};

type SeedUserConfig = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  userNo: string;
  userType: 'OWNER' | 'COMPANY_USER';
};

const permissionSeeds: PermissionSeed[] = [
  // Requested platform-level permissions.
  {
    name: 'create_company',
    displayName: 'Create company',
    description: 'Allow creating a new company tenant',
  },
  {
    name: 'view_companies',
    displayName: 'View companies',
    description: 'Allow viewing companies across the platform',
  },
  {
    name: 'update_company',
    displayName: 'Update company',
    description: 'Allow updating company details',
  },
  {
    name: 'delete_company',
    displayName: 'Delete company',
    description: 'Allow deleting a company',
  },
  {
    name: 'create_company_admin',
    displayName: 'Create company administrator',
    description: 'Allow provisioning the first administrator for a company',
  },

  // Requested company-level permissions.
  {
    name: 'view_company_dashboard',
    displayName: 'View company dashboard',
    description: 'Allow viewing the company dashboard',
  },
  {
    name: 'manage_company_users',
    displayName: 'Manage company users',
    description: 'Allow managing users within a company',
  },
  {
    name: 'create_company_user',
    displayName: 'Create company user',
    description: 'Allow creating users within a company',
  },
  {
    name: 'update_company_user',
    displayName: 'Update company user',
    description: 'Allow updating users within a company',
  },
  {
    name: 'delete_company_user',
    displayName: 'Delete company user',
    description: 'Allow deleting users within a company',
  },
  {
    name: 'view_company_data',
    displayName: 'View company data',
    description: 'Allow reading company-owned data',
  },
  {
    name: 'update_company_data',
    displayName: 'Update company data',
    description: 'Allow updating company-owned data',
  },

  // Compatibility permissions used by the existing guards/controllers.
  {
    name: 'companies:create',
    displayName: 'Create companies',
    description: 'Compatibility permission for company creation endpoints',
  },
  {
    name: 'companies:read',
    displayName: 'Read companies',
    description: 'Compatibility permission for company listing endpoints',
  },
  {
    name: 'companies:update',
    displayName: 'Update companies',
    description: 'Compatibility permission for company update endpoints',
  },
  {
    name: 'companies:delete',
    displayName: 'Delete companies',
    description: 'Compatibility permission for company delete endpoints',
  },
  {
    name: 'users:read',
    displayName: 'Read users',
    description: 'Compatibility permission for user listing endpoints',
  },
  {
    name: 'users:create',
    displayName: 'Create users',
    description: 'Compatibility permission for user creation endpoints',
  },
  {
    name: 'users:update',
    displayName: 'Update users',
    description: 'Compatibility permission for user update endpoints',
  },
  {
    name: 'users:delete',
    displayName: 'Delete users',
    description: 'Compatibility permission for user delete endpoints',
  },
  {
    name: 'users:assign-role',
    displayName: 'Assign user roles',
    description: 'Compatibility permission for role assignment endpoints',
  },
  {
    name: 'users:revoke-role',
    displayName: 'Revoke user roles',
    description: 'Compatibility permission for role revocation endpoints',
  },
  {
    name: 'roles:read',
    displayName: 'Read roles',
    description: 'Compatibility permission for role listing endpoints',
  },
  {
    name: 'roles:create',
    displayName: 'Create roles',
    description: 'Compatibility permission for role creation endpoints',
  },
  {
    name: 'roles:update',
    displayName: 'Update roles',
    description: 'Compatibility permission for role update endpoints',
  },
  {
    name: 'roles:delete',
    displayName: 'Delete roles',
    description: 'Compatibility permission for role delete endpoints',
  },
  {
    name: 'permissions:read',
    displayName: 'Read permissions',
    description: 'Compatibility permission for permission listing endpoints',
  },
  {
    name: 'permissions:create',
    displayName: 'Create permissions',
    description: 'Compatibility permission for permission creation endpoints',
  },
  {
    name: 'permissions:update',
    displayName: 'Update permissions',
    description: 'Compatibility permission for permission update endpoints',
  },
  {
    name: 'permissions:delete',
    displayName: 'Delete permissions',
    description: 'Compatibility permission for permission delete endpoints',
  },
  {
    name: 'branches:read',
    displayName: 'Read branches',
    description: 'Allow listing and viewing company branches',
  },
  {
    name: 'branches:create',
    displayName: 'Create branches',
    description: 'Allow creating company branches',
  },
  {
    name: 'branches:update',
    displayName: 'Update branches',
    description: 'Allow updating company branches',
  },
  {
    name: 'branches:delete',
    displayName: 'Delete branches',
    description: 'Allow deleting company branches',
  },
  {
    name: 'branches:manage-access',
    displayName: 'Manage branch access',
    description: 'Allow granting and revoking branch-level access for company users',
  },
  {
    name: 'departments:read',
    displayName: 'Read departments',
    description: 'Allow listing and viewing company departments',
  },
  {
    name: 'departments:create',
    displayName: 'Create departments',
    description: 'Allow creating company departments',
  },
  {
    name: 'departments:update',
    displayName: 'Update departments',
    description: 'Allow updating company departments',
  },
  {
    name: 'departments:delete',
    displayName: 'Delete departments',
    description: 'Allow deleting company departments',
  },
  {
    name: 'positions:read',
    displayName: 'Read positions',
    description: 'Allow listing and viewing company positions',
  },
  {
    name: 'positions:create',
    displayName: 'Create positions',
    description: 'Allow creating company positions',
  },
  {
    name: 'positions:update',
    displayName: 'Update positions',
    description: 'Allow updating company positions',
  },
  {
    name: 'positions:delete',
    displayName: 'Delete positions',
    description: 'Allow deleting company positions',
  },
  {
    name: 'employees:read',
    displayName: 'Read employees',
    description: 'Allow listing and viewing employee profiles',
  },
  {
    name: 'employees:create',
    displayName: 'Create employees',
    description: 'Allow creating employee profiles for existing company users',
  },
  {
    name: 'employees:update',
    displayName: 'Update employees',
    description: 'Allow updating employee profiles and documents',
  },
  {
    name: 'employees:delete',
    displayName: 'Delete employees',
    description: 'Allow deleting employee profiles',
  },
  {
    name: 'employees:onboard',
    displayName: 'Onboard employees',
    description: 'Allow onboarding employees by creating the user and HR profile',
  },
  {
    name: 'employees:change-status',
    displayName: 'Change employee status',
    description: 'Allow managing employee lifecycle statuses',
  },
];

const roleSeeds: RoleSeed[] = [
  {
    name: 'OWNER',
    displayName: 'Platform Owner',
    description: 'Global platform-level owner with no company membership',
    permissionNames: [
      'create_company',
      'view_companies',
      'update_company',
      'delete_company',
      'create_company_admin',
      'companies:create',
      'companies:read',
      'companies:update',
      'companies:delete',
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'permissions:read',
      'permissions:create',
      'permissions:update',
      'permissions:delete',
    ],
  },
  {
    name: 'ADMINISTRATOR',
    displayName: 'Company Administrator',
    description: 'Administrator with full access limited to their own company',
    permissionNames: [
      'view_company_dashboard',
      'manage_company_users',
      'create_company_user',
      'update_company_user',
      'delete_company_user',
      'view_company_data',
      'update_company_data',
      'users:read',
      'users:create',
      'users:update',
      'users:delete',
      'users:assign-role',
      'users:revoke-role',
      'roles:read',
      'permissions:read',
      'branches:read',
      'branches:create',
      'branches:update',
      'branches:delete',
      'branches:manage-access',
      'departments:read',
      'departments:create',
      'departments:update',
      'departments:delete',
      'positions:read',
      'positions:create',
      'positions:update',
      'positions:delete',
      'employees:read',
      'employees:create',
      'employees:update',
      'employees:delete',
      'employees:onboard',
      'employees:change-status',
    ],
  },
  {
    name: 'USER',
    displayName: 'Company User',
    description: 'Regular company user with read-only company access',
    permissionNames: ['view_company_data'],
  },
  {
    name: 'VIEWER',
    displayName: 'Viewer',
    description:
      'Compatibility role mirroring the default read-only company user access',
    permissionNames: ['view_company_data'],
  },
];

export default class InitialRbacSeeder implements Seeder {
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
      const permissionRepo = manager.getRepository(Permission);
      const roleRepo = manager.getRepository(Role);
      const userRepo = manager.getRepository(User);
      const companyRepo = manager.getRepository(Company);
      const companyUserRepo = manager.getRepository(CompanyUser);
      const companyUserRoleRepo = manager.getRepository(CompanyUserRole);

      const ownerConfig: SeedUserConfig = {
        firstName: process.env.INITIAL_OWNER_FIRST_NAME ?? 'Filbert',
        lastName: process.env.INITIAL_OWNER_LAST_NAME ?? 'Msaki',
        email: process.env.INITIAL_OWNER_EMAIL ?? 'filbert@alliance.co.tz',
        phone: process.env.INITIAL_OWNER_PHONE ?? '+255700000001',
        password: process.env.INITIAL_OWNER_PASSWORD ?? 'Owner123!',
        userNo: process.env.INITIAL_OWNER_USER_NO ?? 'OWNER-00001',
        userType: 'OWNER',
      };

      const companyName = process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;

      const adminConfig: SeedUserConfig = {
        firstName: process.env.INITIAL_COMPANY_ADMIN_FIRST_NAME ?? 'Inocent',
        lastName: process.env.INITIAL_COMPANY_ADMIN_LAST_NAME ?? 'Nuruva',
        email:
          process.env.INITIAL_COMPANY_ADMIN_EMAIL ?? 'inocent@alliance.co.tz',
        phone: process.env.INITIAL_COMPANY_ADMIN_PHONE ?? '+255700000002',
        password:
          process.env.INITIAL_COMPANY_ADMIN_PASSWORD ?? 'Admin123!',
        userNo: process.env.INITIAL_COMPANY_ADMIN_USER_NO ?? 'ADMIN-00001',
        userType: 'COMPANY_USER',
      };

      if (
        ownerConfig.email.toLowerCase() === adminConfig.email.toLowerCase() ||
        ownerConfig.phone === adminConfig.phone
      ) {
        throw new Error(
          'OWNER and company administrator must use different email addresses and phone numbers',
        );
      }

      // 1. Seed permissions first so roles can be attached safely.
      const permissionsByName = await this.syncPermissions(
        permissionRepo,
        permissionSeeds,
      );

      // 2. Seed roles with their permission mappings.
      const rolesByName = await this.syncRoles(
        roleRepo,
        roleSeeds,
        permissionsByName,
      );

      const ownerRole = this.requireRole(rolesByName, 'OWNER');
      const adminRole = this.requireRole(rolesByName, 'ADMINISTRATOR');

      // 3. Create or normalize the global OWNER user.
      const ownerUser = await this.findUserByIdentity(
        userRepo,
        ownerConfig.email,
        ownerConfig.phone,
      );

      const savedOwner = await this.ensureOwnerUser(
        userRepo,
        ownerUser,
        ownerConfig,
        ownerRole,
      );

      // In this schema, "company_id = null" is represented by having no
      // company membership row at all for the OWNER user.
      await companyUserRepo.delete({ user_id: savedOwner.id });

      // 4. Create one default company/tenant for sample tenant data.
      const defaultCompany = await this.ensureCompany(
        companyRepo,
        companyName,
      );

      // 5. Create or normalize the default company administrator user.
      const adminUser = await this.findUserByIdentity(
        userRepo,
        adminConfig.email,
        adminConfig.phone,
      );

      const savedAdmin = await this.ensureCompanyUser(
        userRepo,
        adminUser,
        adminConfig,
      );

      // 6. Link the administrator to the Alliance Insurance Corporation Ltd and make that
      // membership their default tenant context.
      const membership = await this.ensureCompanyMembership(
        companyUserRepo,
        defaultCompany.id,
        savedAdmin.id,
      );

      // 7. Assign the tenant-scoped ADMINISTRATOR role through the
      // company membership table, not through global role_user.
      await this.ensureMembershipRole(
        companyUserRoleRepo,
        membership.id,
        adminRole.id,
      );

      await queryRunner.commitTransaction();

      console.log('Multi-tenant seed completed successfully');
      console.log(`OWNER: ${savedOwner.email}`);
      console.log(`COMPANY: ${defaultCompany.name} (${defaultCompany.slug})`);
      console.log(`ADMIN: ${savedAdmin.email}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async syncPermissions(
    permissionRepo: Repository<Permission>,
    definitions: PermissionSeed[],
  ): Promise<Map<string, Permission>> {
    const permissionsByName = new Map<string, Permission>();

    for (const definition of definitions) {
      let permission = await permissionRepo.findOne({
        where: { name: definition.name },
      });

      if (!permission) {
        permission = permissionRepo.create({
          name: definition.name,
          display_name: definition.displayName,
          description: definition.description,
          is_system_generated: true,
        });
      } else {
        permission.display_name = definition.displayName;
        permission.description = definition.description;
      }

      permission.is_system_generated = true;

      permission = await permissionRepo.save(permission);
      permissionsByName.set(permission.name, permission);
    }

    return permissionsByName;
  }

  private async syncRoles(
    roleRepo: Repository<Role>,
    definitions: RoleSeed[],
    permissionsByName: Map<string, Permission>,
  ): Promise<Map<string, Role>> {
    const rolesByName = new Map<string, Role>();

    for (const definition of definitions) {
      let role = await roleRepo.findOne({
        where: { name: definition.name },
        relations: ['permissions'],
      });

      if (!role) {
        role = roleRepo.create({
          name: definition.name,
          display_name: definition.displayName,
          description: definition.description,
          is_system_generated: true,
        });
      } else {
        role.display_name = definition.displayName;
        role.description = definition.description;
      }

      role.is_system_generated = true;

      role.permissions = definition.permissionNames.map((permissionName) => {
        const permission = permissionsByName.get(permissionName);

        if (!permission) {
          throw new Error(`Permission "${permissionName}" is missing`);
        }

        return permission;
      });

      role = await roleRepo.save(role);
      rolesByName.set(role.name, role);
    }

    return rolesByName;
  }

  private requireRole(rolesByName: Map<string, Role>, roleName: string): Role {
    const role = rolesByName.get(roleName);

    if (!role) {
      throw new Error(`Role "${roleName}" could not be resolved`);
    }

    return role;
  }

  private async findUserByIdentity(
    userRepo: Repository<User>,
    email: string,
    phone: string,
  ): Promise<User | null> {
    const userByEmail = await userRepo.findOne({
      where: { email },
      relations: ['roles'],
    });
    const userByPhone = await userRepo.findOne({
      where: { phone },
      relations: ['roles'],
    });

    if (userByEmail && userByPhone && userByEmail.id !== userByPhone.id) {
      throw new Error(
        `Email ${email} and phone ${phone} belong to different users`,
      );
    }

    return userByEmail ?? userByPhone;
  }

  private async ensureOwnerUser(
    userRepo: Repository<User>,
    existingUser: User | null,
    config: SeedUserConfig,
    ownerRole: Role,
  ): Promise<User> {
    let user = existingUser;

    if (!user) {
      user = userRepo.create({
        user_no: config.userNo,
        first_name: config.firstName,
        last_name: config.lastName,
        phone: config.phone,
        email: config.email,
        password: await hashPassword(config.password),
        status: 'active',
        user_type: config.userType,
        is_email_verified: true,
        roles: [ownerRole],
      });
    } else {
      user.first_name = config.firstName;
      user.last_name = config.lastName;
      user.status = 'active';
      user.user_type = 'OWNER';
      user.is_email_verified = true;
      user.roles = this.mergeRole(user.roles, ownerRole);
    }

    return userRepo.save(user);
  }

  private async ensureCompanyUser(
    userRepo: Repository<User>,
    existingUser: User | null,
    config: SeedUserConfig,
  ): Promise<User> {
    if (existingUser?.user_type === 'OWNER') {
      throw new Error(
        `User ${config.email} is already marked as OWNER and cannot also be a company administrator`,
      );
    }

    let user = existingUser;

    if (!user) {
      user = userRepo.create({
        user_no: config.userNo,
        first_name: config.firstName,
        last_name: config.lastName,
        phone: config.phone,
        email: config.email,
        password: await hashPassword(config.password),
        status: 'active',
        user_type: config.userType,
        is_email_verified: true,
      });
    } else {
      user.first_name = config.firstName;
      user.last_name = config.lastName;
      user.status = 'active';
      user.user_type = 'COMPANY_USER';
      user.is_email_verified = true;
    }

    return userRepo.save(user);
  }

  private async ensureCompany(
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<Company> {
    const normalizedCompanyName = companyName.trim();
    let company = await companyRepo.findOne({
      where: { name: normalizedCompanyName },
    });

    if (!company) {
      const uniqueSlug = await this.generateUniqueCompanySlug(
        companyRepo,
        normalizedCompanyName,
      );
      company = companyRepo.create({
        name: normalizedCompanyName,
        slug: uniqueSlug,
        status: 'active',
        metadata: {
          seeded: true,
          purpose: 'default-aicl',
        },
      });
    } else {
      company.name = normalizedCompanyName;
      company.status = 'active';
      company.metadata = {
        ...(company.metadata ?? {}),
        seeded: true,
        purpose: 'default-aicl',
      };
    }

    return companyRepo.save(company);
  }

  private slugifyCompanyName(value: string): string {
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
    companyRepo: Repository<Company>,
    companyName: string,
  ): Promise<string> {
    const baseSlug = this.slugifyCompanyName(companyName);

    if (!baseSlug) {
      throw new Error('Company slug could not be generated from company name');
    }

    let suffix = 0;
    while (true) {
      const slugCandidate = this.buildSlugCandidate(baseSlug, suffix);
      const existingCompany = await companyRepo.findOne({
        where: { slug: slugCandidate },
        select: ['id'],
      });

      if (!existingCompany) {
        return slugCandidate;
      }

      suffix += 1;
    }
  }

  private async ensureCompanyMembership(
    companyUserRepo: Repository<CompanyUser>,
    companyId: number,
    userId: number,
  ): Promise<CompanyUser> {
    await companyUserRepo.update({ user_id: userId }, { is_default: false });

    let membership = await companyUserRepo.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
      },
    });

    if (!membership) {
      membership = companyUserRepo.create({
        company_id: companyId,
        user_id: userId,
        status: 'active',
        is_default: true,
      });
    } else {
      membership.status = 'active';
      membership.is_default = true;
    }

    return companyUserRepo.save(membership);
  }

  private async ensureMembershipRole(
    companyUserRoleRepo: Repository<CompanyUserRole>,
    companyUserId: number,
    roleId: number,
  ): Promise<CompanyUserRole> {
    const existingAssignment = await companyUserRoleRepo.findOne({
      where: {
        company_user_id: companyUserId,
        role_id: roleId,
      },
    });

    if (existingAssignment) {
      return existingAssignment;
    }

    return companyUserRoleRepo.save(
      companyUserRoleRepo.create({
        company_user_id: companyUserId,
        role_id: roleId,
      }),
    );
  }

  private mergeRole(existingRoles: Role[] | undefined, role: Role): Role[] {
    const roles = existingRoles ?? [];

    if (roles.some((existingRole) => existingRole.id === role.id)) {
      return roles;
    }

    return [...roles, role];
  }
}
