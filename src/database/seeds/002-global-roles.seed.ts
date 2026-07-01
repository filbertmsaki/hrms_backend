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

const GLOBAL_ROLE_SEEDS: RoleSeed[] = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Super Admin',
    description:
      'Full access to the entire platform. Can manage all companies, plans, users, settings, and data.',
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

      const allPermissionNames = GLOBAL_ROLE_SEEDS.flatMap(
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

      for (const seed of GLOBAL_ROLE_SEEDS) {
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
        `[Seeder][GlobalRoles] Upserted ${GLOBAL_ROLE_SEEDS.length} global role(s)`,
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
