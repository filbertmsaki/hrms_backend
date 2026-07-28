import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_AVATAR_PERMISSIONS = [
  {
    name: 'default_avatars:read',
    displayName: 'Read default avatars',
    description: 'Allow viewing the company default avatar library',
  },
  {
    name: 'default_avatars:create',
    displayName: 'Create default avatars',
    description: 'Allow adding new default avatar templates',
  },
  {
    name: 'default_avatars:update',
    displayName: 'Update default avatars',
    description: 'Allow updating default avatar metadata and defaults',
  },
  {
    name: 'default_avatars:delete',
    displayName: 'Delete default avatars',
    description: 'Allow deleting default avatar templates that are not in use',
  },
] as const;

const DEFAULT_AVATAR_ROLE_BACKFILL: Record<string, string[]> = {
  COMPANY_ADMIN: DEFAULT_AVATAR_PERMISSIONS.map(
    (permission) => permission.name,
  ),
  HR_MANAGER: DEFAULT_AVATAR_PERMISSIONS.map((permission) => permission.name),
  HR_OFFICER: ['default_avatars:read', 'default_avatars:update'],
};

export class CreateDefaultAvatars1789003000000 implements MigrationInterface {
  name = 'CreateDefaultAvatars1789003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "default_avatars_gender_category_enum" AS ENUM ('male', 'female', 'neutral')`,
    );
    await queryRunner.query(
      `CREATE TYPE "default_avatars_status_enum" AS ENUM ('active', 'inactive')`,
    );
    await queryRunner.query(
      `CREATE TYPE "employees_profile_image_source_enum" AS ENUM ('uploaded', 'default_avatar')`,
    );

    await queryRunner.query(`
      CREATE TABLE "default_avatars" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "avatar_name" character varying(120) NOT NULL,
        "image_path" text NOT NULL,
        "gender_category" "default_avatars_gender_category_enum" NOT NULL DEFAULT 'neutral',
        "status" "default_avatars_status_enum" NOT NULL DEFAULT 'active',
        "display_order" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_default_avatars_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_default_avatars_company_id" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_default_avatars_company_status_order"
      ON "default_avatars" ("company_id", "status", "display_order")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_default_avatars_company_gender_status"
      ON "default_avatars" ("company_id", "gender_category", "status")
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN "profile_image_source" "employees_profile_image_source_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN "default_avatar_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employees_default_avatar_id"
      FOREIGN KEY ("default_avatar_id")
      REFERENCES "default_avatars"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_employees_default_avatar_id"
      ON "employees" ("default_avatar_id")
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "profile_image_source" = 'uploaded'
      WHERE "profile_photo_url" IS NOT NULL
        AND BTRIM("profile_photo_url") <> ''
    `);

    for (const permission of DEFAULT_AVATAR_PERMISSIONS) {
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
      DEFAULT_AVATAR_ROLE_BACKFILL,
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
    const roleNames = Object.keys(DEFAULT_AVATAR_ROLE_BACKFILL);
    const permissionNames = DEFAULT_AVATAR_PERMISSIONS.map(
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

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_employees_default_avatar_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "FK_employees_default_avatar_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "default_avatar_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "profile_image_source"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_default_avatars_company_gender_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_default_avatars_company_status_order"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "default_avatars"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "employees_profile_image_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "default_avatars_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "default_avatars_gender_category_enum"`,
    );
  }
}
