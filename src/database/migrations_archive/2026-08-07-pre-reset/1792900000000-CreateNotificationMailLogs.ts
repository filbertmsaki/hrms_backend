import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationMailLogs1792900000000
  implements MigrationInterface
{
  name = 'CreateNotificationMailLogs1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_mail_logs" (
        "id" SERIAL NOT NULL,
        "company_id" integer,
        "method" character varying(160) NOT NULL,
        "recipient_email" character varying(320),
        "args" jsonb,
        "status" character varying(30) NOT NULL DEFAULT 'PENDING',
        "provider_message_id" character varying(255),
        "provider_response" text,
        "error_message" text,
        "processed_at" timestamptz,
        "retry_of_log_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_mail_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_mail_logs_company_status_created"
      ON "notification_mail_logs" ("company_id", "status", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_mail_logs_company_method_created"
      ON "notification_mail_logs" ("company_id", "method", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_mail_logs_company_method_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_mail_logs_company_status_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_mail_logs"`);
  }
}
