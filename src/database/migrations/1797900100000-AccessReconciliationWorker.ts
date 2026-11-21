import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessReconciliationWorker1797900100000 implements MigrationInterface {
  name = 'AccessReconciliationWorker1797900100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE access_reconciliation_operations
      ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
      ADD COLUMN next_attempt_at timestamptz,
      ADD COLUMN started_at timestamptz,
      ADD COLUMN completed_at timestamptz,
      ADD COLUMN desired_version varchar(64),
      ADD COLUMN error_code varchar(64)`);
    await queryRunner.query(`CREATE INDEX "IDX_access_reconciliation_due"
      ON access_reconciliation_operations (status, next_attempt_at, id)`);
    await queryRunner.query(`CREATE TABLE access_reconciliation_settings (
      company_id integer PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT false,
      updated_by_company_user_id integer,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE TABLE access_reconciliation_managed_rights (
      id serial PRIMARY KEY,
      company_id integer NOT NULL,
      employee_id integer NOT NULL,
      device_id integer NOT NULL,
      device_employee_no varchar(100) NOT NULL,
      managed_rights jsonb NOT NULL DEFAULT '[]'::jsonb,
      desired_version varchar(64),
      verified_at timestamptz,
      pending_before jsonb,
      pending_after jsonb,
      pending_managed jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_access_reconciliation_owner" UNIQUE (company_id, employee_id, device_id)
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT
      (SELECT count(*) FROM access_reconciliation_managed_rights) AS owned,
      (SELECT count(*) FROM access_reconciliation_settings WHERE enabled) AS enabled,
      (SELECT count(*) FROM access_reconciliation_operations WHERE status <> 'PENDING_REVIEW' OR attempt_count <> 0) AS processed`)) as Array<{
      owned: string;
      enabled: string;
      processed: string;
    }>;
    if (
      Number(rows[0].owned) ||
      Number(rows[0].enabled) ||
      Number(rows[0].processed)
    )
      throw new Error(
        'Cannot revert while reconciliation state or processing history exists.',
      );
    await queryRunner.query('DROP TABLE access_reconciliation_managed_rights');
    await queryRunner.query('DROP TABLE access_reconciliation_settings');
    await queryRunner.query('DROP INDEX "IDX_access_reconciliation_due"');
    await queryRunner.query(`ALTER TABLE access_reconciliation_operations
      DROP COLUMN error_code, DROP COLUMN desired_version, DROP COLUMN completed_at,
      DROP COLUMN started_at, DROP COLUMN next_attempt_at, DROP COLUMN attempt_count`);
  }
}
