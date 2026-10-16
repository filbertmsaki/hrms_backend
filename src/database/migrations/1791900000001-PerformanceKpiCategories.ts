import { MigrationInterface, QueryRunner } from 'typeorm';
export class PerformanceKpiCategories1791900000001 implements MigrationInterface {
  name = 'PerformanceKpiCategories1791900000001';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "performance_kpi_categories" (
      "id" SERIAL PRIMARY KEY, "company_id" integer NOT NULL, "name" varchar(80) NOT NULL,
      "normalized_name" varchar(80) NOT NULL, "description" varchar(500),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_performance_kpi_category_company_name" UNIQUE ("company_id", "normalized_name")
    )`);
    await queryRunner.query(`INSERT INTO "performance_kpi_categories" ("company_id", "name", "normalized_name", "description")
      SELECT DISTINCT "company_id", defaults.name, lower(defaults.name), defaults.description FROM "kpi_definitions"
      CROSS JOIN (VALUES ('Delivery', 'Timely completion of work and agreed deliverables.'), ('Quality', 'Accuracy, standards, and quality of completed work.')) AS defaults(name, description)
      ON CONFLICT DO NOTHING`);
    await queryRunner.query(`INSERT INTO "performance_kpi_categories" ("company_id", "name", "normalized_name")
      SELECT "company_id", MIN(regexp_replace(trim("category"), '\\s+', ' ', 'g')), lower(regexp_replace(trim("category"), '\\s+', ' ', 'g'))
      FROM "kpi_definitions" WHERE "category" IS NOT NULL AND trim("category") <> ''
      GROUP BY "company_id", lower(regexp_replace(trim("category"), '\\s+', ' ', 'g')) ON CONFLICT DO NOTHING`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "performance_kpi_categories"');
  }
}
