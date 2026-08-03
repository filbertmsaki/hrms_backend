import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeImportQueueingAndSecurity1791400000000
  implements MigrationInterface
{
  name = 'AddEmployeeImportQueueingAndSecurity1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'QUEUED'
            AND enumtypid = 'employee_import_batches_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."employee_import_batches_status_enum"
          ADD VALUE 'QUEUED' AFTER 'PREVIEW_READY';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'CANCELLED'
            AND enumtypid = 'employee_import_batches_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."employee_import_batches_status_enum"
          ADD VALUE 'CANCELLED' AFTER 'FAILED';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'QUEUED'
            AND enumtypid = 'employee_import_rows_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."employee_import_rows_status_enum"
          ADD VALUE 'QUEUED' AFTER 'INVALID';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'PROCESSING'
            AND enumtypid = 'employee_import_rows_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."employee_import_rows_status_enum"
          ADD VALUE 'PROCESSING' AFTER 'QUEUED';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'CANCELLED'
            AND enumtypid = 'employee_import_rows_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."employee_import_rows_status_enum"
          ADD VALUE 'CANCELLED' AFTER 'SKIPPED';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_import_batches"
      ADD COLUMN IF NOT EXISTS "schema_version" varchar(20) NOT NULL DEFAULT '2.0',
      ADD COLUMN IF NOT EXISTS "preview_token_hash" varchar(128),
      ADD COLUMN IF NOT EXISTS "idempotency_key_hash" varchar(128),
      ADD COLUMN IF NOT EXISTS "source_file_path" text,
      ADD COLUMN IF NOT EXISTS "source_mime_type" varchar(150),
      ADD COLUMN IF NOT EXISTS "result_file_path" text,
      ADD COLUMN IF NOT EXISTS "result_file_checksum" varchar(128),
      ADD COLUMN IF NOT EXISTS "confirmed_by_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "confirmed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "queued_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "worker_id" varchar(150),
      ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancel_requested" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "redacted_at" timestamptz
    `);

    await queryRunner.query(`
      UPDATE "employee_import_batches"
      SET "preview_token_hash" = encode(digest("preview_token", 'sha256'), 'hex')
      WHERE "preview_token_hash" IS NULL
        AND "preview_token" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_import_batches"
      ALTER COLUMN "preview_token_hash" SET NOT NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_employee_import_batches_preview_token"
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_import_batch_company_idempotency"
      ON "employee_import_batches" ("company_id", "idempotency_key_hash")
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      ADD COLUMN IF NOT EXISTS "row_key" varchar(128),
      ADD COLUMN IF NOT EXISTS "error_code" varchar(100),
      ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "started_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "processed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "last_error_at" timestamptz
    `);

    await queryRunner.query(`
      UPDATE "employee_import_rows"
      SET "row_key" = encode(
        digest(concat("batch_id", ':', "row_number"), 'sha256'),
        'hex'
      )
      WHERE "row_key" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      ALTER COLUMN "row_key" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employee_import_batch_row"
      ON "employee_import_rows" ("batch_id", "row_number")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_import_outbox_events" (
        "id" SERIAL NOT NULL,
        "event_id" uuid NOT NULL,
        "company_id" integer NOT NULL,
        "batch_id" integer NOT NULL,
        "event_type" varchar(100) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "available_at" timestamptz NOT NULL DEFAULT now(),
        "published_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_import_outbox_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_import_outbox_event_id" UNIQUE ("event_id"),
        CONSTRAINT "FK_employee_import_outbox_batch"
          FOREIGN KEY ("batch_id")
          REFERENCES "employee_import_batches"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_import_outbox_pending"
      ON "employee_import_outbox_events" ("status", "available_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "must_set_password" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "activated_at" timestamp,
      ADD COLUMN IF NOT EXISTS "account_provisioning_status" varchar(30) NOT NULL DEFAULT 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "account_provisioning_status",
      DROP COLUMN IF EXISTS "activated_at",
      DROP COLUMN IF EXISTS "must_set_password"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_employee_import_outbox_pending"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_import_outbox_events"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."UQ_employee_import_batch_row"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_rows"
      DROP COLUMN IF EXISTS "last_error_at",
      DROP COLUMN IF EXISTS "processed_at",
      DROP COLUMN IF EXISTS "started_at",
      DROP COLUMN IF EXISTS "attempt_count",
      DROP COLUMN IF EXISTS "error_code",
      DROP COLUMN IF EXISTS "row_key"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_employee_import_batch_company_idempotency"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_import_batches"
      DROP COLUMN IF EXISTS "redacted_at",
      DROP COLUMN IF EXISTS "cancel_requested",
      DROP COLUMN IF EXISTS "attempt_count",
      DROP COLUMN IF EXISTS "worker_id",
      DROP COLUMN IF EXISTS "last_heartbeat_at",
      DROP COLUMN IF EXISTS "queued_at",
      DROP COLUMN IF EXISTS "confirmed_at",
      DROP COLUMN IF EXISTS "confirmed_by_company_user_id",
      DROP COLUMN IF EXISTS "result_file_checksum",
      DROP COLUMN IF EXISTS "result_file_path",
      DROP COLUMN IF EXISTS "source_mime_type",
      DROP COLUMN IF EXISTS "source_file_path",
      DROP COLUMN IF EXISTS "idempotency_key_hash",
      DROP COLUMN IF EXISTS "preview_token_hash",
      DROP COLUMN IF EXISTS "schema_version"
    `);
  }
}
