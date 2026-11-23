import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceReconciliationPolicies1797900203000 implements MigrationInterface {
  async up(db: QueryRunner): Promise<void> {
    await db.query(`CREATE TABLE access_device_reconciliation_policies(
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      device_id integer NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false, enabled_at timestamptz NOT NULL DEFAULT now(),
      user_id integer REFERENCES users(id) ON DELETE SET NULL, membership_id integer REFERENCES company_users(id) ON DELETE SET NULL,
      PRIMARY KEY(company_id,device_id))`);
    await db.query(
      'ALTER TABLE access_reconciliation_operations ADD COLUMN credential_id integer',
    );
    await db.query(`CREATE TABLE access_card_suspensions(
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,device_id integer NOT NULL REFERENCES attendance_devices(id) ON DELETE CASCADE,
      credential_id integer NOT NULL,identity_digest varchar(64) NOT NULL, PRIMARY KEY(company_id,device_id,credential_id))`);
    // All changes outside this narrow status transition keep their existing capture path.
    const targeted = `NEW.company_id IS NOT NULL AND NEW.employee_id IS NOT NULL AND NEW.device_id IS NOT NULL AND
      NEW.credential_status IS DISTINCT FROM OLD.credential_status AND
      (to_jsonb(NEW)-ARRAY['credential_status','metadata','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['credential_status','metadata','updated_at'])`;
    await db.query(`CREATE FUNCTION capture_bound_credential_status() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM employees e JOIN attendance_devices d ON d.company_id=e.company_id WHERE e.company_id=NEW.company_id AND e.id=NEW.employee_id AND d.id=NEW.device_id) THEN
          RAISE EXCEPTION 'Credential employee and reader must belong to the same company';
        END IF;
        INSERT INTO access_reconciliation_operations(company_id,employee_id,device_id,reason,credential_id,status)
          VALUES(NEW.company_id,NEW.employee_id,NEW.device_id,'CREDENTIAL_STATUS',NEW.id,'PENDING_REVIEW');
        RETURN NEW;
      END $$`);
    await db.query(
      'DROP TRIGGER trg_capture_credential ON employee_access_credentials',
    );
    await db.query(
      'CREATE TRIGGER trg_capture_credential AFTER INSERT OR DELETE ON employee_access_credentials FOR EACH ROW EXECUTE FUNCTION capture_credential_change()',
    );
    await db.query(
      `CREATE TRIGGER trg_capture_credential_update AFTER UPDATE ON employee_access_credentials FOR EACH ROW WHEN (NOT (${targeted})) EXECUTE FUNCTION capture_credential_change()`,
    );
    await db.query(
      `CREATE TRIGGER trg_capture_bound_credential_status AFTER UPDATE ON employee_access_credentials FOR EACH ROW WHEN (${targeted}) EXECUTE FUNCTION capture_bound_credential_status()`,
    );
  }
  async down(db: QueryRunner): Promise<void> {
    const [row] = (await db.query(
      'SELECT EXISTS(SELECT 1 FROM access_device_reconciliation_policies UNION ALL SELECT 1 FROM access_card_suspensions UNION ALL SELECT 1 FROM access_reconciliation_operations WHERE credential_id IS NOT NULL) AS used',
    )) as Array<{ used: boolean }>;
    if (row.used)
      throw new Error(
        'Restore the pre-release snapshot to recover reader authorizations.',
      );
    await db.query('DROP TABLE access_device_reconciliation_policies');
    await db.query('DROP TABLE access_card_suspensions');
    await db.query(
      'DROP TRIGGER trg_capture_bound_credential_status ON employee_access_credentials',
    );
    await db.query(
      'DROP TRIGGER trg_capture_credential_update ON employee_access_credentials',
    );
    await db.query(
      'DROP TRIGGER trg_capture_credential ON employee_access_credentials',
    );
    await db.query('DROP FUNCTION capture_bound_credential_status()');
    await db.query(
      'CREATE TRIGGER trg_capture_credential AFTER INSERT OR UPDATE OR DELETE ON employee_access_credentials FOR EACH ROW EXECUTE FUNCTION capture_credential_change()',
    );
    await db.query(
      'ALTER TABLE access_reconciliation_operations DROP COLUMN credential_id',
    );
  }
}
