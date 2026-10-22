import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceRegularizationEvidenceControls1795800000000 implements MigrationInterface {
  name = 'AddAttendanceRegularizationEvidenceControls1795800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_policies"
        ADD COLUMN "regularization_evidence_required" boolean NOT NULL DEFAULT false,
        ADD COLUMN "regularization_eligible_statuses" jsonb
    `);
    await queryRunner.query(`
      CREATE TABLE "attendance_correction_documents" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL,
        "request_id" integer NOT NULL REFERENCES "attendance_correction_requests"("id") ON DELETE CASCADE,
        "file_url" text NOT NULL,
        "file_name" varchar(180) NOT NULL,
        "file_type" varchar(80) NOT NULL,
        "uploaded_by_company_user_id" integer,
        "uploaded_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_correction_document_request"
      ON "attendance_correction_documents" ("company_id", "request_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "attendance_correction_documents"');
    await queryRunner.query(`
      ALTER TABLE "attendance_policies"
        DROP COLUMN "regularization_evidence_required",
        DROP COLUMN "regularization_eligible_statuses"
    `);
  }
}
