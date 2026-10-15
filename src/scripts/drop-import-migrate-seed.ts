import { spawn } from 'child_process';
import { access, mkdir } from 'fs/promises';
import * as path from 'path';
import { Client } from 'pg';
import { applyCommandEnv } from '../database/load-command-env';

type Options = {
  file: string;
  database: string;
  execute: boolean;
  confirmation: string | null;
};

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();
  let execute = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--execute') {
      execute = true;
      continue;
    }
    if (argv[i].startsWith('--')) {
      const value = argv[i + 1];
      if (!value || value.startsWith('--'))
        throw new Error(`Missing value for ${argv[i]}.`);
      values.set(argv[i].slice(2), value);
      i += 1;
    }
  }
  const database =
    values.get('database')?.trim() || process.env.DB_NAME?.trim();
  if (!database || !/^[a-zA-Z0-9_]+$/.test(database))
    throw new Error('Provide a valid --database name or set DB_NAME.');
  if (['postgres', 'template0', 'template1'].includes(database))
    throw new Error('Refusing to drop a PostgreSQL system database.');
  const file = path.resolve(
    process.cwd(),
    values.get('file') || 'src/database/seeds/dump/hrms_db_2026-09-28.dump',
  );
  if (!file.toLowerCase().endsWith('.dump'))
    throw new Error('Expected a PostgreSQL custom-format .dump file.');
  return {
    file,
    database,
    execute,
    confirmation: values.get('confirm-drop')?.trim() || null,
  };
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command exited with code ${code ?? 'unknown'}.`)),
    );
  });
}

async function recreateDatabase(
  database: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const admin = new Client({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || '',
    database: 'postgres',
  });
  await admin.connect();
  try {
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
      [database],
    );
    await admin.query(
      `DROP DATABASE IF EXISTS "${database.replace(/"/g, '""')}"`,
    );
    await admin.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }
}

async function databaseExists(
  database: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const client = new Client({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || '',
    database: 'postgres',
  });
  await client.connect();
  try {
    const result = await client.query<{ found: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS found',
      [database],
    );
    return result.rows[0]?.found ?? false;
  } finally {
    await client.end();
  }
}

