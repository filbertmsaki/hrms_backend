import { MigrationInterface, QueryRunner } from 'typeorm';
export class KpiCategoryReferences1791900000002 implements MigrationInterface {
  name = 'KpiCategoryReferences1791900000002';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "performance_kpi_categories" ("company_id", "name", "normalized_name")
      SELECT "company_id", MIN(regexp_replace(trim("category"), '\\s+', ' ', 'g')), lower(regexp_replace(trim("category"), '\\s+', ' ', 'g'))
      FROM "kpi_definitions" WHERE "category" IS NOT NULL AND trim("category") <> ''
      GROUP BY "company_id", lower(regexp_replace(trim("category"), '\\s+', ' ', 'g')) ON CONFLICT DO NOTHING`);
    await queryRunner.query(
      `UPDATE "kpi_definitions" SET "category" = NULL WHERE "category" IS NOT NULL AND trim("category") = ''`,
    );
    await queryRunner.query(`UPDATE "kpi_definitions" definition SET "category" = category."name"
      FROM "performance_kpi_categories" category WHERE definition."company_id" = category."company_id"
      AND lower(regexp_replace(trim(definition."category"), '\\s+', ' ', 'g')) = category."normalized_name"`);
    await queryRunner.query(
      `ALTER TABLE "performance_kpi_categories" ADD CONSTRAINT "UQ_performance_kpi_category_company_label" UNIQUE ("company_id", "name")`,
    );
    await queryRunner.query(`ALTER TABLE "kpi_definitions" ADD CONSTRAINT "FK_kpi_definition_category"
      FOREIGN KEY ("company_id", "category") REFERENCES "performance_kpi_categories" ("company_id", "name") ON UPDATE CASCADE ON DELETE RESTRICT`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kpi_definitions" DROP CONSTRAINT "FK_kpi_definition_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_kpi_categories" DROP CONSTRAINT "UQ_performance_kpi_category_company_label"`,
    );
  }
}
