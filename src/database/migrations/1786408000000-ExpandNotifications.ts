import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandNotifications1786408000000 implements MigrationInterface {
  name = 'ExpandNotifications1786408000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN "category" character varying(80) NOT NULL DEFAULT 'GENERAL',
      ADD COLUMN "priority" character varying(20) NOT NULL DEFAULT 'MEDIUM',
      ADD COLUMN "related_module" character varying(80),
      ADD COLUMN "branch_id" integer,
      ADD COLUMN "department_id" integer,
      ADD COLUMN "seen_at" TIMESTAMP,
      ADD COLUMN "delivery_channel" character varying(20) NOT NULL DEFAULT 'IN_APP',
      ADD COLUMN "delivery_status" character varying(20) NOT NULL DEFAULT 'DELIVERED',
      ADD COLUMN "dedupe_key" character varying(180),
      ADD COLUMN "expires_at" TIMESTAMP,
      ADD COLUMN "archived_at" TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_company_receiver_archived"
      ON "notifications" ("company_id", "receiver_company_user_id", "archived_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_category"
      ON "notifications" ("category")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_priority"
      ON "notifications" ("priority")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_dedupe_key"
      ON "notifications" ("dedupe_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_dedupe_key"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_priority"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_category"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_company_receiver_archived"`,
    );

    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP COLUMN "archived_at",
      DROP COLUMN "expires_at",
      DROP COLUMN "dedupe_key",
      DROP COLUMN "delivery_status",
      DROP COLUMN "delivery_channel",
      DROP COLUMN "seen_at",
      DROP COLUMN "department_id",
      DROP COLUMN "branch_id",
      DROP COLUMN "related_module",
      DROP COLUMN "priority",
      DROP COLUMN "category"
    `);
  }
}
