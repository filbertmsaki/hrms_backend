import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationChannelManagement1793000000000
  implements MigrationInterface
{
  name = 'CreateNotificationChannelManagement1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_channel_global_settings" (
        "id" SERIAL NOT NULL,
        "channel" character varying(20) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "description" text,
        "updated_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_channel_global_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_channel_global_settings_channel" UNIQUE ("channel")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_channel_global_settings_channel"
      ON "notification_channel_global_settings" ("channel")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_channel_registry" (
        "id" SERIAL NOT NULL,
        "channel" character varying(20) NOT NULL,
        "code" character varying(160) NOT NULL,
        "name" character varying(160) NOT NULL,
        "module" character varying(80) NOT NULL,
        "description" text,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "updated_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_channel_registry" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_channel_registry_channel_code" UNIQUE ("channel", "code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_channel_registry_channel_module"
      ON "notification_channel_registry" ("channel", "module")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_channel_registry_channel_module"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_channel_registry"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notification_channel_global_settings_channel"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "notification_channel_global_settings"`,
    );
  }
}
