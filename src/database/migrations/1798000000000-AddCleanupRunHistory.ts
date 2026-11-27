import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCleanupRunHistory1798000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS company_cleanup_runs (
      id BIGSERIAL PRIMARY KEY, company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      cleanup_type varchar(40) NOT NULL, scheduled_date date NOT NULL,
      status varchar(12) NOT NULL, deleted_count integer NOT NULL DEFAULT 0,
      error_message text, executed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (company_id, cleanup_type, scheduled_date)
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_company_cleanup_runs_history ON company_cleanup_runs (company_id, executed_at DESC)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS company_cleanup_runs`);
  }
}
