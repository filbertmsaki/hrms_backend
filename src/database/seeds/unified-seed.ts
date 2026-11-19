import { DataSource, EntityManager } from 'typeorm';
import { Company } from '../../modules/companies/entities/company.entity';
import { provisionStandardActivityCategories } from '../../modules/hr/work-activities/constants/activity-category-catalog';
import { ReportDefinition } from '../../modules/scheduled-reporting/entities/report-definition.entity';
import { REGISTERED_REPORT_DEFINITIONS } from '../../modules/scheduled-reporting/services/report-registry.service';
import { provisionDefaultWorkforceReportPacksForCompany } from '../../modules/scheduled-reporting/utils/provision-default-workforce-report-packs.util';
import { seedAuthorization } from './unified-authorization';
import {
  EmployeeNumberOptions,
  seedEmployeeNumbering,
} from './unified-employee';
import {
  seedLeaveDrafts,
  seedPayrollDrafts,
  seedOnboardingDraft,
  seedOffboardingDraft,
} from './unified-hr-drafts';
import { seedNotifications } from './unified-notifications';
import { seedAttendanceDraft } from './unified-attendance';
import { seedProbationDraft } from './unified-probation';

export type UnifiedSeedModule =
  | 'authorization'
  | 'employees'
  | 'leave'
  | 'attendance'
  | 'probation'
  | 'payroll'
  | 'onboarding'
  | 'offboarding'
  | 'notifications'
  | 'reports'
  | 'activities';
export interface UnifiedSeedOptions {
  modules?: UnifiedSeedModule[];
  companyId?: number;
  employeeNumber?: EmployeeNumberOptions;
  dryRun?: boolean;
  proposedAttendance?: boolean;
  probationEffectiveFrom?: string;
}

const MODULES: UnifiedSeedModule[] = [
  'authorization',
  'employees',
  'leave',
  'attendance',
  'probation',
  'payroll',
  'onboarding',
  'offboarding',
  'notifications',
  'reports',
  'activities',
];
export const UNIFIED_SEED_VERSION = '1.0.0';
const HISTORY_SQL = `INSERT INTO unified_seed_execution_history
  (seed_version, company_id, modules, outcome, started_at)
  VALUES ($1, $2, $3::jsonb, $4, $5)`;

export function resolveUnifiedSeedModules(
  options: UnifiedSeedOptions,
): UnifiedSeedModule[] {
  const selected = [...(options.modules ?? MODULES)];
  if (!selected.length || selected.some((name) => !MODULES.includes(name))) {
    throw new Error('Unknown or empty unified seed module selection.');
  }
  if (
    (selected.includes('onboarding') || selected.includes('offboarding')) &&
    !selected.includes('authorization')
  )
    selected.push('authorization');
  if (
    options.companyId !== undefined &&
    (!Number.isSafeInteger(options.companyId) || options.companyId <= 0)
  ) {
    throw new Error('Company ID must be a positive safe integer.');
  }
  if (selected.includes('activities') && options.companyId === undefined) {
    throw new Error('A company ID is required for activity categories.');
  }
  if (
    [
      'leave',
      'attendance',
      'probation',
      'payroll',
      'onboarding',
      'offboarding',
    ].some((module) => selected.includes(module as UnifiedSeedModule)) &&
    options.companyId === undefined
  ) {
    throw new Error('A company ID is required for company HR modules.');
  }
  if (selected.includes('attendance') && !options.proposedAttendance)
    throw new Error(
      'Attendance draft requires explicit --proposed-attendance acknowledgement.',
    );
  if (selected.includes('probation') && !options.probationEffectiveFrom)
    throw new Error(
      'Probation draft requires an explicit --probation-effective-from date.',
    );
  if (
    selected.includes('employees') &&
    (options.companyId === undefined || !options.employeeNumber)
  ) {
    throw new Error(
      'A company ID and explicit employee numbering configuration are required for employees.',
    );
  }
  return MODULES.filter((name) => selected.includes(name));
}

