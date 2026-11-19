import { AppDataSource } from '../data-source';
import {
  runUnifiedSeed,
  UnifiedSeedModule,
  resolveUnifiedSeedModules,
} from './unified-seed';
import { validateUnifiedSeed } from './unified-validate';

function optionsFromArgs(args: string[]) {
  let companyId: number | undefined;
  let modules: UnifiedSeedModule[] | undefined;
  let prefix: string | undefined;
  let padding: number | undefined;
  let nextNumber: number | undefined;
  let dryRun = false;
  let validate = false;
  let proposedAttendance = false;
  let probationEffectiveFrom: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('--company=')) {
      const raw = arg.slice('--company='.length);
      if (!/^[1-9]\d*$/.test(raw)) throw new Error('Invalid --company value.');
      companyId = Number(raw);
    } else if (arg.startsWith('--module=')) {
      modules = arg.slice('--module='.length).split(',') as UnifiedSeedModule[];
    } else if (arg.startsWith('--employee-prefix=')) {
      prefix = arg.slice('--employee-prefix='.length);
    } else if (arg.startsWith('--employee-padding=')) {
      padding = Number(arg.slice('--employee-padding='.length));
    } else if (arg.startsWith('--employee-next=')) {
      nextNumber = Number(arg.slice('--employee-next='.length));
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--validate') {
      validate = true;
    } else if (arg === '--proposed-attendance') {
      proposedAttendance = true;
    } else if (arg.startsWith('--probation-effective-from=')) {
      probationEffectiveFrom = arg.slice('--probation-effective-from='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  const employeeNumber =
    prefix !== undefined && padding !== undefined && nextNumber !== undefined
      ? { prefix, padding, nextNumber }
      : undefined;
  if (validate && dryRun)
    throw new Error('Choose either --validate or --dry-run.');
  const options = {
    companyId,
    modules,
    employeeNumber,
    dryRun,
    proposedAttendance,
    probationEffectiveFrom,
  };
  resolveUnifiedSeedModules(
    validate
      ? {
          ...options,
          proposedAttendance: true,
          probationEffectiveFrom: probationEffectiveFrom ?? '2000-01-01',
          employeeNumber: employeeNumber ?? {
            prefix: '',
            padding: 3,
            nextNumber: 1,
          },
        }
      : options,
  );
  return { ...options, validate };
}

async function main(): Promise<void> {
  const options = optionsFromArgs(process.argv.slice(2));
  await AppDataSource.initialize();
  try {
    if (options.validate) {
      const issues = await validateUnifiedSeed(AppDataSource, options);
      console.log(
        JSON.stringify({
          event: 'unified_seed_validation',
          companyId: options.companyId ?? null,
          issues,
        }),
      );
      if (issues.length) process.exitCode = 2;
      return;
    }
    const modules = await runUnifiedSeed(AppDataSource, options);
    console.log(
      JSON.stringify({
        event: 'unified_seed_completed',
        modules,
        companyId: options.companyId ?? null,
        dryRun: options.dryRun,
      }),
    );
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'unified_seed_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
