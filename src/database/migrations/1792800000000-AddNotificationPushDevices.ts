import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationPushDevices1792800000000 implements MigrationInterface {
  name = 'AddNotificationPushDevices1792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_push_devices" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "company_user_id" integer NOT NULL,
        "expo_push_token" character varying(255) NOT NULL,
        "platform" character varying(20) NOT NULL,
        "device_name" character varying(120),
        "is_active" boolean NOT NULL DEFAULT TRUE,
        "last_registered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_push_devices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_push_device_token" UNIQUE ("expo_push_token"),
        CONSTRAINT "FK_notification_push_device_membership"
          FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_push_device_receiver"
      ON "notification_push_devices" ("company_id", "company_user_id", "is_active")
    `);
    await queryRunner.query(`
      CREATE TABLE "notification_push_receipts" (
        "id" SERIAL NOT NULL,
        "ticket_id" character varying(80) NOT NULL,
        "push_device_id" integer NOT NULL,
        "notification_delivery_id" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "message" text,
        "provider_error" character varying(100),
        "response" jsonb,
        "checked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_push_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_push_receipt_ticket" UNIQUE ("ticket_id"),
        CONSTRAINT "FK_notification_push_receipt_device"
          FOREIGN KEY ("push_device_id") REFERENCES "notification_push_devices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_push_receipt_pending"
      ON "notification_push_receipts" ("status", "created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_push_receipt_pending"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_push_receipts"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_push_device_receiver"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_push_devices"`);
  }
}
