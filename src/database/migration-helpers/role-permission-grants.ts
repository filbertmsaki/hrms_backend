import { QueryRunner } from 'typeorm';

export type MigrationPermissionDefinition = {
  name: string;
  displayName: string;
  description: string;
  scope?: 'company' | 'shared' | 'platform';
};

/**
 * Deployments run migrations only (seeds are run on fresh databases), so
 * permissions introduced after the initial seed must be inserted here for
 * existing environments. Existing rows are left untouched.
 */
export async function ensurePermissions(
  queryRunner: QueryRunner,
  permissions: MigrationPermissionDefinition[],
): Promise<void> {
  for (const permission of permissions) {
    await queryRunner.query(
      `
        INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
        SELECT $1::varchar, $2::varchar, $3::text, $4::varchar, true
        WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "name" = $1::varchar)
      `,
      [
        permission.name,
        permission.displayName,
        permission.description,
        permission.scope ?? 'company',
      ],
    );
  }
}

/**
 * Additively grants permissions to the system-generated company roles with
 * the given names in every company. Custom roles and custom grants are never
 * touched.
 */
export async function grantPermissionsToSystemRoles(
  queryRunner: QueryRunner,
  grants: Record<string, string[]>,
): Promise<void> {
  for (const [roleName, permissionNames] of Object.entries(grants)) {
    if (!permissionNames.length) continue;
    await queryRunner.query(
      `
        INSERT INTO "permission_role" ("rolesId", "permissionsId")
        SELECT role."id", permission."id"
        FROM "roles" role
        JOIN "permissions" permission ON permission."name" = ANY($2::varchar[])
        WHERE role."name" = $1
          AND role."company_id" IS NOT NULL
          AND role."is_system_generated" = true
        ON CONFLICT DO NOTHING
      `,
      [roleName, permissionNames],
    );
  }
}

export async function revokePermissionsFromSystemRoles(
  queryRunner: QueryRunner,
  grants: Record<string, string[]>,
): Promise<void> {
  for (const [roleName, permissionNames] of Object.entries(grants)) {
    if (!permissionNames.length) continue;
    await queryRunner.query(
      `
        DELETE FROM "permission_role" grant_row
        USING "roles" role, "permissions" permission
        WHERE grant_row."rolesId" = role."id"
          AND grant_row."permissionsId" = permission."id"
          AND role."name" = $1
          AND role."company_id" IS NOT NULL
          AND role."is_system_generated" = true
          AND permission."name" = ANY($2::varchar[])
      `,
      [roleName, permissionNames],
    );
  }
}

export async function removePermissions(
  queryRunner: QueryRunner,
  permissionNames: string[],
): Promise<void> {
  if (!permissionNames.length) return;
  await queryRunner.query(
    `
      DELETE FROM "permission_role"
      WHERE "permissionsId" IN (
        SELECT "id" FROM "permissions" WHERE "name" = ANY($1::varchar[])
      )
    `,
    [permissionNames],
  );
  await queryRunner.query(
    `DELETE FROM "permissions" WHERE "name" = ANY($1::varchar[])`,
    [permissionNames],
  );
}
