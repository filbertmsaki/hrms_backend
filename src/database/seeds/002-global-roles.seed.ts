import { DataSource, IsNull, In } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';

type RoleSeed = {
  name: string;
  displayName: string;
  description: string;
  permissionNames: string[];
};

const PLATFORM_ROLE_SEEDS: RoleSeed[] = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Platform Super Admin',
    description:
      'Full access to platform administration, tenant provisioning, permissions, and scoped RBAC management.',
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
      'notifications:delivery-logs:read',
      'notifications:mail-logs:read',
      'notifications:mail-logs:retry',
      'notifications:settings:read',
      'notifications:settings:update',
      'sms:settings:read',
      'sms:settings:update',
      'sms:logs:read',
      'sms:logs:retry',
      'sms:test',
    ],
  },
  {
    name: 'PLATFORM_ADMINISTRATOR',
    displayName: 'Platform Administrator',
    description:
      'Manages tenant provisioning and platform-wide RBAC visibility without destructive permission mutation.',
    permissionNames: [
      'create_company',
      'view_companies',
      'update_company',
      'create_company_admin',
      'companies:create',
      'companies:read',
      'companies:update',
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'roles:assign-permission',
      'roles:revoke-permission',
      'permissions:read',
      'notifications:delivery-logs:read',
      'notifications:mail-logs:read',
      'notifications:mail-logs:retry',
      'notifications:settings:read',
      'notifications:settings:update',
      'sms:settings:read',
      'sms:settings:update',
      'sms:logs:read',
      'sms:logs:retry',
      'sms:test',
    ],
  },
  {
    name: 'PLATFORM_SUPPORT',
    displayName: 'Platform Support',
    description:
      'Handles tenant support and troubleshooting with read access plus limited company status maintenance.',
    permissionNames: [
      'view_companies',
      'companies:read',
      'companies:update',
      'roles:read',
      'permissions:read',
      'notifications:delivery-logs:read',
      'notifications:mail-logs:read',
      'notifications:mail-logs:retry',
      'notifications:settings:read',
      'sms:settings:read',
      'sms:logs:read',
      'sms:logs:retry',
      'sms:test',
    ],
  },
  {
    name: 'PLATFORM_AUDITOR',
    displayName: 'Platform Auditor',
    description:
      'Read-only visibility into platform companies, roles, and permissions for governance and audit work.',
    permissionNames: [
      'view_companies',
      'companies:read',
      'roles:read',
      'permissions:read',
      'notifications:delivery-logs:read',
      'notifications:mail-logs:read',
      'notifications:settings:read',
      'sms:settings:read',
      'sms:logs:read',
    ],
  },
];

export default class GlobalRolesSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const roleRepo = qr.manager.getRepository(Role);
      const permissionRepo = qr.manager.getRepository(Permission);

      const allPermissionNames = PLATFORM_ROLE_SEEDS.flatMap(
        (r) => r.permissionNames,
      );
      const permissions = await permissionRepo.find({
        where: { name: In(allPermissionNames) },
      });
      const permissionMap = new Map(permissions.map((p) => [p.name, p]));

      // Rename legacy OWNER role to SUPER_ADMIN if it still exists
      const legacyOwner = await roleRepo.findOne({
        where: { name: 'OWNER', company_id: IsNull() },
      });
      if (legacyOwner) {
        await roleRepo.delete(legacyOwner.id);
      }

      for (const seed of PLATFORM_ROLE_SEEDS) {
        let role = await roleRepo.findOne({
          where: { name: seed.name, company_id: IsNull() },
          relations: ['permissions'],
        });

        if (!role) {
          role = roleRepo.create({
            name: seed.name,
            display_name: seed.displayName,
            description: seed.description,
            company_id: null,
            is_system_generated: true,
          });
        } else {
          role.display_name = seed.displayName;
          role.description = seed.description;
          role.is_system_generated = true;
        }

        role.permissions = seed.permissionNames
          .map((name) => permissionMap.get(name))
          .filter((p): p is Permission => p !== undefined);

        await roleRepo.save(role);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][GlobalRoles] Upserted ${PLATFORM_ROLE_SEEDS.length} platform role(s)`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][GlobalRoles] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
