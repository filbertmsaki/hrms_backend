import { MigrationInterface, QueryRunner } from 'typeorm';

export class BindOnboardingAcknowledgementDocument1795500000000 implements MigrationInterface {
  name = 'BindOnboardingAcknowledgementDocument1795500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" ADD COLUMN IF NOT EXISTS "employee_acknowledgement_document_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" ADD COLUMN IF NOT EXISTS "employee_acknowledgement_document_hash" character varying(128)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_onboarding_ack_document" ON "onboarding_requests" ("employee_acknowledgement_document_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_ack_document"`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" DROP COLUMN IF EXISTS "employee_acknowledgement_document_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" DROP COLUMN IF EXISTS "employee_acknowledgement_document_id"`,
    );
  }
}
