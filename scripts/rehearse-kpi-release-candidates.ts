import { DataSource, MigrationInterface } from 'typeorm';
import { createAppDataSourceOptions } from '../src/database/typeorm-options';
import { loadCommandEnv } from '../src/database/load-command-env';
import { KpiFoundation1797900000000 } from '../src/database/kpi-release-candidates/1797900000000-KpiFoundation';
import { KpiScorecards1797900001000 } from '../src/database/kpi-release-candidates/1797900001000-KpiScorecards';
import { KpiAchievements1797900002000 } from '../src/database/kpi-release-candidates/1797900002000-KpiAchievements';
import { KpiEvaluations1797900003000 } from '../src/database/kpi-release-candidates/1797900003000-KpiEvaluations';
import { KpiEvaluationDeadlines1797900004000 } from '../src/database/kpi-release-candidates/1797900004000-KpiEvaluationDeadlines';

const candidates: (new () => MigrationInterface)[] = [
  KpiFoundation1797900000000,
  KpiScorecards1797900001000,
  KpiAchievements1797900002000,
  KpiEvaluations1797900003000,
  KpiEvaluationDeadlines1797900004000,
];

async function main(): Promise<void> {
  const env = loadCommandEnv(process.env);
  const dbName = process.env.DB_NAME;
  const host = process.env.DB_HOST;
  if (
    !dbName?.startsWith('hrms_kpi_release_rehearsal_') ||
    !host ||
    !['localhost', '127.0.0.1', '::1', '/var/run/postgresql'].includes(host) ||
    env.DB_NAME !== dbName ||
    env.DB_HOST !== host
  ) {
    throw new Error(
      'Rehearsal requires an explicitly selected, dedicated local database',
    );
  }

  const options = createAppDataSourceOptions({ ...env, NODE_ENV: 'test' });
  const baseline = new DataSource({ ...options, migrationsRun: false });
  await baseline.initialize();
  try {
    const existing = await baseline.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    if (existing[0].count !== 0) {
      throw new Error('Fresh-install rehearsal database must be empty');
    }
    const applied = await baseline.runMigrations({ transaction: 'all' });
    console.log(`Normal baseline migrations applied: ${applied.length}`);
  } finally {
    await baseline.destroy();
  }

  const candidateDb = new DataSource({
    ...options,
    migrations: candidates,
    migrationsRun: false,
  });
  await candidateDb.initialize();
  try {
    const applied = await candidateDb.runMigrations({ transaction: 'all' });
    if (applied.length !== candidates.length) {
      throw new Error(
        `Expected ${candidates.length} candidate migrations, got ${applied.length}`,
      );
    }
    const tables = await candidateDb.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name ~ '^phase(1a|2|3|4)'`,
    );
    const constraints = await candidateDb.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relnamespace = 'public'::regnamespace
       AND t.relname ~ '^phase(1a|2|3|4)'`,
    );
    const triggers = await candidateDb.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM pg_trigger g
       JOIN pg_class t ON t.oid = g.tgrelid
       WHERE t.relnamespace = 'public'::regnamespace
       AND t.relname ~ '^phase(1a|2|3|4)' AND NOT g.tgisinternal`,
    );
    if (
      tables[0].count !== 23 ||
      constraints[0].count < 50 ||
      triggers[0].count !== 8
    ) {
      throw new Error(
        `Unexpected KPI schema shape: ${tables[0].count} tables, ${constraints[0].count} constraints, ${triggers[0].count} triggers`,
      );
    }
    console.log(
      `Candidate migrations applied: ${applied.map((m) => m.name).join(', ')}`,
    );
    console.log(
      `KPI schema: ${tables[0].count} tables, ${constraints[0].count} constraints, ${triggers[0].count} triggers`,
    );
  } finally {
    await candidateDb.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unknown rehearsal failure',
  );
  process.exitCode = 1;
});
