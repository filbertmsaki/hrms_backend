import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowEmployeeAccountUnlinking1789100000000 implements MigrationInterface {
  name = 'AllowEmployeeAccountUnlinking1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "FK_640b443f67415a68f5386f5e36e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "company_user_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_640b443f67415a68f5386f5e36e" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS "count" FROM "employees" WHERE "company_user_id" IS NULL`,
    )) as Array<{ count: number }>;
    if (Number(count) > 0) {
      throw new Error(
        'Cannot restore the mandatory employee account link while unlinked employees exist',
      );
    }

    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "FK_640b443f67415a68f5386f5e36e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ALTER COLUMN "company_user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_640b443f67415a68f5386f5e36e" FOREIGN KEY ("company_user_id") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
