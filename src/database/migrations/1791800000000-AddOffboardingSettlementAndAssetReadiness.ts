import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOffboardingSettlementAndAssetReadiness1791800000000
  implements MigrationInterface
{
  name = 'AddOffboardingSettlementAndAssetReadiness1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_settlement_items_source_type_enum" AS ENUM(
        'MANUAL', 'LEAVE', 'PAYROLL_EXTERNAL', 'LOAN_EXTERNAL', 'ADVANCE_EXTERNAL', 'ASSET_LIABILITY'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      ADD COLUMN "source_type" "public"."offboarding_settlement_items_source_type_enum" NOT NULL DEFAULT 'MANUAL',
      ADD COLUMN "source_reference" varchar(150),
      ADD COLUMN "calculation_snapshot" jsonb,
      ADD COLUMN "verified_by_company_user_id" integer,
      ADD COLUMN "verified_at" timestamptz,
      ADD COLUMN "payment_reference" varchar(150),
      ADD COLUMN "paid_at" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      ADD COLUMN "condition_at_return" varchar(50),
      ADD COLUMN "return_evidence_document_id" integer,
      ADD COLUMN "liability_amount" numeric(12,2),
      ADD COLUMN "liability_currency" varchar(10),
      ADD COLUMN "liability_acknowledged" boolean NOT NULL DEFAULT false,
      ADD COLUMN "verified_by_company_user_id" integer,
      ADD COLUMN "verified_at" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_approvals"
      ADD COLUMN "original_approver_company_user_id" integer,
      ADD COLUMN "delegated_from_company_user_id" integer,
      ADD COLUMN "delegated_at" timestamptz,
      ADD COLUMN "delegation_reason" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "offboarding_approvals"
      DROP COLUMN "delegation_reason",
      DROP COLUMN "delegated_at",
      DROP COLUMN "delegated_from_company_user_id",
      DROP COLUMN "original_approver_company_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_asset_returns"
      DROP COLUMN "verified_at",
      DROP COLUMN "verified_by_company_user_id",
      DROP COLUMN "liability_acknowledged",
      DROP COLUMN "liability_currency",
      DROP COLUMN "liability_amount",
      DROP COLUMN "return_evidence_document_id",
      DROP COLUMN "condition_at_return"
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_settlement_items"
      DROP COLUMN "paid_at",
      DROP COLUMN "payment_reference",
      DROP COLUMN "verified_at",
      DROP COLUMN "verified_by_company_user_id",
      DROP COLUMN "calculation_snapshot",
      DROP COLUMN "source_reference",
      DROP COLUMN "source_type"
    `);

    await queryRunner.query(
      `DROP TYPE "public"."offboarding_settlement_items_source_type_enum"`,
    );
  }
}
