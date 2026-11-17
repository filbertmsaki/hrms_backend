/**
 * FRS-11.4.08 historical leave allocation backfill + monthly reconciliation.
 *
 *   npm run leave:allocation-backfill -- --company-id=1 [--from=2025-01-01 --to=2026-12-31]
 *       Dry run (default): prints the plan, writes plan JSON + before/after CSV.
 *   ... --record             also stores the plan as PROPOSED audit rows.
 *   ... --mode=apply --confirm=<DB_NAME>
 *       Applies in one transaction; prints the batch id needed to revert.
 *   ... --mode=revert --batch-id=<uuid> --confirm=<DB_NAME>
 *   ... --mode=reconcile --from=.. --to=..
 *       Writes the monthly leave-to-payroll reconciliation CSV.
 *
 * --confirm must repeat the target database name so a write cannot hit the
 * wrong database by accident. Take a backup before applying anywhere real.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppDataSource } from '../database/data-source';
import { LeaveAllocationBackfillService } from '../modules/hr/leave/services/leave-allocation-backfill.service';
import { LeavePayrollReconciliationService } from '../modules/hr/leave/services/leave-payroll-reconciliation.service';

function args(argv: string[]) {
  const map = new Map<string, string>();
  for (const value of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(value);
    if (m) map.set(m[1], m[2] ?? 'true');
  }
  return map;
}

async function main() {
  const a = args(process.argv.slice(2));
  const mode = a.get('mode') ?? 'dry-run';
  const companyId = Number(a.get('company-id'));
  const from = a.get('from');
  const to = a.get('to');
  const outDir = a.get('out') ?? join(process.cwd(), 'tmp', 'leave-allocation');
  const actor =
    a.get('actor') ?? process.env.USERNAME ?? process.env.USER ?? 'cli';
  const dbName = String(AppDataSource.options.database ?? '');
  if (mode !== 'revert' && (!Number.isInteger(companyId) || companyId < 1)) {
    throw new Error('Provide --company-id=<positive integer>.');
  }
  for (const d of [from, to]) {
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d))
      throw new Error('Dates must be YYYY-MM-DD.');
  }
  if ((mode === 'apply' || mode === 'revert') && a.get('confirm') !== dbName) {
    throw new Error(
      `Writes need --confirm=${dbName} (the target database). Nothing was changed.`,
    );
  }
  console.log(`database=${dbName} mode=${mode}`);
  await AppDataSource.initialize();
  try {
    const backfill = new LeaveAllocationBackfillService(AppDataSource);
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (mode === 'dry-run') {
      const plan = await backfill.plan(companyId, { from, to });
      const file = join(outDir, `plan-company-${companyId}-${stamp}`);
      writeFileSync(`${file}.json`, JSON.stringify(plan, null, 2));
      const csv = [
        'leave_request_id,leave_no,employee_id,status,method,total_days,month,before_days,after_days,reason',
      ];
      for (const c of plan.candidates) {
        const months = new Set([
          ...Object.keys(c.beforeAllocation),
          ...Object.keys(c.afterAllocation ?? {}),
        ]);
        for (const m of [...months].sort()) {
          csv.push(
            [
              c.leaveRequestId,
              c.leaveNo,
              c.employeeId,
              c.status,
              c.method ?? '',
              c.totalDays,
              m,
              c.beforeAllocation[m] ?? 0,
              c.afterAllocation ? (c.afterAllocation[m] ?? 0) : '',
              JSON.stringify(c.reason ?? ''),
            ].join(','),
          );
        }
      }
      writeFileSync(`${file}.csv`, csv.join('\n'));
      console.log(
        `scanned=${plan.scanned} proposed=${plan.proposed} needs_review=${plan.needsReview}`,
      );
      console.table(plan.monthTotals);
      if (a.get('record') === 'true') {
        console.log(
          `recorded proposal batch=${await backfill.recordPlan(plan, actor)}`,
        );
      }
      console.log(`wrote ${file}.json and ${file}.csv (no leave data changed)`);
    } else if (mode === 'apply') {
      const result = await backfill.apply(companyId, actor, { from, to });
      console.log(JSON.stringify(result));
      console.log(
        `Revert with --mode=revert --batch-id=${result.batchId} --confirm=${dbName}`,
      );
    } else if (mode === 'revert') {
      const batchId = a.get('batch-id');
      if (!batchId) throw new Error('Provide --batch-id.');
      console.log(JSON.stringify(await backfill.revert(batchId, actor)));
    } else if (mode === 'reconcile') {
      if (!from || !to) throw new Error('Provide --from and --to.');
      const rows = await new LeavePayrollReconciliationService(
        AppDataSource,
      ).reconcile(companyId, from, to);
      const file = join(
        outDir,
        `reconciliation-company-${companyId}-${from}-${to}-${stamp}.csv`,
      );
      writeFileSync(file, LeavePayrollReconciliationService.toCsv(rows));
      const counts = rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      console.log(JSON.stringify(counts));
      console.log(`wrote ${file}`);
    } else {
      throw new Error(`Unknown --mode=${mode}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
