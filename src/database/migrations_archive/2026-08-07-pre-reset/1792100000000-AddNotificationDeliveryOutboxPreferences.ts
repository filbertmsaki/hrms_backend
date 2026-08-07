import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationDeliveryOutboxPreferences1792100000000 implements MigrationInterface {
  name = 'AddNotificationDeliveryOutboxPreferences1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN "event_key" character varying(120),
      ADD COLUMN "template_code" character varying(80),
      ADD COLUMN "is_mandatory" boolean NOT NULL DEFAULT false,
      ADD COLUMN "payload" jsonb
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notifications_dedupe_key"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notifications_dedupe_active"
      ON "notifications" ("company_id", "receiver_company_user_id", "dedupe_key")
      WHERE "dedupe_key" IS NOT NULL AND "archived_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_dedupe_key" ON "notifications" ("dedupe_key")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_deliveries" (
        "id" SERIAL NOT NULL,
        "notification_id" integer NOT NULL,
        "channel" character varying(20) NOT NULL,
        "status" character varying(30) NOT NULL DEFAULT 'PENDING',
        "recipient_address" character varying(320),
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_attempt_at" timestamptz,
        "next_retry_at" timestamptz,
        "delivered_at" timestamptz,
        "provider_message_id" character varying(255),
        "last_error" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_delivery_channel" UNIQUE ("notification_id", "channel"),
        CONSTRAINT "FK_notification_deliveries_notification" FOREIGN KEY ("notification_id")
          REFERENCES "notifications"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_delivery_status_retry"
      ON "notification_deliveries" ("status", "next_retry_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_outbox_events" (
        "id" SERIAL NOT NULL,
        "notification_id" integer NOT NULL,
        "status" character varying(30) NOT NULL DEFAULT 'PENDING',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "processed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_outbox_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_outbox_status_created"
      ON "notification_outbox_events" ("status", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" SERIAL NOT NULL,
        "company_membership_id" integer NOT NULL,
        "notification_type" character varying(60) NOT NULL,
        "channel" character varying(20) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preference_scope" UNIQUE ("company_membership_id", "notification_type", "channel"),
        CONSTRAINT "FK_notification_preferences_membership" FOREIGN KEY ("company_membership_id")
          REFERENCES "company_users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_preference_membership"
      ON "notification_preferences" ("company_membership_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_outbox_events"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_deliveries"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_notifications_dedupe_active"`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP COLUMN IF EXISTS "event_key",
      DROP COLUMN IF EXISTS "template_code",
      DROP COLUMN IF EXISTS "is_mandatory",
      DROP COLUMN IF EXISTS "payload"
    `);
  }
}
