import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityReviewEscalationPolicy1794700000000 implements MigrationInterface {
  name = 'AddActivityReviewEscalationPolicy1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "manager_review_due_hours" integer NOT NULL DEFAULT 24`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "department_head_escalation_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "department_head_escalation_hours" integer NOT NULL DEFAULT 48`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD CONSTRAINT "CHK_activity_policy_review_due_hours_positive" CHECK ("manager_review_due_hours" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD CONSTRAINT "CHK_activity_policy_escalation_hours_positive" CHECK ("department_head_escalation_hours" > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP CONSTRAINT IF EXISTS "CHK_activity_policy_escalation_hours_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP CONSTRAINT IF EXISTS "CHK_activity_policy_review_due_hours_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "department_head_escalation_hours"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "department_head_escalation_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "manager_review_due_hours"`,
    );
  }
}
