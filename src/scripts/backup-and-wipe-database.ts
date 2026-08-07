import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { AppDataSource } from '../database/data-source';

dotenv.config();

type CliOptions = {
  backupOnly: boolean;
  dryRun: boolean;
  yes: boolean;
};

type UserTable = {
  schemaName: string;
  tableName: string;
  qualifiedName: string;
};

type BackupPlan = {
  command: string;
  format: 'plain' | 'custom';
  filePath: string;
  database: string;
};

function parseBoolean(
  value: string | boolean | undefined,
  defaultValue: boolean,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

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
  const args = new Set(argv);

  return {
    backupOnly: args.has('--backup-only'),
    dryRun: args.has('--dry-run'),
    yes: args.has('--yes'),
  };
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function getDatabaseName(): string {
  return process.env.DB_NAME?.trim() || 'hrms_db';
}

function getBackupFormat(): 'plain' | 'custom' {
  const configured = process.env.DB_BACKUP_FORMAT?.trim().toLowerCase();

  if (configured === 'plain') {
    return 'plain';
  }

  return 'custom';
}

function buildBackupPlan(): BackupPlan {
  const database = getDatabaseName();
  const backupDir = path.resolve(
    process.cwd(),
    process.env.DB_BACKUP_DIR?.trim() || 'backups/database',
  );
  const format = getBackupFormat();
  const extension = format === 'plain' ? 'sql' : 'dump';
  const fileName = `${sanitizeFileSegment(database)}-${formatTimestamp(new Date())}.${extension}`;

  return {
    command: process.env.DB_BACKUP_COMMAND?.trim() || 'pg_dump',
    format,
    filePath: path.join(backupDir, fileName),
    database,
  };
}

function buildSummary(tables: UserTable[]) {
  const schemas = tables.reduce<Record<string, number>>((accumulator, table) => {
    accumulator[table.schemaName] = (accumulator[table.schemaName] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    tableCount: tables.length,
    schemas,
    sampleTables: tables.slice(0, 20).map((table) => table.qualifiedName),
  };
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

    child.once('error', (error) => {
      reject(error);
    });

    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command "${command}" exited with code ${code ?? 'unknown'}.`));
    });
  });
}

async function createBackup(plan: BackupPlan): Promise<void> {
  await mkdir(path.dirname(plan.filePath), { recursive: true });

  const args = [
    '--host',
    process.env.DB_HOST?.trim() || 'localhost',
    '--port',
    String(parseNumber(process.env.DB_PORT, 5432)),
    '--username',
    process.env.DB_USERNAME?.trim() || 'postgres',
    '--dbname',
    plan.database,
    '--file',
    plan.filePath,
    '--format',
    plan.format === 'plain' ? 'plain' : 'custom',
    '--no-owner',
    '--no-privileges',
  ];

  if (plan.format === 'plain') {
    args.push('--clean', '--if-exists', '--encoding', 'UTF8');
  } else {
    args.push(
      '--compress',
      String(parseNumber(process.env.DB_BACKUP_COMPRESS_LEVEL, 9)),
    );
  }

  const commandEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD || '',
    PGSSLMODE: parseBoolean(process.env.DB_SSL_ENABLED, false)
      ? 'require'
      : 'disable',
  };

  console.log(
    `[db:wipe] Creating ${plan.format} backup for "${plan.database}" at "${plan.filePath}".`,
  );

  try {
    await runProcess(plan.command, args, commandEnv);
  } catch (error) {
    if (
      error instanceof Error &&
      /ENOENT/i.test(error.message) &&
      plan.command === 'pg_dump'
    ) {
      throw new Error(
        'pg_dump was not found on PATH. Set DB_BACKUP_COMMAND to the full pg_dump executable path before running the wipe.',
      );
    }

    throw error;
  }
}

async function loadUserTables(): Promise<UserTable[]> {
  const rows = (await AppDataSource.query(
    `
      SELECT
        schemaname AS "schemaName",
        tablename AS "tableName",
        format('%I.%I', schemaname, tablename) AS "qualifiedName"
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        AND NOT (schemaname = 'public' AND tablename IN ('migrations', 'typeorm_metadata'))
      ORDER BY schemaname, tablename
    `,
  )) as UserTable[];

  return rows;
}

async function writeMetadataFile(
  plan: BackupPlan,
  details: Record<string, unknown>,
): Promise<void> {
  const metadataPath = `${plan.filePath}.json`;
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        database: plan.database,
        backupCommand: plan.command,
        backupFormat: plan.format,
        backupFile: plan.filePath,
        ...details,
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function wipeTables(tables: UserTable[]): Promise<void> {
  if (tables.length === 0) {
    console.log('[db:wipe] No user tables found to truncate.');
    return;
  }

  const truncateStatement = `TRUNCATE TABLE ${tables
    .map((table) => table.qualifiedName)
    .join(', ')} RESTART IDENTITY CASCADE`;

  await AppDataSource.transaction(async (manager) => {
    await manager.query(truncateStatement);
  });
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const plan = buildBackupPlan();

  if (!options.dryRun && !options.backupOnly && !options.yes) {
    throw new Error(
      'Refusing to wipe the database without explicit confirmation. Re-run with "--yes" after reviewing "npm run db:wipe:dry-run".',
    );
  }

  if (options.dryRun) {
    await AppDataSource.initialize();

    try {
      const tables = await loadUserTables();
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            database: plan.database,
            backupRequiredForRealRun: true,
            configuredBackupCommand: plan.command,
            configuredBackupFormat: plan.format,
            metadataProtectedTables: ['public.migrations', 'public.typeorm_metadata'],
            ...buildSummary(tables),
          },
          null,
          2,
        ),
      );
    } finally {
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
    }

    return;
  }

  await createBackup(plan);
  await writeMetadataFile(plan, {
    operation: options.backupOnly ? 'backup-only' : 'backup-and-wipe',
    status: options.backupOnly ? 'backup-complete' : 'backup-complete-pending-wipe',
  });

  if (options.backupOnly) {
    console.log(`[db:wipe] Backup completed successfully: "${plan.filePath}"`);
    return;
  }

  await AppDataSource.initialize();

  try {
    const tables = await loadUserTables();
    const summary = buildSummary(tables);

    console.log(
      `[db:wipe] Truncating ${summary.tableCount} tables across ${Object.keys(summary.schemas).length} schemas.`,
    );

    await wipeTables(tables);
    await writeMetadataFile(plan, {
      operation: 'backup-and-wipe',
      status: 'completed',
      wipedTables: summary.tableCount,
      schemaBreakdown: summary.schemas,
    });

    console.log('[db:wipe] Database wipe completed successfully.');
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
