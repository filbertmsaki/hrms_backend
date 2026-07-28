import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

type PermissionSeed = {
  name: string;
  displayName: string;
  description: string;
};

const SECRET_PREFIX = 'enc:2fa:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const TWO_FACTOR_PERMISSIONS: PermissionSeed[] = [
  {
    name: 'users:manage-2fa',
    displayName: 'Manage user 2FA',
    description:
      'Allow administrators to enable or disable two-factor authentication for company users',
  },
  {
    name: 'users:enable-2fa',
    displayName: 'Enable user 2FA',
    description:
      'Allow administrators to enable two-factor authentication for company users',
  },
  {
    name: 'users:disable-2fa',
    displayName: 'Disable user 2FA',
    description:
      'Allow administrators to disable two-factor authentication for company users',
  },
];

const COMPANY_ROLE_PERMISSION_BACKFILL: Record<string, string[]> = {
  COMPANY_ADMIN: ['users:manage-2fa'],
};

function getSecretKey(): Buffer {
  const raw =
    process.env.TWO_FACTOR_SECRET_KEY ||
    process.env.APP_KEY ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_RESET_SECRET ||
    '';

  const fallback = raw || 'development-only-2fa-secret-change-this-value';

  return createHash('sha256').update(fallback).digest();
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );

  return Buffer.from(padded, 'base64');
}

function isEncryptedTwoFactorSecret(value?: string | null): boolean {
  return Boolean(value?.startsWith(SECRET_PREFIX));
}

function encryptTwoFactorSecret(value?: string | null): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (isEncryptedTwoFactorSecret(normalized)) {
    return normalized;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    toBase64Url(iv),
    '.',
    toBase64Url(authTag),
    '.',
    toBase64Url(encrypted),
  ].join('');
}

function decryptTwoFactorSecret(value?: string | null): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (!isEncryptedTwoFactorSecret(normalized)) {
    return normalized;
  }

  const payload = normalized.slice(SECRET_PREFIX.length);
  const [ivPart, authTagPart, encryptedPart] = payload.split('.');

  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error('Invalid encrypted 2FA secret format.');
  }

  const iv = fromBase64Url(ivPart);
  const authTag = fromBase64Url(authTagPart);
  const encrypted = fromBase64Url(encryptedPart);

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted 2FA secret payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

export class AddAdminManagedUserTwoFactorControls1789004000000 implements MigrationInterface {
  name = 'AddAdminManagedUserTwoFactorControls1789004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "two_factor_setup_required" boolean NOT NULL DEFAULT false,
      ADD COLUMN "two_factor_enabled_at" TIMESTAMP,
      ADD COLUMN "two_factor_enabled_by" integer,
      ADD COLUMN "two_factor_disabled_at" TIMESTAMP,
      ADD COLUMN "two_factor_disabled_by" integer,
      ADD COLUMN "two_factor_disabled_reason" text,
      ADD COLUMN "auth_token_invalid_before" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_two_factor_enabled_by"
      FOREIGN KEY ("two_factor_enabled_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_two_factor_disabled_by"
      FOREIGN KEY ("two_factor_disabled_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "user_two_factor_audit_logs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "target_user_id" integer NOT NULL,
        "target_user_email" character varying(100) NOT NULL,
        "previous_status" boolean NOT NULL,
        "new_status" boolean NOT NULL,
        "action" character varying(120) NOT NULL,
        "actor_company_user_id" integer,
        "actor_user_id" integer,
        "ip_address" character varying(45),
        "user_agent" text,
        "disable_reason" text,
        "payload" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_two_factor_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "user_two_factor_audit_logs"
      ADD CONSTRAINT "FK_user_2fa_audit_target_user"
      FOREIGN KEY ("target_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "user_two_factor_audit_logs"
      ADD CONSTRAINT "FK_user_2fa_audit_actor_company_user"
      FOREIGN KEY ("actor_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_2fa_audit_company"
      ON "user_two_factor_audit_logs" ("company_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_2fa_audit_target_user"
      ON "user_two_factor_audit_logs" ("target_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_user_2fa_audit_action"
      ON "user_two_factor_audit_logs" ("action")
    `);

    const existingSecrets = (await queryRunner.query(`
      SELECT "id", "two_factor_secret"
      FROM "users"
      WHERE "two_factor_secret" IS NOT NULL
    `)) as Array<{ id: number; two_factor_secret: string | null }>;

    for (const row of existingSecrets) {
      const encryptedSecret = encryptTwoFactorSecret(row.two_factor_secret);
      await queryRunner.query(
        `
          UPDATE "users"
          SET "two_factor_secret" = $2
          WHERE "id" = $1
        `,
        [row.id, encryptedSecret],
      );
    }

    await queryRunner.query(`
      UPDATE "users"
      SET "two_factor_setup_required" = true
      WHERE "is_two_factor_enabled" = true
        AND ("two_factor_secret" IS NULL OR btrim("two_factor_secret") = '')
    `);

    for (const permission of TWO_FACTOR_PERMISSIONS) {
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
    const encryptedSecrets = (await queryRunner.query(`
      SELECT "id", "two_factor_secret"
      FROM "users"
      WHERE "two_factor_secret" IS NOT NULL
    `)) as Array<{ id: number; two_factor_secret: string | null }>;

    for (const row of encryptedSecrets) {
      const decryptedSecret = decryptTwoFactorSecret(row.two_factor_secret);
      await queryRunner.query(
        `
          UPDATE "users"
          SET "two_factor_secret" = $2
          WHERE "id" = $1
        `,
        [row.id, decryptedSecret],
      );
    }

    const roleNames = Object.keys(COMPANY_ROLE_PERMISSION_BACKFILL);
    const permissionNames = TWO_FACTOR_PERMISSIONS.map(
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

    await queryRunner.query(`DROP INDEX "public"."IDX_user_2fa_audit_action"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_2fa_audit_target_user"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_2fa_audit_company"`);

    await queryRunner.query(`
      ALTER TABLE "user_two_factor_audit_logs"
      DROP CONSTRAINT "FK_user_2fa_audit_actor_company_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "user_two_factor_audit_logs"
      DROP CONSTRAINT "FK_user_2fa_audit_target_user"
    `);

    await queryRunner.query(`DROP TABLE "user_two_factor_audit_logs"`);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "FK_users_two_factor_disabled_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT "FK_users_two_factor_enabled_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "auth_token_invalid_before",
      DROP COLUMN "two_factor_disabled_reason",
      DROP COLUMN "two_factor_disabled_by",
      DROP COLUMN "two_factor_disabled_at",
      DROP COLUMN "two_factor_enabled_by",
      DROP COLUMN "two_factor_enabled_at",
      DROP COLUMN "two_factor_setup_required"
    `);
  }
}
