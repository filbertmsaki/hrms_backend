import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HR roles need the HR home dashboard (headcount and today present/absent/
 * leave cards). The company-roles seeder only creates missing roles, so
 * existing HR_MANAGER / HR_OFFICER roles in every company get the grant here.
 * Only adds permissions; never removes any.
 */
export class GrantHrDashboardPermissions1797900221000 implements MigrationInterface {
  name = 'GrantHrDashboardPermissions1797900221000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO "permission_role" ("rolesId", "permissionsId")
      SELECT role.id, permission.id
      FROM roles role
      CROSS JOIN permissions permission
      WHERE role.name IN ('HR_MANAGER', 'HR_OFFICER')
        AND permission.name IN ('dashboard:hr', 'analytics:dashboards-hr')
      ON CONFLICT ("rolesId", "permissionsId") DO NOTHING
    `);
  }

  async down(): Promise<void> {
    // Intentionally empty: some roles already had one of these permissions
    // before this migration, so removing them on revert could take away
    // access that was granted by hand.
  }
}
