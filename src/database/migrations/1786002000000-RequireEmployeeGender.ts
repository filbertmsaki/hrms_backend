import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequireEmployeeGender1786002000000
  implements MigrationInterface
{
  name = 'RequireEmployeeGender1786002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "employees"
      SET "gender" = LOWER(BTRIM("gender"))
      WHERE "gender" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "gender" = CASE "employee_no"
        WHEN 'AICL-000001' THEN 'male'
        WHEN 'AICL-000002' THEN 'male'
        WHEN 'AICL-000003' THEN 'male'
        WHEN 'AICL-000004' THEN 'female'
        WHEN 'AICL-000005' THEN 'male'
        WHEN 'AICL-000006' THEN 'male'
        WHEN 'AICL-000007' THEN 'male'
        WHEN 'AICL-000008' THEN 'male'
        WHEN 'AICL-000009' THEN 'male'
        WHEN 'AICL-000010' THEN 'male'
        WHEN 'AICL-000011' THEN 'male'
        WHEN 'AICL-000012' THEN 'female'
        WHEN 'AICL-000013' THEN 'female'
        WHEN 'AICL-000014' THEN 'female'
        WHEN 'AICL-000015' THEN 'female'
        WHEN 'AICL-000016' THEN 'male'
        WHEN 'AICL-000017' THEN 'female'
        WHEN 'AICL-000018' THEN 'female'
        WHEN 'AICL-000019' THEN 'female'
        WHEN 'AICL-000020' THEN 'female'
        WHEN 'AICL-000021' THEN 'female'
        WHEN 'AICL-000022' THEN 'male'
        WHEN 'AICL-000023' THEN 'female'
        WHEN 'AICL-000024' THEN 'male'
        WHEN 'AICL-000025' THEN 'male'
        WHEN 'AICL-000026' THEN 'female'
        WHEN 'AICL-000027' THEN 'female'
        WHEN 'AICL-000028' THEN 'female'
        WHEN 'AICL-000029' THEN 'female'
        ELSE "gender"
      END
      WHERE "gender" IS NULL
         OR BTRIM("gender") = ''
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "employees"
          WHERE "gender" IS NULL OR BTRIM("gender") = ''
        ) THEN
          RAISE EXCEPTION
            'Cannot enforce employees.gender: some employee rows are missing gender values. Backfill them before rerunning this migration.';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM "employees"
          WHERE "gender" NOT IN ('male', 'female')
        ) THEN
          RAISE EXCEPTION
            'Cannot enforce employees.gender: only "male" and "female" are allowed.';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ALTER COLUMN "gender" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'CHK_employee_gender_allowed'
        ) THEN
          ALTER TABLE "employees"
          ADD CONSTRAINT "CHK_employee_gender_allowed"
          CHECK ("gender" IN ('male', 'female'));
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP CONSTRAINT IF EXISTS "CHK_employee_gender_allowed"
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ALTER COLUMN "gender" DROP NOT NULL
    `);
  }
}
