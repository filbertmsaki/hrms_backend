import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldOpportunityPremiumValues1794200000000 implements MigrationInterface {
  name = 'AddFieldOpportunityPremiumValues1794200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_opportunities"
        ADD COLUMN "premium_value" numeric(18, 2),
        ADD COLUMN "premium_currency" character varying(3),
        ADD CONSTRAINT "CHK_field_opportunity_premium_value_nonnegative"
          CHECK ("premium_value" IS NULL OR "premium_value" >= 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "field_opportunities"
        DROP CONSTRAINT "CHK_field_opportunity_premium_value_nonnegative",
        DROP COLUMN "premium_currency",
        DROP COLUMN "premium_value"
    `);
  }
}
