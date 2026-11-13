import { DataSource, QueryRunner } from 'typeorm';
import { applyCommandEnv } from './load-command-env';
import { createAppDataSourceOptions } from './typeorm-options';

export const KPI_RELEASE_MIGRATIONS = [
  ['1797900000000', 'KpiFoundation1797900000000'],
  ['1797900001000', 'KpiScorecards1797900001000'],
  ['1797900002000', 'KpiAchievements1797900002000'],
  ['1797900003000', 'KpiEvaluations1797900003000'],
  ['1797900004000', 'KpiEvaluationDeadlines1797900004000'],
] as const;

export const KPI_RELEASE_TABLES = [
  'phase1a_kpi_definitions',
  'phase1a_kpi_definition_versions',
  'phase1a_kpi_templates',
  'phase1a_kpi_periods',
  'phase1a_kpi_assignments',
  'phase1a_kpi_target_revisions',
  'phase2_scoring_policies',
  'phase2_scoring_policy_versions',
  'phase2_scorecards',
  'phase2_scorecard_versions',
  'phase2_scorecard_templates',
  'phase3_kpi_achievements',
  'phase3_kpi_achievement_revisions',
  'phase3_kpi_achievement_evidence',
  'phase3_kpi_achievement_events',
  'phase3_kpi_evidence_rules',
  'phase4_evaluation_templates',
  'phase4_evaluation_template_versions',
  'phase4_evaluation_cycles',
  'phase4_evaluations',
  'phase4_evaluation_revisions',
  'phase4_evaluation_events',
  'phase4_evaluation_deadline_exceptions',
] as const;

export const KPI_RELEASE_TRIGGERS = [
  'phase2_scoring_policy_versions_immutable',
  'phase2_scorecard_versions_immutable',
  'phase3_approved_immutable',
  'phase3_events_immutable',
  'phase4_snapshot_immutable',
  'phase4_template_immutable',
  'phase4_revisions_immutable',
  'phase4_events_immutable',
] as const;

type LedgerRow = { name: string; timestamp: string };
type PreflightMetadata = {
  discovered: string[];
  ledger: LedgerRow[];
  tables: string[];
  triggers: string[];
  baseTables: string[];
};

/** Read-only metadata assessment. Never repairs a ledger or schema automatically. */
export function assessKpiUatMigrationState(
  metadata: PreflightMetadata,
): 'pending' | 'applied' {
  const expectedNames = KPI_RELEASE_MIGRATIONS.map(([, name]) => name);
  const discovered = new Set(metadata.discovered);
  if (expectedNames.some((name) => !discovered.has(name))) {
    throw new Error(
      'Reviewed KPI migrations are not all present in normal TypeORM discovery',
    );
  }
  if (
    ['companies', 'employees', 'company_users'].some(
      (name) => !metadata.baseTables.includes(name),
    )
  ) {
    throw new Error('Required HRMS identity/organization tables are missing');
  }
  const expectedByTimestamp = new Map<string, string>(KPI_RELEASE_MIGRATIONS);
  for (const row of metadata.ledger) {
    const expected = expectedByTimestamp.get(row.timestamp);
    if (expected && row.name !== expected) {
      throw new Error(
        'A KPI release migration identifier is already used by another migration',
      );
    }
  }
  const applied = expectedNames.filter((name) =>
    metadata.ledger.some((row) => row.name === name),
  );
  if (applied.length !== 0 && applied.length !== expectedNames.length) {
    throw new Error(
      'KPI release migrations are only partly applied; review before continuing',
    );
  }
  const existingTables = new Set(metadata.tables);
  const existingTriggers = new Set(metadata.triggers);
  if (applied.length === 0) {
    if (existingTables.size > 0 || existingTriggers.size > 0) {
      throw new Error(
        'KPI release object names already exist without matching migration history',
      );
    }
    return 'pending';
  }
  if (
    KPI_RELEASE_TABLES.some((name) => !existingTables.has(name)) ||
    KPI_RELEASE_TRIGGERS.some((name) => !existingTriggers.has(name))
  ) {
    throw new Error(
      'Applied KPI migration history does not match the expected schema objects',
    );
  }
  return 'applied';
}

async function readRows<T>(
  q: QueryRunner,
  sql: string,
  parameters: unknown[],
): Promise<T[]> {
  const result: unknown = await q.query(sql, parameters);
  if (!Array.isArray(result))
    throw new Error('Unexpected PostgreSQL metadata result');
  return result.map((row: unknown) => row as T);
}

async function main(): Promise<void> {
  const env = applyCommandEnv();
  if (env.APP_ENV !== 'uat') {
    throw new Error('KPI UAT preflight may run only with APP_ENV=uat');
  }
  const db = new DataSource({
    ...createAppDataSourceOptions(env),
    migrationsRun: false,
  });
  await db.initialize();
  const q = db.createQueryRunner();
  try {
    await q.startTransaction();
    await q.query('SET TRANSACTION READ ONLY');
    const ledger = await readRows<LedgerRow>(
      q,
      `SELECT name, timestamp::text AS timestamp FROM public.migrations
       WHERE timestamp::text = ANY($1) OR name = ANY($2)`,
      [
        KPI_RELEASE_MIGRATIONS.map(([timestamp]) => timestamp),
        KPI_RELEASE_MIGRATIONS.map(([, name]) => name),
      ],
    );
    const tables = await readRows<{ name: string }>(
      q,
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1)`,
      [KPI_RELEASE_TABLES],
    );
    const baseTables = await readRows<{ name: string }>(
      q,
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name = ANY($1)`,
      [['companies', 'employees', 'company_users']],
    );
    const triggers = await readRows<{ name: string }>(
      q,
      `SELECT t.tgname AS name FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgname = ANY($1)`,
      [KPI_RELEASE_TRIGGERS],
    );
    const discovered = db.migrations.map(
      (migration) => migration.name ?? migration.constructor.name,
    );
    const status = assessKpiUatMigrationState({
      discovered,
      ledger,
      tables: tables.map((row) => row.name),
      triggers: triggers.map((row) => row.name),
      baseTables: baseTables.map((row) => row.name),
    });
    console.log(
      `KPI UAT metadata preflight passed; release migrations ${status}.`,
    );
  } finally {
    if (q.isTransactionActive) await q.rollbackTransaction();
    await q.release();
    await db.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'KPI UAT preflight failed',
    );
    process.exitCode = 1;
  });
}
