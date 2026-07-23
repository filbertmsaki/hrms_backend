import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceOffboardingOwnership1786610000000 implements MigrationInterface {
  name = 'EnhanceOffboardingOwnership1786610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."offboarding_audit_logs_action_enum"
      ADD VALUE IF NOT EXISTS 'task_reassigned'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."offboarding_audit_logs_action_enum"
      ADD VALUE IF NOT EXISTS 'task_reopened'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."offboarding_audit_logs_action_enum"
      ADD VALUE IF NOT EXISTS 'clearance_assigned'
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_clearances"
      ADD COLUMN "owner_company_user_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_clearances"
      ADD COLUMN "due_date" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_clearances"
      ADD CONSTRAINT "FK_offboarding_clearance_owner_company_user"
      FOREIGN KEY ("owner_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_clearance_owner"
      ON "offboarding_clearances" ("owner_company_user_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD COLUMN "reopened_at" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD COLUMN "reopened_by_company_user_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD COLUMN "reassigned_at" TIMESTAMP
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD COLUMN "last_reassigned_by_company_user_id" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD CONSTRAINT "FK_offboarding_task_reopened_by_company_user"
      FOREIGN KEY ("reopened_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD CONSTRAINT "FK_offboarding_task_last_reassigned_by_company_user"
      FOREIGN KEY ("last_reassigned_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_task_reopened_by"
      ON "offboarding_tasks" ("reopened_by_company_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_task_reassigned_by"
      ON "offboarding_tasks" ("last_reassigned_by_company_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_task_reassigned_by"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_task_reopened_by"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP CONSTRAINT "FK_offboarding_task_last_reassigned_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP CONSTRAINT "FK_offboarding_task_reopened_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP COLUMN "last_reassigned_by_company_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP COLUMN "reassigned_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP COLUMN "reopened_by_company_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP COLUMN "reopened_at"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_clearance_owner"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_clearances"
      DROP CONSTRAINT "FK_offboarding_clearance_owner_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_clearances"
      DROP COLUMN "due_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_clearances"
      DROP COLUMN "owner_company_user_id"
    `);

    // PostgreSQL does not support removing enum values directly without a type rebuild.
  }
}
