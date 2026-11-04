import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityPerformanceRelevance1796800000000 implements MigrationInterface {
  name = 'AddActivityPerformanceRelevance1796800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "daily_activity_entries"
      ADD COLUMN "performance_relevance" character varying(40) NOT NULL DEFAULT 'NOT_EVALUATED'
    `);
    await queryRunner.query(`
      UPDATE "daily_activity_entries"
      SET "performance_relevance" = 'KEY_DELIVERABLE'
      WHERE "employee_kpi_id" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "daily_activity_entries"
      ADD CONSTRAINT "CHK_daily_activity_performance_relevance"
      CHECK ("performance_relevance" IN ('NOT_EVALUATED', 'SUPPORTING_EVIDENCE', 'KEY_DELIVERABLE', 'DEVELOPMENT_ACTIVITY'))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_daily_activity_performance_relevance"
      ON "daily_activity_entries" ("company_id", "performance_relevance", "employee_kpi_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_daily_activity_performance_relevance"`,
    );
    await queryRunner.query(`
      ALTER TABLE "daily_activity_entries"
      DROP CONSTRAINT "CHK_daily_activity_performance_relevance"
    `);
    await queryRunner.query(`
      ALTER TABLE "daily_activity_entries"
      DROP COLUMN "performance_relevance"
    `);
  }
}
