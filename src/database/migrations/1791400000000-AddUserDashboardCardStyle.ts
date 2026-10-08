import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDashboardCardStyle1791400000000 implements MigrationInterface {
  name = 'AddUserDashboardCardStyle1791400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboard_card_style" jsonb',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "dashboard_card_style"',
    );
  }
}
