import { MigrationInterface, QueryRunner } from 'typeorm';

/** Makes approved seats a property of a department-position assignment. */
export class DepartmentPositionHeadcount1792600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "department_positions" ADD COLUMN IF NOT EXISTS "headcount" integer NOT NULL DEFAULT 1`,
    );
    // Preserve the existing configured capacity when a position is already
    // assigned to a department. New mappings inherit the position value.
    await queryRunner.query(
      `UPDATE "department_positions" mapping SET "headcount" = position."headcount" FROM "positions" position WHERE position."id" = mapping."position_id"`,
    );
    // Older data may only have positions.department_id. Add its missing
    // mapping so capacity lookups remain valid after the migration.
    await queryRunner.query(
      `INSERT INTO "department_positions" ("company_id", "department_id", "position_id", "headcount") SELECT p."company_id", p."department_id", p."id", p."headcount" FROM "positions" p WHERE p."department_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "department_positions" dp WHERE dp."company_id" = p."company_id" AND dp."department_id" = p."department_id" AND dp."position_id" = p."id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "department_positions" DROP COLUMN "headcount"`,
    );
  }
}
