import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebPushSubscriptions1797900039000 implements MigrationInterface {
  name = 'AddWebPushSubscriptions1797900039000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_web_push_subscriptions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "company_user_id" integer NOT NULL,
        "endpoint" text NOT NULL,
        "endpoint_hash" character(64) NOT NULL,
        "p256dh" character varying(255) NOT NULL,
        "auth" character varying(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT TRUE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_web_push_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_web_push_endpoint_hash" UNIQUE ("endpoint_hash"),
        CONSTRAINT "FK_notification_web_push_membership"
          FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_web_push_receiver"
      ON "notification_web_push_subscriptions" ("company_id", "company_user_id", "is_active")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_web_push_receiver"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_web_push_subscriptions"`,
    );
  }
}
