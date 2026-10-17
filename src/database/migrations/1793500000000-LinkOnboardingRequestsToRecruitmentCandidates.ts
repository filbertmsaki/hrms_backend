import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkOnboardingRequestsToRecruitmentCandidates1793500000000 implements MigrationInterface {
  name = 'LinkOnboardingRequestsToRecruitmentCandidates1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" ADD "candidate_id" integer`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_onboarding_request_candidate" ON "onboarding_requests" ("company_id", "candidate_id") WHERE "candidate_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" ADD CONSTRAINT "FK_onboarding_request_candidate" FOREIGN KEY ("candidate_id") REFERENCES "recruitment_candidates"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`
      UPDATE "onboarding_requests" onboarding
      SET "candidate_id" = invitation."source_candidate_id"
      FROM "employee_invitations" invitation
      WHERE invitation."accepted_employee_id" = onboarding."employee_id"
        AND invitation."company_id" = onboarding."company_id"
        AND invitation."source_candidate_id" IS NOT NULL
        AND onboarding."candidate_id" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" DROP CONSTRAINT "FK_onboarding_request_candidate"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_onboarding_request_candidate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_requests" DROP COLUMN "candidate_id"`,
    );
  }
}
