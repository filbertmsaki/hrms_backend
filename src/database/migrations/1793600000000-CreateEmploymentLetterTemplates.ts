import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmploymentLetterTemplates1793600000000 implements MigrationInterface {
  name = 'CreateEmploymentLetterTemplates1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employment_letter_templates" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "letter_type" character varying(20) NOT NULL,
        "title" character varying(180) NOT NULL,
        "body" text NOT NULL,
        "signatory_name" character varying(160) NOT NULL,
        "signatory_title" character varying(160) NOT NULL,
        "updated_by_company_user_id" integer NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employment_letter_template_company_type" UNIQUE ("company_id", "letter_type"),
        CONSTRAINT "PK_employment_letter_templates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employment_letter_template_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employment_letter_template_actor" FOREIGN KEY ("updated_by_company_user_id") REFERENCES "company_users"("id") ON DELETE RESTRICT
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employment_letter_templates"`);
  }
}
