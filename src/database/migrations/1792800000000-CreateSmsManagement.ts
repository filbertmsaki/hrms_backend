import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSmsManagement1792800000000 implements MigrationInterface {
  name = 'CreateSmsManagement1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sms_global_settings" (
        "id" SERIAL NOT NULL,
        "key" character varying(80) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT false,
        "description" text,
        "updated_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sms_global_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sms_global_setting_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sms_notification_registry" (
        "id" SERIAL NOT NULL,
        "code" character varying(120) NOT NULL,
        "name" character varying(160) NOT NULL,
        "module" character varying(80) NOT NULL,
        "description" text,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "sms_template" text NOT NULL,
        "created_by_company_user_id" integer,
        "updated_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sms_notification_registry" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sms_notification_registry_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sms_notification_registry_module"
      ON "sms_notification_registry" ("module")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."sms_notification_logs_status_enum" AS ENUM(
        'PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sms_notification_logs" (
        "id" SERIAL NOT NULL,
        "registry_id" integer,
        "notification_code" character varying(120),
        "notification_name" character varying(160),
        "module" character varying(80) NOT NULL,
        "recipient_phone" character varying(20) NOT NULL,
        "recipient_company_user_id" integer,
        "recipient_employee_id" integer,
        "message" text NOT NULL,
        "template_snapshot" text,
        "related_entity_type" character varying(100),
        "related_entity_id" character varying(120),
        "status" "public"."sms_notification_logs_status_enum" NOT NULL DEFAULT 'PENDING',
        "provider_reference" character varying(120),
        "provider_response_code" character varying(40),
        "provider_response" text,
        "error_message" text,
        "sent_at" timestamptz,
        "retry_of_log_id" integer,
        "created_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sms_notification_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sms_notification_logs_status_created"
      ON "sms_notification_logs" ("status", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sms_notification_logs_code_created"
      ON "sms_notification_logs" ("notification_code", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_notification_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sms_notification_logs_status_enum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sms_notification_registry_module"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_notification_registry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_global_settings"`);
  }
}
