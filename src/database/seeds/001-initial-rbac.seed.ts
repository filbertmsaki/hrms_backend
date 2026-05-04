// src/database/seeds/001-initial-rbac.seed.ts
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import * as bcrypt from 'bcrypt';
import { Role } from '../../modules/roles/entities/role.entity';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { User } from '../../modules/users/entities/user.entity';

export default class InitialRbacSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const permissionRepo = dataSource.getRepository(Permission);
      const roleRepo = dataSource.getRepository(Role);
      const userRepo = dataSource.getRepository(User);

      // ─────────────────────────────────────────────────────────────
      // 1. Create Permissions
      // ─────────────────────────────────────────────────────────────
      const permissionsToCreate = [
        // User management
        { name: 'users:read', displayName: 'View users list' },
        { name: 'users:create', displayName: 'Create new user' },
        { name: 'users:update', displayName: 'Update user information' },
        { name: 'users:delete', displayName: 'Delete user' },
        { name: 'users:change-role', displayName: 'Assign/change user roles' },
        { name: 'users:reset-password', displayName: 'Reset user password' },

        // Role & Permission management
        { name: 'roles:read', displayName: 'View roles' },
        { name: 'roles:create', displayName: 'Create new roles' },
        { name: 'roles:update', displayName: 'Edit existing roles' },
        { name: 'roles:delete', displayName: 'Delete roles' },

        { name: 'permissions:read', displayName: 'View permissions list' },
        { name: 'permissions:create', displayName: 'Create new permissions' },
        { name: 'permissions:update', displayName: 'Edit permissions' },
        { name: 'permissions:delete', displayName: 'Delete permissions' },
        { name: 'roles:assign',    displayName: 'Assign roles to users' },

        // System / Settings
        { name: 'settings:read', displayName: 'View system settings' },
        { name: 'settings:manage', displayName: 'Change system settings' },

        // Audit / Logs
        { name: 'logs:read', displayName: 'View system logs & activity' },
        { name: 'logs:export', displayName: 'Export logs' },

        // Example business domain permissions
        { name: 'products:read', displayName: 'View products' },
        { name: 'products:manage', displayName: 'Manage products' },
      ];

      const createdPermissions: Permission[] = [];

      for (const p of permissionsToCreate) {
        let permission = await permissionRepo.findOneBy({ name: p.name });

        if (!permission) {
          permission = permissionRepo.create({
            name: p.name,
            display_name: p.displayName,
            description: `Permission to ${p.displayName.toLowerCase()}`,
          });
          await permissionRepo.save(permission);
        }

        createdPermissions.push(permission);
      }

      console.log(`→ Created/found ${createdPermissions.length} permissions`);

      // ─────────────────────────────────────────────────────────────
      // 2. Create Roles
      // ─────────────────────────────────────────────────────────────
      const rolesData = [
        {
          name: 'super_admin',
          displayName: 'Super Administrator',
          description: 'Full unrestricted access',
          permissionNames: permissionsToCreate.map((p) => p.name),
        },
        {
          name: 'admin',
          displayName: 'Administrator',
          description: 'Most privileges, except dangerous system changes',
          permissionNames: permissionsToCreate
            .map((p) => p.name)
            .filter(
              (name) =>
                !['settings:manage', 'logs:export'].includes(name) ||
                name.startsWith('users:') ||
                name.startsWith('roles:') ||
                name.startsWith('permissions:'),
            ),
        },
        {
          name: 'manager',
          displayName: 'Content / Business Manager',
          description: 'Manage content and business data',
          permissionNames: [
            'users:read',
            'products:read',
            'products:manage',
            'logs:read',
          ],
        },
        {
          name: 'support',
          displayName: 'Customer Support',
          description: 'Help users, view data, limited changes',
          permissionNames: [
            'users:read',
            'users:update',
            'users:reset-password',
            'products:read',
            'logs:read',
          ],
        },
        {
          name: 'viewer',
          displayName: 'Read-only User',
          description: 'Can only view data',
          permissionNames: ['users:read', 'products:read', 'logs:read'],
        },
      ];

      const createdRoles: Role[] = [];

      for (const r of rolesData) {
        let role = await roleRepo.findOne({
          where: { name: r.name },
          relations: ['permissions'],
        });

        if (!role) {
          role = roleRepo.create({
            name: r.name,
            display_name: r.displayName,
            description: r.description,
          });
        }

        // Assign permissions
        role.permissions = createdPermissions.filter((p) =>
          r.permissionNames.includes(p.name),
        );

        await roleRepo.save(role);
        createdRoles.push(role);

        console.log(
          `→ Role '${r.name}' - ${role.permissions.length} permissions`,
        );
      }

      // ─────────────────────────────────────────────────────────────
      // 3. Create Super Admin user (if not exists)
      // ─────────────────────────────────────────────────────────────
      const superAdminEmail = 'filbert@alliance.co.tz';

      const existingAdmin = await userRepo.findOne({
        where: { email: superAdminEmail },
        relations: ['roles'],
      });

      if (!existingAdmin) {
        const password = 'Admin123!';
        const hashedPassword = await bcrypt.hash(password, 12);

        const adminUser = userRepo.create({
          user_no: 'ADM-00001',
          first_name: 'System',
          last_name: 'Administrator',
          phone: '+255700000001',
          email: superAdminEmail,
          password: hashedPassword,
          status: 'active',
          roles: [createdRoles.find((r) => r.name === 'super_admin')!],
        });

        await userRepo.save(adminUser);

        console.log(`
╔════════════════════════════════════════════════════════════╗
║                  SUPER ADMIN ACCOUNT CREATED               ║
║                                                            ║
║  Email:    ${superAdminEmail.padEnd(40)} ║
║  Password: ${password.padEnd(40)} ║
║                                                            ║
║          !!! CHANGE PASSWORD IMMEDIATELY !!!               ║
╚════════════════════════════════════════════════════════════╝
`);
      } else {
        console.log('→ Super admin already exists, skipping creation');
      }

      await queryRunner.commitTransaction();
      console.log('\n★ Initial RBAC seeding completed successfully ★\n');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Seeding failed:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
