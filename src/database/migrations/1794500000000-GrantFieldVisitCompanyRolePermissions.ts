import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add Field Visit access to company roles already assigned in existing tenants. */
export class GrantFieldVisitCompanyRolePermissions1794500000000 implements MigrationInterface {
  name = 'GrantFieldVisitCompanyRolePermissions1794500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const permissions = [
      'field_visits:self-service:read',
      'field_visits:self-service:update',
      'field_visits:manager:read',
      'field_visits:manager:review',
      'field_visits:config',
      'field_visits:hr:read',
      'field_locations:read',
    ];

    for (const name of permissions) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
         VALUES ($1, $2, $3, 'company', true)
         ON CONFLICT ("name") DO NOTHING`,
        [name, name, `Field Visit permission: ${name}`],
      );
    }

    const assignments: Record<string, string[]> = {
      EMPLOYEE: [
        'field_visits:self-service:read',
        'field_visits:self-service:update',
      ],
      HR_MANAGER: [
        'field_visits:self-service:read',
        'field_visits:self-service:update',
        'field_visits:manager:read',
        'field_visits:manager:review',
        'field_visits:config',
        'field_visits:hr:read',
        'field_locations:read',
      ],
      HR_OFFICER: [
        'field_visits:self-service:read',
        'field_visits:self-service:update',
        'field_visits:hr:read',
      ],
      DEPARTMENT_MANAGER: [
        'field_visits:self-service:read',
        'field_visits:self-service:update',
        'field_visits:manager:read',
        'field_visits:manager:review',
        'field_locations:read',
      ],
      BRANCH_MANAGER: [
        'field_visits:self-service:read',
        'field_visits:self-service:update',
        'field_visits:manager:read',
        'field_visits:manager:review',
        'field_locations:read',
      ],
      COMPANY_ADMIN: permissions,
    };

    for (const [roleName, rolePermissions] of Object.entries(assignments)) {
      await queryRunner.query(
        `INSERT INTO "permission_role" ("rolesId", "permissionsId")
         SELECT r."id", p."id"
         FROM "roles" r
         JOIN "permissions" p ON p."name" = ANY($2::text[])
         WHERE r."name" = $1 AND r."company_id" IS NOT NULL
         ON CONFLICT DO NOTHING`,
        [roleName, rolePermissions],
      );
    }
  }

  async down(): Promise<void> {
    // Preserve grants because permissions may have been deliberately assigned
    // after deployment; reverting an access grant could unexpectedly lock out users.
  }
}
