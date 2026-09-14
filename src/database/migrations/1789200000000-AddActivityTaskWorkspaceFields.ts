import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityTaskWorkspaceFields1789200000000 implements MigrationInterface {
  name = 'AddActivityTaskWorkspaceFields1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "priority" varchar(20) NOT NULL DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "assigned_by_company_user_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "assigned_by_employee_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "assigned_by_snapshot" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "daily_activity_comments" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "daily_activity_entry_id" integer NOT NULL, "author_company_user_id" integer, "author_employee_id" integer, "author_snapshot" jsonb, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_daily_activity_comments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_daily_activity_comment_entry" ON "daily_activity_comments" ("company_id", "daily_activity_entry_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_daily_activity_comment_entry"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_activity_comments"`);
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "checklist"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "assigned_by_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "assigned_by_employee_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "assigned_by_company_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "priority"`,
    );
  }
}
