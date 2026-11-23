import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeSmsDeliverySettings1797900206000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE sms_global_settings ADD COLUMN gateway jsonb',
    );
    await runner.query(`CREATE TABLE notification_company_channel_settings (
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      channel varchar(20) NOT NULL, code varchar(160) NOT NULL, is_enabled boolean, description text,
      PRIMARY KEY (company_id, channel, code)
    )`);
    await runner.query(`CREATE TABLE sms_company_registry (
      company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      registry_id integer NOT NULL REFERENCES sms_notification_registry(id) ON DELETE CASCADE,
      is_enabled boolean, sms_template text, description text,
      PRIMARY KEY (company_id, registry_id)
    )`);
    await runner.query(
      'ALTER TABLE sms_notification_logs ADD COLUMN company_id integer REFERENCES companies(id) ON DELETE SET NULL',
    );
    await runner.query(`UPDATE sms_notification_logs AS log SET company_id = COALESCE(
      (SELECT company_id FROM company_users WHERE id = log.recipient_company_user_id),
      (SELECT company_id FROM employees WHERE id = log.recipient_employee_id),
      (SELECT company_id FROM company_users WHERE id = log.created_by_company_user_id)
    )`);
    await runner.query(
      'CREATE INDEX idx_sms_logs_company_created ON sms_notification_logs(company_id, created_at)',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX idx_sms_logs_company_created');
    await runner.query(
      'ALTER TABLE sms_notification_logs DROP COLUMN company_id',
    );
    await runner.query('DROP TABLE sms_company_registry');
    await runner.query('DROP TABLE notification_company_channel_settings');
    await runner.query(
      "DELETE FROM sms_global_settings WHERE key = 'SMS_GATEWAY' OR key LIKE 'COMPANY_SMS:%'",
    );
    await runner.query('ALTER TABLE sms_global_settings DROP COLUMN gateway');
  }
}
