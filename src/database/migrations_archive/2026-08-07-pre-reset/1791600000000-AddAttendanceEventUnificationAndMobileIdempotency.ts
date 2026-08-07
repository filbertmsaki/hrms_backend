import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceEventUnificationAndMobileIdempotency1791600000000 implements MigrationInterface {
  name = 'AddAttendanceEventUnificationAndMobileIdempotency1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'BREAK_OUT'
            AND enumtypid = 'attendance_processed_events_direction_enum'::regtype
        ) THEN
          ALTER TYPE "public"."attendance_processed_events_direction_enum"
          ADD VALUE 'BREAK_OUT' AFTER 'OUT';
        END IF;
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'BREAK_IN'
            AND enumtypid = 'attendance_processed_events_direction_enum'::regtype
        ) THEN
          ALTER TYPE "public"."attendance_processed_events_direction_enum"
          ADD VALUE 'BREAK_IN' AFTER 'BREAK_OUT';
        END IF;
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'attendance_processed_events_source_enum'
        ) THEN
          CREATE TYPE "public"."attendance_processed_events_source_enum"
          AS ENUM ('HIKVISION', 'MOBILE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      DROP CONSTRAINT IF EXISTS "FK_a48f8de7e1d15b7981422e2060e"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ALTER COLUMN "raw_log_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ADD COLUMN IF NOT EXISTS "source" "public"."attendance_processed_events_source_enum" DEFAULT 'HIKVISION',
      ADD COLUMN IF NOT EXISTS "source_id" integer,
      ADD COLUMN IF NOT EXISTS "source_key" character varying(200),
      ADD COLUMN IF NOT EXISTS "mobile_punch_id" integer,
      ADD COLUMN IF NOT EXISTS "payload_hash" character varying(128),
      ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "processing_version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      UPDATE "attendance_processed_events"
      SET
        "source" = COALESCE("source", 'HIKVISION'::"public"."attendance_processed_events_source_enum"),
        "source_id" = COALESCE("source_id", "raw_log_id"),
        "source_key" = COALESCE("source_key", CONCAT('HIKVISION:', "raw_log_id")),
        "payload_hash" = COALESCE("payload_hash", md5(COALESCE("raw_payload_snapshot"::text, '{}'))),
        "received_at" = COALESCE("received_at", "created_at"),
        "processing_version" = COALESCE("processing_version", 1)
      WHERE "raw_log_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ALTER COLUMN "source" SET NOT NULL,
      ALTER COLUMN "source_id" SET NOT NULL,
      ALTER COLUMN "source_key" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      DROP CONSTRAINT IF EXISTS "UQ_attendance_processed_events_raw_log_id"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendance_processed_event_source_key"
      ON "attendance_processed_events" ("source_key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_processed_event_source"
      ON "attendance_processed_events" ("source", "source_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ADD CONSTRAINT "FK_a48f8de7e1d15b7981422e2060e"
      FOREIGN KEY ("raw_log_id")
      REFERENCES "hikvision_attendance_logs"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ADD CONSTRAINT "FK_attendance_processed_events_mobile_punch_id"
      FOREIGN KEY ("mobile_punch_id")
      REFERENCES "attendance_mobile_punches"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      ADD COLUMN IF NOT EXISTS "client_request_id" uuid,
      ADD COLUMN IF NOT EXISTS "client_captured_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "payload_hash" character varying(128),
      ADD COLUMN IF NOT EXISTS "processing_attempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_processing_error" text
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      ALTER COLUMN "geofence_validation_result" TYPE jsonb USING "geofence_validation_result"::jsonb,
      ALTER COLUMN "wifi_validation_result" TYPE jsonb USING "wifi_validation_result"::jsonb,
      ALTER COLUMN "device_info" TYPE jsonb USING "device_info"::jsonb,
      ALTER COLUMN "raw_payload" TYPE jsonb USING "raw_payload"::jsonb
    `);

    await queryRunner.query(`
      UPDATE "attendance_mobile_punches"
      SET
        "client_request_id" = COALESCE("client_request_id", gen_random_uuid()),
        "received_at" = COALESCE("received_at", "created_at"),
        "payload_hash" = COALESCE("payload_hash", md5(COALESCE("raw_payload"::text, '{}'))),
        "processing_attempts" = COALESCE("processing_attempts", 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      ALTER COLUMN "client_request_id" SET NOT NULL,
      ALTER COLUMN "payload_hash" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      ADD CONSTRAINT "UQ_attendance_mobile_punch_client_request"
      UNIQUE ("company_id", "employee_id", "client_request_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "hikvision_attendance_logs"
      ADD COLUMN IF NOT EXISTS "payload_hash" character varying(128),
      ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "source_timezone" character varying(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "hikvision_attendance_logs"
      ALTER COLUMN "raw_payload" TYPE jsonb USING "raw_payload"::jsonb
    `);

    await queryRunner.query(`
      UPDATE "hikvision_attendance_logs"
      SET
        "payload_hash" = COALESCE("payload_hash", md5(COALESCE("raw_payload"::text, '{}'))),
        "received_at" = COALESCE("received_at", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      DROP CONSTRAINT IF EXISTS "FK_attendance_processed_events_mobile_punch_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      DROP CONSTRAINT IF EXISTS "FK_a48f8de7e1d15b7981422e2060e"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_attendance_processed_event_source"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."UQ_attendance_processed_event_source_key"
    `);

    await queryRunner.query(`
      DELETE FROM "attendance_processed_events"
      WHERE "source" = 'MOBILE'::"public"."attendance_processed_events_source_enum"
    `);

    await queryRunner.query(`
      UPDATE "attendance_processed_events"
      SET "raw_log_id" = COALESCE("raw_log_id", "source_id")
      WHERE "source" = 'HIKVISION'::"public"."attendance_processed_events_source_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      DROP COLUMN IF EXISTS "processing_version",
      DROP COLUMN IF EXISTS "received_at",
      DROP COLUMN IF EXISTS "payload_hash",
      DROP COLUMN IF EXISTS "mobile_punch_id",
      DROP COLUMN IF EXISTS "source_key",
      DROP COLUMN IF EXISTS "source_id",
      DROP COLUMN IF EXISTS "source"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ALTER COLUMN "raw_log_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ADD CONSTRAINT "UQ_attendance_processed_events_raw_log_id"
      UNIQUE ("raw_log_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_processed_events"
      ADD CONSTRAINT "FK_a48f8de7e1d15b7981422e2060e"
      FOREIGN KEY ("raw_log_id")
      REFERENCES "hikvision_attendance_logs"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."attendance_processed_events_source_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      DROP CONSTRAINT IF EXISTS "UQ_attendance_mobile_punch_client_request"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      DROP COLUMN IF EXISTS "last_processing_error",
      DROP COLUMN IF EXISTS "processing_attempts",
      DROP COLUMN IF EXISTS "payload_hash",
      DROP COLUMN IF EXISTS "received_at",
      DROP COLUMN IF EXISTS "client_captured_at",
      DROP COLUMN IF EXISTS "client_request_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_mobile_punches"
      ALTER COLUMN "geofence_validation_result" TYPE json USING "geofence_validation_result"::json,
      ALTER COLUMN "wifi_validation_result" TYPE json USING "wifi_validation_result"::json,
      ALTER COLUMN "device_info" TYPE json USING "device_info"::json,
      ALTER COLUMN "raw_payload" TYPE json USING "raw_payload"::json
    `);

    await queryRunner.query(`
      ALTER TABLE "hikvision_attendance_logs"
      DROP COLUMN IF EXISTS "source_timezone",
      DROP COLUMN IF EXISTS "received_at",
      DROP COLUMN IF EXISTS "payload_hash"
    `);

    await queryRunner.query(`
      ALTER TABLE "hikvision_attendance_logs"
      ALTER COLUMN "raw_payload" TYPE json USING "raw_payload"::json
    `);
  }
}
