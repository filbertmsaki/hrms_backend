import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSIONS: Array<[string, string, string]> = [
  [
    'payroll:runs:cancel',
    'Cancel payroll runs',
    'Cancel payroll runs that have no financial effects yet (before lock)',
  ],
  [
    'payroll:runs:reverse',
    'Reverse payroll runs',
    'Reverse locked or paid payroll runs through compensating entries',
  ],
  [
    'payroll:payments:confirm',
    'Confirm payroll payments',
    'Confirm salary payments for a payroll run',
  ],
  [
    'payroll:runs:close',
    'Close payroll runs',
    'Close a paid payroll run and its period',
  ],
];

/**
 * mark-paid and close used to reuse payroll:runs:lock. Each lifecycle action
 * now has its own permission. Roles that held payroll:runs:lock receive the
 * new permissions so nobody loses access; admins can then narrow them.
 */
export class SplitPayrollRunLifecyclePermissions1797900041000 implements MigrationInterface {
  name = 'SplitPayrollRunLifecyclePermissions1797900041000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, displayName, description] of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
         VALUES ($1, $2, $3, 'company', true)
         ON CONFLICT ("name") DO NOTHING`,
        [name, displayName, description],
      );
      await queryRunner.query(
        `INSERT INTO "permission_role" ("rolesId", "permissionsId")
         SELECT DISTINCT grant_row."rolesId", permission."id"
         FROM "permission_role" grant_row
         JOIN "permissions" lock_permission
           ON lock_permission."id" = grant_row."permissionsId"
          AND lock_permission."name" = 'payroll:runs:lock'
         JOIN "permissions" permission ON permission."name" = $1
         ON CONFLICT DO NOTHING`,
        [name],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const names = PERMISSIONS.map(([name]) => name);
    await queryRunner.query(
      `DELETE FROM "permission_role"
       WHERE "permissionsId" IN (SELECT "id" FROM "permissions" WHERE "name" = ANY($1))`,
      [names],
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" = ANY($1)`,
      [names],
    );
  }
}
