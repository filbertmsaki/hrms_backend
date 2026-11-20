import { Client } from 'pg';
import type { QueryRunner, EntityManager } from 'typeorm';
import { CaptureDirectAccessChanges1797900091000 } from '../../../database/migrations/1797900091000-CaptureDirectAccessChanges';
import { AllowDirectAccessReconciliation1797900090000 } from '../../../database/migrations/1797900090000-AllowDirectAccessReconciliation';
import { recordEmployeeReconciliation } from './record-employee-reconciliation';
import { recordScheduleReconciliation } from './record-schedule-reconciliation';

const run =
  process.env.RUN_ACCESS_CAPTURE_PG_TEST === '1' ? describe : describe.skip;

jest.setTimeout(30000);

run('access change capture on PostgreSQL', () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await client.connect();
    await client.query('BEGIN');
    const schema = `access_capture_test_${process.pid}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    for (const sql of [
      'CREATE TABLE access_reconciliation_operations(company_id int,employee_id int NOT NULL,device_id int,source_group_id int NOT NULL,requested_by_company_user_id int,reason text,status text)',
      'CREATE TABLE employee_device_assignments(id int,company_id int,employee_id int,device_id int,employee_no text,organization_id int,hikvision_user_type text,user_verify_mode text,valid_begin_time timestamp,valid_end_time timestamp,valid_enabled boolean,door_right text,local_ui_right boolean,close_delay_enabled boolean,max_open_door_time int,open_door_time int,sync_status text,deleted_at timestamp,last_synced_at timestamp)',
      'CREATE TABLE employee_device_right_plans(employee_device_assignment_id int,device_id int,door_id int,door_no int,schedule_template_id int,hikvision_template_no text,is_active boolean)',
      'CREATE TABLE access_groups(id int,company_id int)',
      'CREATE TABLE access_group_employees(access_group_id int,employee_id int,organization_id int,employee_no text,source text)',
      'CREATE TABLE access_group_devices(access_group_id int,device_id int)',
      'CREATE TABLE access_group_doors(access_group_id int,device_id int,schedule_template_id int)',
      'CREATE TABLE access_schedule_templates(id int,company_id int,week_plan_id int)',
      'CREATE TABLE attendance_devices(id int,company_id int)',
      'CREATE TABLE employees(id int,company_id int)',
      'CREATE TABLE employee_access_credentials(company_id int,employee_id int,employee_no varchar(100),device_id int,credential_type text,credential_no text,pin_password text,card_no text,fingerprint_id text,card_reader_no int,face_id text,fingerprint_count int,face_count int,has_fingerprint boolean,has_face boolean,password_set boolean,credential_status text,issue_date date,expiry_date date,is_primary boolean,deleted_at timestamp,last_synced_at timestamp)',
    ])
      await client.query(sql);
    const runner = {
      query: async (sql: string, params?: unknown[]) =>
        (await client.query(sql, params)).rows,
    } as unknown as QueryRunner;
    await new AllowDirectAccessReconciliation1797900090000().up(runner);
  });
  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('captures direct changes and imported members without recording heartbeat-only updates', async () => {
    const migration = new CaptureDirectAccessChanges1797900091000();
    const runner = {
      query: (sql: string, params?: unknown[]) => client.query(sql, params),
    } as unknown as QueryRunner;
    await migration.up(runner);
    await client.query('SAVEPOINT access_capture_rollback');
    await client.query(
      "INSERT INTO employee_device_assignments(id,company_id,employee_id,device_id,employee_no) VALUES (99,10,20,30,'20')",
    );
    await client.query('ROLLBACK TO SAVEPOINT access_capture_rollback');
    expect(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM access_reconciliation_operations',
        )
      ).rows[0].count,
    ).toBe(0);
    await client.query(
      "INSERT INTO employee_device_assignments(id,company_id,employee_id,device_id,employee_no) VALUES (1,10,20,30,'20')",
    );
    await client.query(
      'UPDATE employee_device_assignments SET last_synced_at=now() WHERE id=1',
    );
    await client.query(
      "INSERT INTO employee_device_right_plans VALUES (1,30,5,1,6,'1',true)",
    );
    await client.query(
      'UPDATE employee_device_assignments SET device_id=31 WHERE id=1',
    );
    await client.query('DELETE FROM employee_device_assignments WHERE id=1');
    await client.query('INSERT INTO access_groups VALUES (2,10)');
    await client.query('INSERT INTO attendance_devices VALUES (30,10)');
    await client.query('INSERT INTO access_group_devices VALUES (2,30)');
    await client.query(
      "INSERT INTO access_group_employees VALUES (2,20,null,'20','DEVICE_SYNC'), (2,21,null,'21','MANUAL'), (2,null,null,'unlinked','DEVICE_SYNC')",
    );
    await client.query(
      "UPDATE access_group_employees SET employee_id = NULL WHERE employee_no = '21'",
    );
    await client.query(
      "INSERT INTO employee_access_credentials(company_id,employee_id,employee_no,device_id,credential_type,pin_password) VALUES (10,20,'20',30,'PIN','secret-test-value')",
    );
    await client.query(
      'UPDATE employee_access_credentials SET last_synced_at=now()',
    );
    const result = await client.query<{ device_id: number; reason: string }>(
      'SELECT device_id,reason FROM access_reconciliation_operations ORDER BY ctid',
    );
    expect(result.rows.map((row) => `${row.device_id}:${row.reason}`)).toEqual([
      '30:DIRECT_CHANGED',
      '30:DIRECT_RIGHTS',
      '30:DIRECT_REMOVED',
      '31:DIRECT_CHANGED',
      '31:DIRECT_REMOVED',
      '30:MEMBERSHIP_CHANGED',
      '30:MEMBERSHIP_CHANGED',
      '30:MEMBERSHIP_CHANGED',
      '30:MEMBERSHIP_CHANGED',
      '30:CREDENTIAL_CHANGED',
    ]);
    expect(JSON.stringify(result.rows)).not.toContain('secret-test-value');
    const unresolved = await client.query(
      'SELECT unresolved_employee_no FROM access_reconciliation_operations WHERE employee_id IS NULL',
    );
    expect(unresolved.rows).toEqual([
      { unresolved_employee_no: 'unlinked' },
      { unresolved_employee_no: '21' },
    ]);
    await migration.down(runner);
  });

  it('captures group and direct targets for transfers and schedules within the tenant', async () => {
    await client.query(
      'TRUNCATE access_reconciliation_operations, employee_device_assignments, employee_device_right_plans, access_groups, access_group_employees, access_group_devices, access_group_doors, access_schedule_templates, attendance_devices',
    );
    await client.query('INSERT INTO access_groups VALUES (10,1),(11,2)');
    await client.query(
      "INSERT INTO access_group_employees VALUES (10,50,null,'50','MANUAL'),(11,50,null,'50','MANUAL')",
    );
    await client.query(
      'INSERT INTO access_group_devices VALUES (10,40),(11,41)',
    );
    await client.query(
      'INSERT INTO access_group_doors VALUES (10,40,20),(11,41,21)',
    );
    await client.query(
      'INSERT INTO access_schedule_templates VALUES (20,1,30),(21,2,30)',
    );
    await client.query('INSERT INTO attendance_devices VALUES (40,1),(41,2)');
    await client.query(
      "INSERT INTO employee_device_assignments(id,company_id,employee_id,device_id,employee_no) VALUES (60,1,50,40,'50')",
    );
    await client.query(
      "INSERT INTO employee_device_right_plans VALUES (60,40,5,1,20,'1',true)",
    );
    const manager = {
      query: (sql: string, params: unknown[]) => client.query(sql, params),
    } as unknown as EntityManager;
    await recordEmployeeReconciliation(
      manager,
      1,
      50,
      99,
      'EMPLOYEE_TRANSFER',
      '2030-01-15',
    );
    await recordScheduleReconciliation(manager, 1, 'week_plan', 30, 99);
    const result = await client.query<{
      company_id: number;
      employee_id: number;
      device_id: number;
      source_group_id: number | null;
      reason: string;
    }>(
      'SELECT company_id,employee_id,device_id,source_group_id,reason FROM access_reconciliation_operations ORDER BY reason,source_group_id NULLS LAST',
    );
    expect(result.rows).toHaveLength(4);
    expect(
      result.rows.every(
        (row) =>
          row.company_id === 1 &&
          row.employee_id === 50 &&
          row.device_id === 40,
      ),
    ).toBe(true);
    expect(
      result.rows.filter((row) => row.source_group_id === null),
    ).toHaveLength(2);
    const dates = await client.query(
      "SELECT effective_date::text FROM access_reconciliation_operations WHERE reason = 'EMPLOYEE_TRANSFER'",
    );
    expect(dates.rows).toEqual([
      { effective_date: '2030-01-15' },
      { effective_date: '2030-01-15' },
    ]);
    const migration = new CaptureDirectAccessChanges1797900091000();
    const runner = {
      query: (sql: string, params?: unknown[]) => client.query(sql, params),
    } as unknown as QueryRunner;
    await migration.up(runner);
    await client.query(
      "INSERT INTO employee_access_credentials(company_id,employee_id,employee_no,device_id,credential_type,card_no) VALUES (1,50,'50',NULL,'CARD','secret-card-number')",
    );
    const credentialRows = await client.query(
      "SELECT company_id,employee_id,device_id,source_group_id,reason FROM access_reconciliation_operations WHERE reason = 'CREDENTIAL_CHANGED'",
    );
    expect(credentialRows.rows).toHaveLength(2);
    expect(
      credentialRows.rows.every(
        (row: { company_id: number; employee_id: number; device_id: number }) =>
          row.company_id === 1 &&
          row.employee_id === 50 &&
          row.device_id === 40,
      ),
    ).toBe(true);
    expect(JSON.stringify(credentialRows.rows)).not.toContain(
      'secret-card-number',
    );
    await migration.down(runner);
  });

  it('refuses to revert while direct or unresolved history exists', async () => {
    const runner = {
      query: async (sql: string, params?: unknown[]) =>
        (await client.query(sql, params)).rows,
    } as unknown as QueryRunner;
    const migration = new AllowDirectAccessReconciliation1797900090000();
    await expect(migration.down(runner)).rejects.toThrow(
      'Cannot revert while direct reconciliation records exist',
    );
    await client.query('TRUNCATE access_reconciliation_operations');
    await migration.down(runner);
  });
});
