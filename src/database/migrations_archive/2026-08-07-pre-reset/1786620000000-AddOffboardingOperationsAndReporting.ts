import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOffboardingOperationsAndReporting1786620000000 implements MigrationInterface {
  name = 'AddOffboardingOperationsAndReporting1786620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_actions_action_type_enum" AS ENUM(
        'email_disable',
        'sso_revoke',
        'vpn_revoke',
        'hrms_lock',
        'device_recovery',
        'badge_deactivation',
        'payroll_stop',
        'other'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_actions_status_enum" AS ENUM(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_asset_returns_asset_type_enum" AS ENUM(
        'laptop',
        'id_card',
        'sim_card',
        'keys',
        'vehicle',
        'access_card',
        'phone',
        'other'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_asset_returns_status_enum" AS ENUM(
        'pending',
        'returned',
        'missing',
        'waived'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_settlement_items_item_type_enum" AS ENUM(
        'final_salary',
        'leave_encashment',
        'loan_recovery',
        'gratuity',
        'severance',
        'tax_clearance',
        'other'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_settlement_items_status_enum" AS ENUM(
        'pending',
        'in_progress',
        'completed',
        'blocked',
        'waived'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_exit_interviews_status_enum" AS ENUM(
        'draft',
        'completed'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_exit_interviews_knowledge_transfer_status_enum" AS ENUM(
        'not_started',
        'in_progress',
        'completed',
        'not_required'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "offboarding_actions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "offboarding_request_id" integer NOT NULL,
        "action_type" "public"."offboarding_actions_action_type_enum" NOT NULL,
        "system_name" character varying(150),
        "owner_company_user_id" integer,
        "status" "public"."offboarding_actions_status_enum" NOT NULL DEFAULT 'pending',
        "due_date" TIMESTAMP,
        "requested_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "external_reference" character varying(191),
        "error_message" text,
        "notes" text,
        "metadata" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_actions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_actions"
      ADD CONSTRAINT "FK_offboarding_action_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_actions"
      ADD CONSTRAINT "FK_offboarding_action_request"
      FOREIGN KEY ("offboarding_request_id") REFERENCES "offboarding_requests"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_actions"
      ADD CONSTRAINT "FK_offboarding_action_owner_company_user"
      FOREIGN KEY ("owner_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_action_company"
      ON "offboarding_actions" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_action_request"
      ON "offboarding_actions" ("offboarding_request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_action_status"
      ON "offboarding_actions" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_action_owner"
      ON "offboarding_actions" ("owner_company_user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "offboarding_asset_returns" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "offboarding_request_id" integer NOT NULL,
        "asset_type" "public"."offboarding_asset_returns_asset_type_enum" NOT NULL,
        "asset_label" character varying(180) NOT NULL,
        "asset_identifier" character varying(120),
        "owner_company_user_id" integer,
        "status" "public"."offboarding_asset_returns_status_enum" NOT NULL DEFAULT 'pending',
        "due_date" TIMESTAMP,
        "returned_at" TIMESTAMP,
        "received_by_company_user_id" integer,
        "condition_notes" text,
        "remarks" text,
        "metadata" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_asset_returns" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      ADD CONSTRAINT "FK_offboarding_asset_return_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      ADD CONSTRAINT "FK_offboarding_asset_return_request"
      FOREIGN KEY ("offboarding_request_id") REFERENCES "offboarding_requests"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      ADD CONSTRAINT "FK_offboarding_asset_return_owner_company_user"
      FOREIGN KEY ("owner_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      ADD CONSTRAINT "FK_offboarding_asset_return_received_by_company_user"
      FOREIGN KEY ("received_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_asset_return_company"
      ON "offboarding_asset_returns" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_asset_return_request"
      ON "offboarding_asset_returns" ("offboarding_request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_asset_return_status"
      ON "offboarding_asset_returns" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_asset_return_owner"
      ON "offboarding_asset_returns" ("owner_company_user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "offboarding_settlement_items" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "offboarding_request_id" integer NOT NULL,
        "item_type" "public"."offboarding_settlement_items_item_type_enum" NOT NULL,
        "title" character varying(180) NOT NULL,
        "owner_company_user_id" integer,
        "status" "public"."offboarding_settlement_items_status_enum" NOT NULL DEFAULT 'pending',
        "amount" numeric(12,2),
        "currency" character varying(10),
        "due_date" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "remarks" text,
        "metadata" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_settlement_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      ADD CONSTRAINT "FK_offboarding_settlement_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      ADD CONSTRAINT "FK_offboarding_settlement_request"
      FOREIGN KEY ("offboarding_request_id") REFERENCES "offboarding_requests"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      ADD CONSTRAINT "FK_offboarding_settlement_owner_company_user"
      FOREIGN KEY ("owner_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_settlement_company"
      ON "offboarding_settlement_items" ("company_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_settlement_request"
      ON "offboarding_settlement_items" ("offboarding_request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_settlement_status"
      ON "offboarding_settlement_items" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_settlement_owner"
      ON "offboarding_settlement_items" ("owner_company_user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "offboarding_exit_interviews" (
        "id" SERIAL NOT NULL,
        "offboarding_request_id" integer NOT NULL,
        "conducted_by_company_user_id" integer,
        "status" "public"."offboarding_exit_interviews_status_enum" NOT NULL DEFAULT 'draft',
        "exit_reason_category" character varying(120),
        "employee_feedback" text,
        "manager_feedback" text,
        "rehire_eligible" boolean,
        "knowledge_transfer_status" "public"."offboarding_exit_interviews_knowledge_transfer_status_enum" NOT NULL DEFAULT 'not_started',
        "handover_notes" text,
        "final_notes" text,
        "submitted_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "metadata" json,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_exit_interviews" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_exit_interviews"
      ADD CONSTRAINT "FK_offboarding_exit_interview_request"
      FOREIGN KEY ("offboarding_request_id") REFERENCES "offboarding_requests"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_exit_interviews"
      ADD CONSTRAINT "FK_offboarding_exit_interview_conducted_by_company_user"
      FOREIGN KEY ("conducted_by_company_user_id") REFERENCES "company_users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_offboarding_exit_interview_request"
      ON "offboarding_exit_interviews" ("offboarding_request_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_exit_interview_request"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_exit_interviews"
      DROP CONSTRAINT "FK_offboarding_exit_interview_conducted_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_exit_interviews"
      DROP CONSTRAINT "FK_offboarding_exit_interview_request"
    `);
    await queryRunner.query(`
      DROP TABLE "offboarding_exit_interviews"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_settlement_owner"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_settlement_status"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_settlement_request"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_settlement_company"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      DROP CONSTRAINT "FK_offboarding_settlement_owner_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      DROP CONSTRAINT "FK_offboarding_settlement_request"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      DROP CONSTRAINT "FK_offboarding_settlement_company"
    `);
    await queryRunner.query(`
      DROP TABLE "offboarding_settlement_items"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_asset_return_owner"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_asset_return_status"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_asset_return_request"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_asset_return_company"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      DROP CONSTRAINT "FK_offboarding_asset_return_received_by_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      DROP CONSTRAINT "FK_offboarding_asset_return_owner_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      DROP CONSTRAINT "FK_offboarding_asset_return_request"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      DROP CONSTRAINT "FK_offboarding_asset_return_company"
    `);
    await queryRunner.query(`
      DROP TABLE "offboarding_asset_returns"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_action_owner"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_action_status"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_action_request"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."IDX_offboarding_action_company"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_actions"
      DROP CONSTRAINT "FK_offboarding_action_owner_company_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_actions"
      DROP CONSTRAINT "FK_offboarding_action_request"
    `);
    await queryRunner.query(`
      ALTER TABLE "offboarding_actions"
      DROP CONSTRAINT "FK_offboarding_action_company"
    `);
    await queryRunner.query(`
      DROP TABLE "offboarding_actions"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."offboarding_exit_interviews_knowledge_transfer_status_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_exit_interviews_status_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_settlement_items_status_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_settlement_items_item_type_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_asset_returns_status_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_asset_returns_asset_type_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_actions_status_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."offboarding_actions_action_type_enum"
    `);
  }
}
