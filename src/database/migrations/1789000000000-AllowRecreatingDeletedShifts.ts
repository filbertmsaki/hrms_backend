import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowRecreatingDeletedShifts1789000000000 implements MigrationInterface {
  name = 'AllowRecreatingDeletedShifts1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."UQ_shifts_company_code"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."UQ_shifts_company_name"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_shifts_company_code"
      ON "shifts" ("company_id", "code")
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_shifts_company_name"
      ON "shifts" ("company_id", "name")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."UQ_shifts_company_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."UQ_shifts_company_code"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_shifts_company_name"
      ON "shifts" ("company_id", "name")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_shifts_company_code"
      ON "shifts" ("company_id", "code")
    `);
  }
}
