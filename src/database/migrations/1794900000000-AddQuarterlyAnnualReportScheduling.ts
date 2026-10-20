import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuarterlyAnnualReportScheduling1794900000000 implements MigrationInterface {
  name = 'AddQuarterlyAnnualReportScheduling1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."report_schedule_type_enum" ADD VALUE IF NOT EXISTS 'QUARTERLY'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."report_schedule_type_enum" ADD VALUE IF NOT EXISTS 'ANNUAL'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."report_template_date_range_strategy_enum" ADD VALUE IF NOT EXISTS 'CURRENT_QUARTER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."report_template_date_range_strategy_enum" ADD VALUE IF NOT EXISTS 'PREVIOUS_QUARTER'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."report_template_date_range_strategy_enum" ADD VALUE IF NOT EXISTS 'CURRENT_YEAR'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."report_template_date_range_strategy_enum" ADD VALUE IF NOT EXISTS 'PREVIOUS_YEAR'`,
    );
  }

  // PostgreSQL enum labels are intentionally retained on rollback. Removing a
  // label would fail or require rewriting existing schedule/template rows.
  public async down(): Promise<void> {}
}
