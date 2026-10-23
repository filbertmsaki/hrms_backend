const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exitCode = 1;
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function main() {
  const env = process.env;
  const databaseName = env.DB_NAME?.trim() ?? '';
  const validAppEnv = env.APP_ENV?.trim().toLowerCase() === 'uat';
  const safeDatabaseName =
    /(^|[_-])(uat|test|sandbox)([_-]|$)/i.test(databaseName) &&
    !/(^|[_-])(prod|production)([_-]|$)/i.test(databaseName);

  if (!validAppEnv) fail('APP_ENV must be exactly "uat".');
  if (!safeDatabaseName)
    fail(
      'DB_NAME must clearly identify an isolated UAT, test, or sandbox database.',
    );
  if (env.ATTENDANCE_UAT_CONFIRM_DB?.trim() !== databaseName || !databaseName) {
    fail(
      'Set ATTENDANCE_UAT_CONFIRM_DB to the exact DB_NAME after verifying the target database.',
    );
  }

  const evidenceGates = [
    ['ATTENDANCE_UAT_FIXTURE_EVIDENCE_REF', 'synthetic fixture inventory'],
    ['ATTENDANCE_UAT_CRON_QUEUE_EVIDENCE_REF', 'queue/cron health evidence'],
    ['ATTENDANCE_UAT_NOTIFICATION_SINK_REF', 'notification sink evidence'],
    ['ATTENDANCE_UAT_BACKUP_EVIDENCE_REF', 'backup/restore evidence'],
  ];
  for (const [key, label] of evidenceGates) {
    if (!present(env[key]))
      fail(`Provide ${key} with the evidence reference for ${label}.`);
  }
  if (
    env.ATTENDANCE_UAT_PAYROLL_PREVIEW_LOCKED?.trim().toLowerCase() !== 'true'
  ) {
    fail(
      'Set ATTENDANCE_UAT_PAYROLL_PREVIEW_LOCKED=true only after confirming payroll posting/payment is disabled.',
    );
  }

  if (process.exitCode) return;
  if (
    !present(env.DB_HOST) ||
    !present(env.DB_USERNAME) ||
    !present(env.DB_PASSWORD)
  ) {
    fail(
      'Database connection settings are incomplete; values are never printed by this script.',
    );
    return;
  }

  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: databaseName,
    ssl: /^(true|1|yes|on)$/i.test(env.DB_SSL_ENABLED ?? '')
      ? {
          rejectUnauthorized: !/^(false|0|no|off)$/i.test(
            env.DB_SSL_REJECT_UNAUTHORIZED ?? 'true',
          ),
        }
      : false,
    connectionTimeoutMillis: Number(env.DB_CONNECTION_TIMEOUT_MS || 10000),
    application_name: 'module-6-uat-read-only-preflight',
  });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const identity = await client.query(
      `SELECT current_database() AS database_name,
              current_schema() AS schema_name,
              current_setting('transaction_read_only') AS transaction_read_only`,
    );
    const row = identity.rows[0];
    if (
      row.database_name !== databaseName ||
      row.transaction_read_only !== 'on'
    ) {
      fail(
        'Connected database identity or read-only transaction check did not match.',
      );
      return;
    }
    console.log(
      `Database identity: ${row.database_name} (schema ${row.schema_name}; transaction read-only)`,
    );

    const migrationTable = await client.query(
      "SELECT to_regclass('public.migrations') AS table_name",
    );
    if (!migrationTable.rows[0]?.table_name) {
      fail('public.migrations is missing; migration state cannot be verified.');
      return;
    }

    const appliedResult = await client.query(
      'SELECT name FROM public.migrations ORDER BY timestamp, id',
    );
    const applied = new Set(
      appliedResult.rows.map((migration) => String(migration.name)),
    );
    const migrationDirectory = path.resolve(
      __dirname,
      '../src/database/migrations',
    );
    const expected = new Set();
    for (const fileName of fs
      .readdirSync(migrationDirectory)
      .filter((file) => /\.ts$/.test(file))) {
      const source = fs.readFileSync(
        path.join(migrationDirectory, fileName),
        'utf8',
      );
      for (const match of source.matchAll(
        /export\s+class\s+([A-Za-z0-9_]+)\s+implements\s+MigrationInterface/g,
      )) {
        expected.add(match[1]);
      }
    }
    const pending = [...expected].filter((name) => !applied.has(name)).sort();
    const unknown = [...applied].filter((name) => !expected.has(name)).sort();
    console.log(
      `Migrations: ${applied.size} applied; ${pending.length} pending; ${unknown.length} applied names absent from this checkout.`,
    );
    if (pending.length) {
      console.error(
        `Pending migrations:\n${pending.map((name) => `- ${name}`).join('\n')}`,
      );
      fail(
        'Apply and review required migrations in the isolated UAT database before write tests.',
      );
    }
    if (unknown.length) {
      console.error(
        `Unmatched applied migrations:\n${unknown.map((name) => `- ${name}`).join('\n')}`,
      );
      fail(
        'Migration history differs from this checkout; investigate before UAT.',
      );
    }
    if (!process.exitCode)
      console.log(
        'Preflight gates passed. This check did not write data or execute attendance scenarios.',
      );
  } catch (error) {
    fail(
      `Read-only database verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {}
    await client.end().catch(() => undefined);
  }
}

main().catch((error) =>
  fail(error instanceof Error ? error.message : 'unknown preflight error'),
);
