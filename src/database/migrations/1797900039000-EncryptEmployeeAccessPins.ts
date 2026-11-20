import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncryptEmployeeAccessPins1797900039000 implements MigrationInterface {
  name = 'EncryptEmployeeAccessPins1797900039000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "employee_access_credentials" ALTER COLUMN "pin_password" TYPE text',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "employee_access_credentials" WHERE "pin_password" LIKE 'enc:v1:%' OR length("pin_password") > 50`,
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0) {
      throw new Error(
        'Cannot revert PIN column while encrypted or oversized values exist. Use the documented recovery procedure.',
      );
    }
    await queryRunner.query(
      'ALTER TABLE "employee_access_credentials" ALTER COLUMN "pin_password" TYPE varchar(50)',
    );
  }
}
