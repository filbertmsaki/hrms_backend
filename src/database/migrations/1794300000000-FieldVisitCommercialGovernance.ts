import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldVisitCommercialGovernance1794300000000 implements MigrationInterface {
  name = 'FieldVisitCommercialGovernance1794300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "field_visit_commercial_policies" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "default_currency" character varying(3) NOT NULL DEFAULT 'TZS',
        "supported_currencies" jsonb NOT NULL DEFAULT '["TZS"]'::jsonb,
        "allow_employee_opportunity_values" boolean NOT NULL DEFAULT true,
        "updated_by_company_user_id" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_field_visit_commercial_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_field_visit_commercial_policy_company" UNIQUE ("company_id"),
        CONSTRAINT "FK_field_visit_commercial_policy_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_field_visit_commercial_policy_actor" FOREIGN KEY ("updated_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_field_visit_commercial_policy_currencies" CHECK (jsonb_typeof("supported_currencies") = 'array' AND jsonb_array_length("supported_currencies") > 0)
      )
    `);
    await queryRunner.query(`
      INSERT INTO "field_visit_commercial_policies" ("company_id")
      SELECT "id" FROM "companies"
    `);
    await queryRunner.query(`
      ALTER TABLE "field_opportunities"
        ADD CONSTRAINT "CHK_field_opportunity_values_nonnegative"
        CHECK (("potential_value" IS NULL OR "potential_value" >= 0) AND ("actual_value" IS NULL OR "actual_value" >= 0))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "field_opportunities" DROP CONSTRAINT "CHK_field_opportunity_values_nonnegative"`,
    );
    await queryRunner.query(`DROP TABLE "field_visit_commercial_policies"`);
  }
}
