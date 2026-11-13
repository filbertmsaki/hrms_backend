import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employment contracts phases 1–3 (approved D1, D3, D4).
 *
 * D1 – contract templates live in employment_letter_templates with
 *      letter_type = 'CONTRACT', one per contract type, with clause sections.
 *      The (company, letter_type) uniqueness now applies only to non-contract
 *      letters; contract templates are unique per (company, contract_type).
 * D3 – a contract records when and why it ended and the offboarding request.
 * D4 – a contract version records why it was created (renewal/amendment)
 *      and the employee movement that triggered it.
 *
 * All additive and nullable; existing rows are untouched.
 */
export class ContractTemplatesAndLifecycleLinks1797800000000 implements MigrationInterface {
  name = 'ContractTemplatesAndLifecycleLinks1797800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // D1
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" ADD "contract_type" varchar(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" ADD "sections" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" DROP CONSTRAINT "UQ_employment_letter_template_company_type"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employment_letter_template_company_type" ON "employment_letter_templates" ("company_id", "letter_type") WHERE "contract_type" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employment_letter_template_contract_type" ON "employment_letter_templates" ("company_id", "letter_type", "contract_type") WHERE "contract_type" IS NOT NULL`,
    );

    // D3
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD "ended_at" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD "end_reason" varchar(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD "offboarding_request_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD CONSTRAINT "FK_employment_contract_offboarding_request" FOREIGN KEY ("offboarding_request_id") REFERENCES "offboarding_requests"("id") ON DELETE SET NULL`,
    );

    // D4
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD "amendment_reason" varchar(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD "source_movement_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" ADD CONSTRAINT "FK_employment_contract_source_movement" FOREIGN KEY ("source_movement_id") REFERENCES "employee_movements"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP CONSTRAINT "FK_employment_contract_source_movement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP COLUMN "source_movement_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP COLUMN "amendment_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP CONSTRAINT "FK_employment_contract_offboarding_request"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP COLUMN "offboarding_request_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP COLUMN "end_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_contracts" DROP COLUMN "ended_at"`,
    );
    await queryRunner.query(
      `DELETE FROM "employment_letter_templates" WHERE "letter_type" = 'CONTRACT'`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_employment_letter_template_contract_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_employment_letter_template_company_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" ADD CONSTRAINT "UQ_employment_letter_template_company_type" UNIQUE ("company_id", "letter_type")`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" DROP COLUMN "sections"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employment_letter_templates" DROP COLUMN "contract_type"`,
    );
  }
}
