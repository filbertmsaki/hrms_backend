import { Client } from 'pg';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'path';
import { loadCommandEnv } from './load-command-env';
import { createBaseTypeOrmOptionsFromEnv } from './typeorm-options';

async function main(): Promise<void> {
  const env = loadCommandEnv(process.env);
  if (env.APP_ENV !== 'uat') {
    throw new Error('UAT metadata export requires APP_ENV=uat');
  }
  const outputIndex = process.argv.indexOf('--output');
  const output = process.argv[outputIndex + 1];
  const sharedDir = env.BASE_DIR ? resolve(env.BASE_DIR, 'shared') : '';
  if (
    !output ||
    !isAbsolute(output) ||
    !sharedDir ||
    !resolve(output).startsWith(`${sharedDir}${sep}`)
  ) {
    throw new Error(
      'Output must be a new file inside the configured UAT shared directory',
    );
  }
  const options = createBaseTypeOrmOptionsFromEnv(env);
  if (options.type !== 'postgres') throw new Error('PostgreSQL is required');
  const sql = await readFile(
    resolve(process.cwd(), 'docs/kpi-uat-metadata.sql'),
    'utf8',
  );
  const client = new Client({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    database: options.database,
    ssl:
      options.ssl === false
        ? false
        : {
            rejectUnauthorized:
              options.ssl === true
                ? true
                : (options.ssl?.rejectUnauthorized ?? true),
          },
    application_name: 'hrms-kpi-uat-metadata',
    options: '-c default_transaction_read_only=on -c statement_timeout=15000',
  });
  await client.connect();
  let result: unknown;
  try {
    // The checked-in SQL starts a READ ONLY transaction and selects schema
    // metadata only. Its final statement rolls that transaction back.
    result = await client.query(sql);
  } finally {
    await client.end();
  }
  if (
    !Array.isArray(result) ||
    !result.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'command' in entry &&
        typeof entry.command === 'string' &&
        'rows' in entry &&
        Array.isArray(entry.rows),
    )
  ) {
    throw new Error('Unexpected metadata query result');
  }
  const selections = (result as { command: string; rows: unknown[] }[])
    .filter((entry) => entry.command === 'SELECT')
    .map((entry) => entry.rows);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(
    output,
    JSON.stringify({ exportedAt: new Date().toISOString(), selections }),
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  console.log(
    `Read-only UAT metadata export saved to the configured shared directory (${selections.length} result sets).`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'UAT metadata export failed',
  );
  process.exitCode = 1;
});
