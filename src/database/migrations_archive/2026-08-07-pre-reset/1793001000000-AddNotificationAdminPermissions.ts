import { MigrationInterface, QueryRunner } from 'typeorm';

type PermissionSeed = {
  name: string;
  displayName: string;
  description: string;
  scope: 'PLATFORM' | 'COMPANY' | 'SHARED';
};

const PERMISSIONS: readonly PermissionSeed[] = [
  {
    name: 'notifications:delivery-logs:read',
    displayName: 'Read notification delivery logs',
    description: 'Allow viewing queued notification delivery history.',
    scope: 'SHARED',
  },
  {
    name: 'notifications:mail-logs:read',
    displayName: 'Read notification mail logs',
    description: 'Allow viewing queued notification email history.',
    scope: 'SHARED',
  },
  {
    name: 'notifications:mail-logs:retry',
    displayName: 'Retry notification mail logs',
    description: 'Allow retrying failed queued notification emails.',
    scope: 'SHARED',
  },
  {
    name: 'notifications:settings:read',
    displayName: 'Read notification channel settings',
    description: 'Allow viewing email and in-app notification channel settings.',
    scope: 'SHARED',
  },
  {
    name: 'notifications:settings:update',
    displayName: 'Update notification channel settings',
    description: 'Allow updating email and in-app notification channel settings.',
    scope: 'SHARED',
  },
  {
    name: 'sms:settings:read',
    displayName: 'Read SMS settings',
    description: 'Allow viewing SMS global settings and registry configuration.',
    scope: 'SHARED',
  },
  {
    name: 'sms:settings:update',
    displayName: 'Update SMS settings',
    description: 'Allow updating SMS global settings and registry configuration.',
    scope: 'SHARED',
  },
  {
    name: 'sms:logs:read',
    displayName: 'Read SMS logs',
    description: 'Allow viewing SMS notification delivery history.',
    scope: 'SHARED',
  },
  {
    name: 'sms:logs:retry',
    displayName: 'Retry SMS logs',
    description: 'Allow retrying failed SMS notifications.',
    scope: 'SHARED',
  },
  {
    name: 'sms:test',
    displayName: 'Send test SMS',
    description: 'Allow sending administrator SMS tests.',
    scope: 'SHARED',
  },
] as const;

const ROLE_ASSIGNMENTS: Readonly<Record<string, readonly string[]>> = {
  SUPER_ADMIN: PERMISSIONS.map((permission) => permission.name),
  PLATFORM_ADMINISTRATOR: PERMISSIONS.map((permission) => permission.name),
  PLATFORM_SUPPORT: [
    'notifications:delivery-logs:read',
    'notifications:mail-logs:read',
    'notifications:mail-logs:retry',
    'notifications:settings:read',
    'sms:settings:read',
    'sms:logs:read',
    'sms:logs:retry',
    'sms:test',
  ],
  PLATFORM_AUDITOR: [
    'notifications:delivery-logs:read',
    'notifications:mail-logs:read',
    'notifications:settings:read',
    'sms:settings:read',
    'sms:logs:read',
  ],
  COMPANY_ADMIN: PERMISSIONS.map((permission) => permission.name),
  HR_MANAGER: [
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
} as const;

export class AddNotificationAdminPermissions1793001000000
  implements MigrationInterface
{
  name = 'AddNotificationAdminPermissions1793001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const permission of PERMISSIONS) {
      await queryRunner.query(
        `
          INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated", "created_at", "updated_at")
          VALUES ($1, $2, $3, $4, true, now(), now())
          ON CONFLICT ("name") DO UPDATE
          SET "display_name" = EXCLUDED."display_name",
              "description" = EXCLUDED."description",
              "scope" = EXCLUDED."scope",
              "is_system_generated" = true,
              "updated_at" = now()
        `,
        [
          permission.name,
          permission.displayName,
          permission.description,
          permission.scope,
        ],
      );
    }

    for (const [roleName, permissionNames] of Object.entries(ROLE_ASSIGNMENTS)) {
      await queryRunner.query(
        `
          INSERT INTO "permission_role" ("rolesId", "permissionsId")
          SELECT r.id, p.id
          FROM "roles" r
          JOIN "permissions" p ON p.name = ANY($2)
          WHERE r.name = $1
          ON CONFLICT DO NOTHING
        `,
        [roleName, permissionNames],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const permissionNames = PERMISSIONS.map((permission) => permission.name);

    await queryRunner.query(
      `
        DELETE FROM "permission_role" pr
        USING "permissions" p
        WHERE pr."permissionsId" = p.id
          AND p.name = ANY($1)
      `,
      [permissionNames],
    );

    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" = ANY($1)`,
      [permissionNames],
    );
  }
}
