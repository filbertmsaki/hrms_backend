import { MigrationInterface, QueryRunner } from 'typeorm';

const PLATFORM_PERMISSION_NAMES = [
  'create_company',
  'view_companies',
  'update_company',
  'delete_company',
  'create_company_admin',
  'companies:create',
  'companies:update',
  'companies:delete',
  'permissions:create',
  'permissions:update',
  'permissions:delete',
];

const SHARED_PERMISSION_NAMES = [
  'companies:read',
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'roles:assign-permission',
  'roles:revoke-permission',
  'permissions:read',
];

export class AddPermissionScopes1789006000000 implements MigrationInterface {
  name = 'AddPermissionScopes1789006000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "permissions"
      ADD COLUMN IF NOT EXISTS "scope" character varying(20) NOT NULL DEFAULT 'company'
    `);

    await queryRunner.query(
      `
        UPDATE "permissions"
        SET "scope" = 'platform'
        WHERE "name" = ANY($1)
      `,
      [PLATFORM_PERMISSION_NAMES],
    );

    await queryRunner.query(
      `
        UPDATE "permissions"
        SET "scope" = 'shared'
        WHERE "name" = ANY($1)
      `,
      [SHARED_PERMISSION_NAMES],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "permissions"
      DROP COLUMN IF EXISTS "scope"
    `);
  }
}