async function assertDatabaseRecreationPermission(
  database: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const client = new Client({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USERNAME || 'postgres',
    password: env.DB_PASSWORD || '',
    database: 'postgres',
  });
  await client.connect();
  try {
    const roleResult = await client.query<{
      is_superuser: boolean;
      can_create_database: boolean;
    }>(
      `SELECT rolsuper AS is_superuser, rolcreatedb AS can_create_database
       FROM pg_roles
       WHERE rolname = current_user`,
    );
    const role = roleResult.rows[0];
    if (!role || (!role.is_superuser && !role.can_create_database)) {
      throw new Error(
        `PostgreSQL role "${env.DB_USERNAME || 'postgres'}" lacks CREATEDB. ` +
          `Grant CREATEDB before this workflow; database "${database}" was not changed.`,
      );
    }

    const databaseResult = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(datdba) AS owner
       FROM pg_database
       WHERE datname = $1`,
      [database],
    );
    const owner = databaseResult.rows[0]?.owner;
    if (owner && !role.is_superuser && owner !== env.DB_USERNAME) {
      throw new Error(
        `PostgreSQL role "${env.DB_USERNAME || 'postgres'}" does not own ` +
          `database "${database}". Database was not changed.`,
      );
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  applyCommandEnv();
  const options = parseArgs(process.argv.slice(2));
  await access(options.file);
  const env: NodeJS.ProcessEnv = { ...process.env, DB_NAME: options.database };
  const restoreCommand =
    env.DB_RESTORE_COMMAND?.trim() ||
    (env.DB_BACKUP_COMMAND?.trim()
      ? path.join(
          path.dirname(env.DB_BACKUP_COMMAND.trim()),
          process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore',
        )
      : 'pg_restore');
  const backupCommand =
    env.DB_BACKUP_COMMAND?.trim() ||
    (env.DB_RESTORE_COMMAND?.trim()
      ? path.join(
          path.dirname(env.DB_RESTORE_COMMAND.trim()),
          process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump',
        )
      : 'pg_dump');
  const restoreArgs = [
    '--host',
    env.DB_HOST?.trim() || 'localhost',
    '--port',
    String(Number(env.DB_PORT || 5432)),
    '--username',
    env.DB_USERNAME?.trim() || 'postgres',
    '--dbname',
    options.database,
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    options.file,
  ];
  const aliasResolver = path.resolve(
    'deploy/hrms-backend/register-src-alias.cjs',
  );
  const runningFromSource = __filename.endsWith('.ts');
  const tsNode = path.resolve('node_modules/ts-node/register');
  const tsPaths = path.resolve('node_modules/tsconfig-paths/register');
  const typeorm = path.resolve('node_modules/typeorm/cli.js');
  const dataSource = path.resolve('dist/database/data-source.js');
  const sourceDataSource = path.resolve('src/database/data-source.ts');
  const migrateArgs = runningFromSource
    ? [
        '-r',
        tsNode,
        '-r',
        tsPaths,
        typeorm,
        '--dataSource',
        sourceDataSource,
        'migration:run',
      ]
    : [
        '-r',
        aliasResolver,
        typeorm,
        '--dataSource',
        dataSource,
        'migration:run',
      ];
  const seedArgs = runningFromSource
    ? [
        '-r',
        tsNode,
        '-r',
        tsPaths,
        path.resolve('src/database/seeds/run-seed.ts'),
      ]
    : ['-r', aliasResolver, path.resolve('dist/database/seeds/run-seed.js')];

  console.log(
    JSON.stringify(
      {
        mode: options.execute ? 'execute' : 'dry-run',
        dump: options.file,
        database: options.database,
        steps: [
          'terminate connections and drop target database',
          'create empty target database',
          'restore dump',
          'run pending migrations',
          'run standard HRMS seed chain',
        ],
        executionRequires: `--execute --confirm-drop ${options.database}`,
        preDropBackup:
          'On execution, an existing target is backed up and checked with pg_restore --list before it is dropped.',
      },
      null,
      2,
    ),
  );
  if (!options.execute) return;
  if (options.confirmation !== options.database)
    throw new Error(
      `Destructive execution requires --confirm-drop ${options.database}.`,
    );

  await assertDatabaseRecreationPermission(options.database, env);

  if (await databaseExists(options.database, env)) {
    const backupDir = path.resolve(
      env.DB_BACKUP_DIR?.trim() || 'backups/database',
    );
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    const backupFile = path.join(
      backupDir,
      `${options.database}_before_import_${stamp}.dump`,
    );
    const dumpArgs = [
      '--host',
      env.DB_HOST?.trim() || 'localhost',
      '--port',
      String(Number(env.DB_PORT || 5432)),
      '--username',
      env.DB_USERNAME?.trim() || 'postgres',
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      backupFile,
      options.database,
    ];
    console.log(`[import] Backing up existing database to ${backupFile}.`);
    await run(backupCommand, dumpArgs, {
      ...env,
      PGPASSWORD: env.DB_PASSWORD || '',
    });
    await run(restoreCommand, ['--list', backupFile], {
      ...env,
      PGPASSWORD: env.DB_PASSWORD || '',
    });
    console.log('[import] Existing database backup archive verified.');
  }
  console.log(`[import] Dropping and recreating ${options.database}.`);
  await recreateDatabase(options.database, env);
  console.log('[import] Restoring dump.');
  await run(restoreCommand, restoreArgs, {
    ...env,
    PGPASSWORD: env.DB_PASSWORD || '',
  });
  console.log('[import] Running pending migrations.');
  await run(process.execPath, migrateArgs, env);
  console.log('[import] Running standard HRMS seeders.');
  await run(process.execPath, seedArgs, env);
  console.log(`[import] Complete. Database: ${options.database}`);
}

main().catch((error: unknown) => {
  console.error(
    `[drop-import-migrate-seed] ${error instanceof Error ? error.message : 'Workflow failed.'}`,
  );
  process.exitCode = 1;
});