async function seedReports(
  manager: EntityManager,
  companyId?: number,
): Promise<void> {
  const repository = manager.getRepository(ReportDefinition);
  const existing = new Set(
    (await repository.find({ select: ['reportCode'] })).map(
      (row) => row.reportCode,
    ),
  );
  const missing = REGISTERED_REPORT_DEFINITIONS.filter(
    (row) => !existing.has(row.reportCode),
  ).map((row) => ({
    reportCode: row.reportCode,
    name: row.name,
    description: row.description,
    supportedFilters: { fields: row.supportedFilterFields },
    supportedFormats: row.supportedFormats,
    generatorService: row.generatorService,
    isActive: true,
  }));
  if (missing.length) {
    await repository
      .createQueryBuilder()
      .insert()
      .into(ReportDefinition)
      .values(missing)
      .orIgnore()
      .execute();
  }
  if (companyId !== undefined) {
    await provisionDefaultWorkforceReportPacksForCompany(manager, companyId);
  }
}

/** All modules use the same transaction and PostgreSQL advisory lock. */
export async function runUnifiedSeed(
  dataSource: DataSource,
  options: UnifiedSeedOptions,
): Promise<UnifiedSeedModule[]> {
  const modules = resolveUnifiedSeedModules(options);
  const rollback = new Error('UNIFIED_SEED_DRY_RUN_ROLLBACK');
  const startedAt = new Date();
  try {
    return await dataSource.transaction(async (manager) => {
      // Shared database-wide lock serializes all unified runs, including global data.
      const rows: Array<{ locked: boolean }> = await manager.query(
        'SELECT pg_try_advisory_xact_lock($1, $2) AS locked',
        [1213353299, 1],
      );
      if (!rows[0]?.locked)
        throw new Error(
          'Another unified seed execution is in progress; retry later.',
        );
      if (options.companyId !== undefined) {
        const company = await manager
          .getRepository(Company)
          .findOne({ where: { id: options.companyId } });
        if (!company)
          throw new Error(`Company ${options.companyId} does not exist.`);
      }
      for (const module of modules) {
        if (module === 'authorization')
          await seedAuthorization(manager, options.companyId);
        if (module === 'employees')
          await seedEmployeeNumbering(
            manager,
            options.companyId!,
            options.employeeNumber!,
          );
        if (module === 'leave')
          await seedLeaveDrafts(manager, options.companyId!);
        if (module === 'attendance')
          await seedAttendanceDraft(manager, options.companyId!);
        if (module === 'probation')
          await seedProbationDraft(
            manager,
            options.companyId!,
            options.probationEffectiveFrom!,
          );
        if (module === 'payroll')
          await seedPayrollDrafts(manager, options.companyId!);
        if (module === 'onboarding')
          await seedOnboardingDraft(manager, options.companyId!);
        if (module === 'offboarding')
          await seedOffboardingDraft(manager, options.companyId!);
        if (module === 'notifications') await seedNotifications(manager);
        if (module === 'reports') await seedReports(manager, options.companyId);
        if (module === 'activities')
          await provisionStandardActivityCategories(
            manager,
            options.companyId!,
          );
      }
      if (options.dryRun) throw rollback;
      await manager.query(HISTORY_SQL, [
        UNIFIED_SEED_VERSION,
        options.companyId ?? null,
        JSON.stringify(modules),
        'COMPLETED',
        startedAt,
      ]);
      return modules;
    });
  } catch (error) {
    if (error === rollback) return modules;
    if (!options.dryRun && typeof dataSource.query === 'function') {
      try {
        await dataSource.query(HISTORY_SQL, [
          UNIFIED_SEED_VERSION,
          options.companyId ?? null,
          JSON.stringify(modules),
          'FAILED',
          startedAt,
        ]);
      } catch {
        console.error('[UnifiedSeed] Could not record failed execution.');
      }
    }
    throw error;
  }
}
