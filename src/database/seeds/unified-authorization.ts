import { EntityManager, In, IsNull } from 'typeorm';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import {
  PERMISSION_SEEDS,
  resolvePermissionScope,
} from './001-permissions.seed';
import { PLATFORM_ROLE_SEEDS } from './002-global-roles.seed';
import { COMPANY_ROLE_SEEDS } from './005-company-roles.seed';

/** Insert missing catalog entries and roles; never change an existing role or grant. */
export async function seedAuthorization(
  manager: EntityManager,
  companyId?: number,
): Promise<void> {
  const permissions = manager.getRepository(Permission);
  const values = PERMISSION_SEEDS.map((seed) => ({
    name: seed.name,
    display_name: seed.displayName,
    description: seed.description,
    scope: resolvePermissionScope(seed.name),
    is_system_generated: true,
  }));
  // PostgreSQL parameter limits require batching the large catalog.
  for (let i = 0; i < values.length; i += 500) {
    await permissions
      .createQueryBuilder()
      .insert()
      .into(Permission)
      .values(values.slice(i, i + 500))
      .orIgnore()
      .execute();
  }
  const roles = manager.getRepository(Role);
  const seeds = [
    ...PLATFORM_ROLE_SEEDS.map((seed) => ({
      seed,
      company: null as number | null,
    })),
    ...(companyId === undefined
      ? []
      : COMPANY_ROLE_SEEDS.map((seed) => ({
          seed,
          company: companyId as number | null,
        }))),
  ];
  const names = [...new Set(seeds.flatMap(({ seed }) => seed.permissionNames))];
  const catalog = await permissions.find({ where: { name: In(names) } });
  const byName = new Map(
    catalog.map((permission) => [permission.name, permission]),
  );
  for (const { seed, company } of seeds) {
    const existing = await roles.findOne({
      where: {
        name: seed.name,
        company_id: company === null ? IsNull() : company,
      },
    });
    if (existing) continue;
    const missing = seed.permissionNames.filter((name) => !byName.has(name));
    if (missing.length)
      throw new Error(
        `Role ${seed.name} references missing permissions: ${[...new Set(missing)].join(', ')}`,
      );
    const result = await roles
      .createQueryBuilder()
      .insert()
      .into(Role)
      .values({
        name: seed.name,
        company_id: company,
        display_name: seed.displayName,
        description: seed.description,
        is_system_generated: true,
      })
      .orIgnore()
      .returning(['id'])
      .execute();
    const rows = result.raw as Array<{ id: number }>;
    if (rows.length) {
      const ids = [
        ...new Set(seed.permissionNames.map((name) => byName.get(name)!.id)),
      ];
      if (ids.length)
        await roles
          .createQueryBuilder()
          .relation(Role, 'permissions')
          .of(rows[0].id)
          .add(ids);
    }
  }
}
