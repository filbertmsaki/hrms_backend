import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthSessionRefreshTokenId1797900101000 implements MigrationInterface {
  name = 'AuthSessionRefreshTokenId1797900101000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE auth_sessions ADD COLUMN current_refresh_jti uuid',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE auth_sessions DROP COLUMN current_refresh_jti',
    );
  }
}
