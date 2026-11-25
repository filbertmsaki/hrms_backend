import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldFollowUpDetails1797900217000 implements MigrationInterface {
  name = 'FieldFollowUpDetails1797900217000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "field_follow_ups" ADD COLUMN IF NOT EXISTS "due_at" timestamptz`,
    );
    await q.query(
      `ALTER TABLE "field_follow_ups" ADD COLUMN IF NOT EXISTS "action_type" varchar(30) NOT NULL DEFAULT 'OTHER'`,
    );
    await q.query(
      `ALTER TABLE "field_follow_ups" ADD COLUMN IF NOT EXISTS "priority" varchar(20) NOT NULL DEFAULT 'NORMAL'`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "field_follow_up_reminder_days" int NOT NULL DEFAULT 1`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "field_follow_up_escalation_days" int NOT NULL DEFAULT 3`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "field_plan_approval_required" boolean`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "field_max_gps_accuracy_meters" integer`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "field_allow_gps_exception" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "field_visits" ADD COLUMN IF NOT EXISTS "status_reason" text`,
    );
    await q.query(
      `ALTER TABLE "field_visits" ADD COLUMN IF NOT EXISTS "reschedule_date" date`,
    );
    await q.query(
      `ALTER TABLE "field_visits" ADD COLUMN IF NOT EXISTS "priority" varchar(20) NOT NULL DEFAULT 'NORMAL'`,
    );
    await q.query(
      `ALTER TABLE "field_visit_plan_items" ADD COLUMN IF NOT EXISTS "priority" varchar(20) NOT NULL DEFAULT 'NORMAL'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "field_allow_gps_exception"`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "field_max_gps_accuracy_meters"`,
    );
    await q.query(
      `ALTER TABLE "field_visit_plan_items" DROP COLUMN IF EXISTS "priority"`,
    );
    await q.query(
      `ALTER TABLE "field_visits" DROP COLUMN IF EXISTS "priority"`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "field_plan_approval_required"`,
    );
    await q.query(
      `ALTER TABLE "field_visits" DROP COLUMN IF EXISTS "reschedule_date"`,
    );
    await q.query(
      `ALTER TABLE "field_visits" DROP COLUMN IF EXISTS "status_reason"`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "field_follow_up_escalation_days"`,
    );
    await q.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "field_follow_up_reminder_days"`,
    );
    await q.query(
      `ALTER TABLE "field_follow_ups" DROP COLUMN IF EXISTS "priority"`,
    );
    await q.query(
      `ALTER TABLE "field_follow_ups" DROP COLUMN IF EXISTS "action_type"`,
    );
    await q.query(
      `ALTER TABLE "field_follow_ups" DROP COLUMN IF EXISTS "due_at"`,
    );
  }
}
