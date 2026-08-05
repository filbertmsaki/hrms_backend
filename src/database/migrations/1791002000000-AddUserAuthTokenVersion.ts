import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAuthTokenVersion1791002000000 implements MigrationInterface {
  name = 'AddUserAuthTokenVersion1791002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "auth_token_version" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "auth_token_version"
    `);
  }
}
