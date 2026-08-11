import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import { access, readdir } from 'fs/promises';
import * as path from 'path';
import { Client } from 'pg';

dotenv.config();

type CliOptions = {
  dryRun: boolean;
  filePath: string | null;
  latest: boolean;
  recreateDb: boolean;
  yes: boolean;
};

type BackupTarget = {
  filePath: string;
  format: 'custom' | 'plain';
};

function parseNumber(
  value: string | number | undefined,
  defaultValue: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseCliOptions(argv: string[]): CliOptions {
  let filePath: string | null = null;
  let latest = false;
  let recreateDb = false;
  let dryRun = false;
  let yes = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--file') {
      filePath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (argument === '--latest') {
      latest = true;
      continue;
    }

    if (argument === '--recreate-db') {
      recreateDb = true;
      continue;
    }

    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (argument === '--yes') {
      yes = true;
    }
  }

  return { dryRun, filePath, latest, recreateDb, yes };
}

function getDatabaseName(): string {
  return process.env.DB_NAME?.trim() || 'hrms_db';
}

function getBackupDirectory(): string {
  return path.resolve(
    process.cwd(),
    process.env.DB_BACKUP_DIR?.trim() || 'backups/database',
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function resolveSiblingExecutable(
  configuredExecutable: string | undefined,
  siblingName: string,
): string | null {
  const command = configuredExecutable?.trim();

  if (!command) {
    return null;
  }

  if (!path.isAbsolute(command)) {
    return null;
  }

  return path.join(path.dirname(command), siblingName);
}

function resolveRestoreCommand(format: 'custom' | 'plain'): string {
  if (format === 'custom') {
    return (
      process.env.DB_RESTORE_COMMAND?.trim() ||
      resolveSiblingExecutable(
        process.env.DB_BACKUP_COMMAND,
        'pg_restore.exe',
      ) ||
      'pg_restore'
    );
  }

  return (
    process.env.DB_PSQL_COMMAND?.trim() ||
    resolveSiblingExecutable(process.env.DB_BACKUP_COMMAND, 'psql.exe') ||
    'psql'
  );
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveLatestBackup(): Promise<string> {
  const backupDirectory = getBackupDirectory();
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.dump') || name.endsWith('.sql'))
    .sort()
    .reverse();

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`No backup files were found in "${backupDirectory}".`);
  }

  return path.join(backupDirectory, latest);
}

async function resolveBackupTarget(options: CliOptions): Promise<BackupTarget> {
  let resolvedFilePath: string | null = null;

  if (options.filePath) {
    resolvedFilePath = path.resolve(process.cwd(), options.filePath);
  } else if (options.latest) {
    resolvedFilePath = await resolveLatestBackup();
  }

  if (!resolvedFilePath) {
    throw new Error(
      'Provide a backup file with "--file <path>" or use "--latest" to restore the newest backup.',
    );
  }

  if (!(await fileExists(resolvedFilePath))) {
    throw new Error(`Backup file not found: "${resolvedFilePath}".`);
  }

  if (resolvedFilePath.endsWith('.dump')) {
    return {
      filePath: resolvedFilePath,
      format: 'custom',
    };
  }

  if (resolvedFilePath.endsWith('.sql')) {
    return {
      filePath: resolvedFilePath,
      format: 'plain',
    };
  }

  throw new Error(
    'Unsupported backup file format. Supported extensions are ".dump" and ".sql".',
  );
}

async function runProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: false,
    });

    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command "${command}" exited with code ${code ?? 'unknown'}.`,
        ),
      );
    });
  });
}

async function recreateDatabase(database: string): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseNumber(process.env.DB_PORT, 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  });

  await client.connect();

  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [database],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
  } finally {
    await client.end();
  }
}

async function restoreCustomBackup(
  restoreCommand: string,
  target: BackupTarget,
  database: string,
  recreateDb: boolean,
): Promise<void> {
  const args = [
    '--host',
    process.env.DB_HOST?.trim() || 'localhost',
    '--port',
    String(parseNumber(process.env.DB_PORT, 5432)),
    '--username',
    process.env.DB_USERNAME?.trim() || 'postgres',
    '--dbname',
    database,
    '--no-owner',
    '--no-privileges',
  ];

  if (!recreateDb) {
    args.push('--clean', '--if-exists');
  }

  args.push(target.filePath);

  await runProcess(restoreCommand, args, {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD || '',
  });
}

async function restorePlainBackup(
  restoreCommand: string,
  target: BackupTarget,
  database: string,
): Promise<void> {
  const args = [
    '--host',
    process.env.DB_HOST?.trim() || 'localhost',
    '--port',
    String(parseNumber(process.env.DB_PORT, 5432)),
    '--username',
    process.env.DB_USERNAME?.trim() || 'postgres',
    '--dbname',
    database,
    '--set',
    'ON_ERROR_STOP=1',
    '--file',
    target.filePath,
  ];

  await runProcess(restoreCommand, args, {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD || '',
  });
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const database = getDatabaseName();
  const target = await resolveBackupTarget(options);
  const restoreCommand = resolveRestoreCommand(target.format);

  if (!options.dryRun && !options.yes) {
    throw new Error(
      'Refusing to restore without explicit confirmation. Re-run with "--yes" after reviewing "npm run db:restore:dry-run".',
    );
  }

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          database,
          restoreCommand,
          recreateDb: options.recreateDb,
          backupFile: target.filePath,
          backupFormat: target.format,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `[db:restore] Restoring "${target.filePath}" into database "${database}".`,
  );

  if (options.recreateDb) {
    console.log(
      `[db:restore] Recreating database "${database}" before restore.`,
    );
    await recreateDatabase(database);
  }

  try {
    if (target.format === 'custom') {
      await restoreCustomBackup(
        restoreCommand,
        target,
        database,
        options.recreateDb,
      );
    } else {
      await restorePlainBackup(restoreCommand, target, database);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /ENOENT/i.test(error.message) &&
      target.format === 'custom'
    ) {
      throw new Error(
        'pg_restore was not found. Set DB_RESTORE_COMMAND or keep DB_BACKUP_COMMAND pointing to the PostgreSQL bin directory.',
      );
    }

    if (
      error instanceof Error &&
      /ENOENT/i.test(error.message) &&
      target.format === 'plain'
    ) {
      throw new Error(
        'psql was not found. Set DB_PSQL_COMMAND or keep DB_BACKUP_COMMAND pointing to the PostgreSQL bin directory.',
      );
    }

    throw error;
  }

  console.log('[db:restore] Restore completed successfully.');
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
