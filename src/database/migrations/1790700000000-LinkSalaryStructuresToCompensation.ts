import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkSalaryStructuresToCompensation1790700000000 implements MigrationInterface {
  name = 'LinkSalaryStructuresToCompensation1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_compensation_versions"
        ADD COLUMN IF NOT EXISTS "component_overrides" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "salary_structures"
        ADD COLUMN IF NOT EXISTS "description" text
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_salary_structure_company_code_status"
        ON "salary_structures" ("company_id", "code", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_compensation_structure_code"
        ON "employee_compensation_versions" ("company_id", "salary_structure_code")
    `);
    // Normalise legacy free-text codes so they match structure codes, which
    // are always stored upper-case.
    await queryRunner.query(`
      UPDATE "employee_compensation_versions"
        SET "salary_structure_code" = UPPER(TRIM("salary_structure_code"))
        WHERE "salary_structure_code" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_employee_compensation_structure_code"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_salary_structure_company_code_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "salary_structures" DROP COLUMN IF EXISTS "description"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_compensation_versions"
        DROP COLUMN IF EXISTS "component_overrides"
    `);
  }
}
