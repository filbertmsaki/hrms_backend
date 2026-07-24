import { MigrationInterface, QueryRunner } from 'typeorm';

type PermissionSeed = {
  name: string;
  displayName: string;
  description: string;
};

const EMPLOYEE_IMPORT_PERMISSIONS: PermissionSeed[] = [
  {
    name: 'employees.import.template.download',
    displayName: 'Download employee import template',
    description: 'Allow downloading the employee Excel import template',
  },
  {
    name: 'employees.import.preview',
    displayName: 'Preview employee imports',
    description:
      'Allow uploading employee Excel files for validation preview before import',
  },
  {
    name: 'employees.import.execute',
    displayName: 'Execute employee imports',
    description: 'Allow confirming and executing employee Excel imports',
  },
  {
    name: 'employees.import.history.view',
    displayName: 'View employee import history',
    description: 'Allow viewing employee Excel import history and summaries',
  },
  {
    name: 'employees.import.result.download',
    displayName: 'Download employee import results',
    description: 'Allow downloading employee Excel import result workbooks',
  },
];

const COMPANY_ROLE_PERMISSION_BACKFILL: Record<string, string[]> = {
  COMPANY_ADMIN: EMPLOYEE_IMPORT_PERMISSIONS.map(
    (permission) => permission.name,
  ),
  HR_MANAGER: EMPLOYEE_IMPORT_PERMISSIONS.map((permission) => permission.name),
  HR_OFFICER: EMPLOYEE_IMPORT_PERMISSIONS.map((permission) => permission.name),
  AUDITOR: [
    'employees.import.history.view',
    'employees.import.result.download',
  ],
};

export class BackfillEmployeeImportPermissions1789002000000 implements MigrationInterface {
  name = 'BackfillEmployeeImportPermissions1789002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of EMPLOYEE_IMPORT_PERMISSIONS) {
      await queryRunner.query(
        `
          INSERT INTO "permissions" (
            "name",
            "display_name",
            "description",
            "is_system_generated",
            "created_at",
            "updated_at"
          )
          VALUES ($1, $2, $3, true, now(), now())
          ON CONFLICT ("name")
          DO UPDATE
          SET
            "display_name" = EXCLUDED."display_name",
            "description" = EXCLUDED."description",
            "is_system_generated" = true,
            "updated_at" = now()
        `,
        [permission.name, permission.displayName, permission.description],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(
      COMPANY_ROLE_PERMISSION_BACKFILL,
    )) {
      await queryRunner.query(
        `
          INSERT INTO "permission_role" ("rolesId", "permissionsId")
          SELECT DISTINCT role.id, permission.id
          FROM "roles" role
          INNER JOIN "permissions" permission
            ON permission."name" = ANY($2)
          WHERE role."name" = $1
            AND role."company_id" IS NOT NULL
          ON CONFLICT ("rolesId", "permissionsId") DO NOTHING
        `,
        [roleName, permissionNames],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const roleNames = Object.keys(COMPANY_ROLE_PERMISSION_BACKFILL);
    const permissionNames = EMPLOYEE_IMPORT_PERMISSIONS.map(
      (permission) => permission.name,
    );

    await queryRunner.query(
      `
        DELETE FROM "permission_role" pr
        USING "roles" role, "permissions" permission
        WHERE pr."rolesId" = role."id"
          AND pr."permissionsId" = permission."id"
          AND role."company_id" IS NOT NULL
          AND role."name" = ANY($1)
          AND permission."name" = ANY($2)
      `,
      [roleNames, permissionNames],
    );

    await queryRunner.query(
      `
        DELETE FROM "permissions" permission
        WHERE permission."name" = ANY($1)
          AND NOT EXISTS (
            SELECT 1
            FROM "permission_role" pr
            WHERE pr."permissionsId" = permission."id"
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "permission_user" pu
            WHERE pu."permissionsId" = permission."id"
          )
      `,
      [permissionNames],
    );
  }
}
