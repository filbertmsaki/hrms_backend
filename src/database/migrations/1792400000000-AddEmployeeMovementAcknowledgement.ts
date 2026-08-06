import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeMovementAcknowledgement1792400000000
  implements MigrationInterface
{
  name = 'AddEmployeeMovementAcknowledgement1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_movements"
      ADD COLUMN IF NOT EXISTS "employee_acknowledgement_required" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "employee_acknowledged_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_movements"
      DROP COLUMN IF EXISTS "employee_acknowledgement_required",
      DROP COLUMN IF EXISTS "employee_acknowledged_at"
    `);
  }
}
