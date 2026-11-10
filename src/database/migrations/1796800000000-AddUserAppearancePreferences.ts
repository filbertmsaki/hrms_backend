import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAppearancePreferences1796800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "appearance_preferences" jsonb',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" DROP COLUMN "appearance_preferences"',
    );
  }
}
