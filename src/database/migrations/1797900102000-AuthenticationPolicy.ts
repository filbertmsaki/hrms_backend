import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthenticationPolicy1797900102000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(
      'CREATE TABLE auth_policy (id smallint PRIMARY KEY CHECK (id = 1), policy jsonb NOT NULL)',
    );
    await runner.query('ALTER TABLE auth_sessions ADD COLUMN policy jsonb');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE auth_sessions DROP COLUMN policy');
    await runner.query('DROP TABLE auth_policy');
  }
}
