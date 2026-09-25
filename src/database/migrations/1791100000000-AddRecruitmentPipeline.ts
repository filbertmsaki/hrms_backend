import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecruitmentPipeline1791100000000 implements MigrationInterface {
  name = 'AddRecruitmentPipeline1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "recruitment_requests" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "position_id" integer NOT NULL REFERENCES "positions"("id"),
      "manager_employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "vacancies" integer NOT NULL CHECK ("vacancies" > 0),
      "budget_amount" decimal(18,2) NOT NULL CHECK ("budget_amount" > 0),
      "job_title" varchar(160) NOT NULL,
      "job_description" text NOT NULL,
      "closes_on" date,
      "status" varchar(30) NOT NULL,
      "requested_by_company_user_id" integer NOT NULL,
      "manager_approved_by_company_user_id" integer,
      "hr_approved_by_company_user_id" integer,
      "finance_approved_by_company_user_id" integer,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_recruitment_request_company_status" ON "recruitment_requests" ("company_id", "status")`);
    await queryRunner.query(`CREATE TABLE "recruitment_candidates" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "request_id" integer NOT NULL REFERENCES "recruitment_requests"("id"),
      "first_name" varchar(100),
      "last_name" varchar(100),
      "gender" varchar(20),
      "email" varchar(255),
      "phone" varchar(25),
      "cv_document_id" integer,
      "interview" jsonb,
      "checks" jsonb,
      "offer_salary" decimal(18,2),
      "offer_start_date" date,
      "offer_document_id" integer,
      "offer_created_by_company_user_id" integer,
      "offer_approved_by_company_user_id" integer,
      "offer_token_hash" varchar(64),
      "offer_expires_at" timestamptz,
      "offer_accepted_at" timestamptz,
      "invitation_id" integer,
      "retention_until" timestamptz,
      "purged_at" timestamptz,
      "status" varchar(30) NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_recruitment_candidate_request_status" ON "recruitment_candidates" ("request_id", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_recruitment_offer_token" ON "recruitment_candidates" ("offer_token_hash") WHERE "offer_token_hash" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_recruitment_candidate_invitation" ON "recruitment_candidates" ("invitation_id") WHERE "invitation_id" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "employee_invitations" ADD COLUMN "source_candidate_id" integer`);
    await queryRunner.query(`ALTER TABLE "employee_invitations" ADD CONSTRAINT "FK_employee_invitation_source_candidate" FOREIGN KEY ("source_candidate_id") REFERENCES "recruitment_candidates"("id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_employee_invitation_source_candidate" ON "employee_invitations" ("source_candidate_id") WHERE "source_candidate_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_recruitment_candidate_retention" ON "recruitment_candidates" ("retention_until") WHERE "status" = 'REJECTED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_employee_invitation_source_candidate"`);
    await queryRunner.query(`ALTER TABLE "employee_invitations" DROP COLUMN "source_candidate_id"`);
    await queryRunner.query(`DROP TABLE "recruitment_candidates"`);
    await queryRunner.query(`DROP TABLE "recruitment_requests"`);
  }
}
