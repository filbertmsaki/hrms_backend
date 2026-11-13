import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { PermissionScope } from '../../modules/permissions/enums/permission-scope.enum';
import { Role } from '../../modules/roles/entities/role.entity';

const grants = {
  COMPANY_ADMIN: [
    'kpi_assignments:read',
    'kpi_assignments:create',
    'kpi_assignments:update',
    'kpi_targets:revise',
  ],
  HR_MANAGER: [
    'kpi_assignments:read',
    'kpi_assignments:create',
    'kpi_assignments:update',
    'kpi_targets:revise',
  ],
  DEPARTMENT_MANAGER: [
    'kpi_assignments:read',
    'kpi_assignments:create',
    'kpi_assignments:update',
    'kpi_targets:revise',
  ],
  BRANCH_MANAGER: [
    'kpi_assignments:read',
    'kpi_assignments:create',
    'kpi_assignments:update',
    'kpi_targets:revise',
  ],
  MANAGEMENT: ['kpi_assignments:read'],
} as const;
const catalog = [
  [
    'kpi_assignments:read',
    'View KPI assignments',
    'View KPI assignments within authorized scope',
  ],
  [
    'kpi_assignments:create',
    'Assign KPIs',
    'Assign published KPIs within authorized scope',
  ],
  [
    'kpi_assignments:update',
    'Manage KPI assignments',
    'Manage assignments within authorized scope',
  ],
  [
    'kpi_targets:revise',
    'Revise KPI targets',
    'Revise targets within authorized scope',
  ],
] as const;

async function main() {
  const options = AppDataSource.options;
  const host = 'host' in options ? String(options.host ?? '') : '';
  const database = 'database' in options ? String(options.database ?? '') : '';
  if (
    !['localhost', '127.0.0.1', '::1'].includes(host) ||
    !['hrms_db', 'hrms_kpi_dev_test'].includes(database)
  ) {
    throw new Error(
      'This permission registration is limited to the local HRMS databases',
    );
  }
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const permissionRepo = manager.getRepository(Permission);
      const roleRepo = manager.getRepository(Role);
      for (const [name, display_name, description] of catalog) {
        if (!(await permissionRepo.existsBy({ name })))
          await permissionRepo.insert({
            name,
            display_name,
            description,
            scope: PermissionScope.COMPANY,
            is_system_generated: true,
          });
      }
      const permissions = await permissionRepo.findBy({
        name: In(catalog.map(([name]) => name)),
      });
      const byName = new Map(
        permissions.map((permission) => [permission.name, permission]),
      );
      const roles = await roleRepo.find({
        where: { name: In(Object.keys(grants)) },
        relations: ['permissions'],
      });
      for (const role of roles) {
        if (!role.company_id) continue;
        const existing = new Set(
          role.permissions.map((permission) => permission.name),
        );
        const additions = grants[role.name as keyof typeof grants]
          .filter((name) => !existing.has(name))
          .map((name) => byName.get(name))
          .filter((permission): permission is Permission => !!permission);
        if (additions.length)
          await roleRepo.save({
            ...role,
            permissions: [...role.permissions, ...additions],
          });
      }
    });
    console.log(
      'Local KPI assignment permissions registered without changing users or KPI records.',
    );
  } finally {
    await AppDataSource.destroy();
  }
}
main().catch((error: unknown) => {
  console.error(
    'KPI assignment permission registration failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exit(1);
});
