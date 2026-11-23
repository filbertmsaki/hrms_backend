import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessScheduleDeployments1797900202000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`CREATE TABLE access_schedule_deployments (
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('week-plan','template')),
      resource_id integer NOT NULL,
      device_id integer NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      membership_id integer REFERENCES company_users(id) ON DELETE SET NULL,
      enabled boolean NOT NULL DEFAULT false,
      verified_revision integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      result text NOT NULL DEFAULT 'Pending',
      PRIMARY KEY(company_id,kind,resource_id)
    )`);
    await db.query(
      'CREATE INDEX access_schedule_deployments_due ON access_schedule_deployments(next_attempt_at) WHERE enabled',
    );
  }

  async down(db: QueryRunner): Promise<void> {
    const [row]: Array<{ used: boolean }> = await db.query(
      'SELECT EXISTS(SELECT 1 FROM access_schedule_deployments) AS used',
    );
    if (row.used)
      throw new Error(
        'Restore the pre-release snapshot to recover recorded device deployments.',
      );
    await db.query('DROP TABLE access_schedule_deployments');
  }
}
