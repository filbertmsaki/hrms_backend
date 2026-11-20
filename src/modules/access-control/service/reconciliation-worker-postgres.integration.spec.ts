import { Client } from 'pg';
import type { QueryRunner } from 'typeorm';
import { AccessReconciliationWorker1797900100000 } from '../../../database/migrations/1797900100000-AccessReconciliationWorker';

const run =
  process.env.RUN_ACCESS_CAPTURE_PG_TEST === '1' ? describe : describe.skip;

run('reconciliation worker migration on PostgreSQL', () => {
  let client: Client;
  let runner: QueryRunner;
  const migration = new AccessReconciliationWorker1797900100000();

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
    const schema = `access_worker_test_${process.pid}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`CREATE TABLE access_reconciliation_operations (
      id serial PRIMARY KEY, status varchar(32) NOT NULL DEFAULT 'PENDING_REVIEW'
    )`);
    runner = {
      query: async (sql: string, params?: unknown[]) =>
        (await client.query(sql, params)).rows,
    } as unknown as QueryRunner;
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('creates disabled settings and refuses a rollback that would discard state', async () => {
    await migration.up(runner);
    await client.query(
      'INSERT INTO access_reconciliation_settings(company_id) VALUES (1)',
    );
    expect(
      (await client.query('SELECT enabled FROM access_reconciliation_settings'))
        .rows[0].enabled,
    ).toBe(false);
    await client.query(
      "INSERT INTO access_reconciliation_operations(status, attempt_count) VALUES ('FAILED', 1)",
    );
    await expect(migration.down(runner)).rejects.toThrow('processing history');
    await client.query('DELETE FROM access_reconciliation_operations');
    await migration.down(runner);
    expect(
      (
        await client.query(
          "SELECT to_regclass('access_reconciliation_settings') AS name",
        )
      ).rows[0].name,
    ).toBeNull();
  });
});
