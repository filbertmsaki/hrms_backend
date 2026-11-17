/**
 * FRS-11 configuration readiness report (read-only; changes nothing).
 *
 *   npm run leave:config-readiness -- --company-id=1 [--as-of=2026-11-17] [--out=dir]
 *
 * Writes <out>/leave-config-readiness-company-<id>.{json,md} and exits 2
 * when blockers exist, so it can gate a deployment checklist.
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { LeaveBalanceService } from '../modules/hr/leave/services/leave-balance.service';
import { LeaveConfigReadinessService } from '../modules/hr/leave/services/leave-config-readiness.service';
import { Employee } from '../modules/hr/employees/entities/employee.entity';
import { LeaveType } from '../modules/hr/leave/entities/leave-type.entity';

async function main() {
  const args = new Map(
    process.argv
      .slice(2)
      .map((a) => /^--([a-z-]+)=(.*)$/.exec(a))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]] as [string, string]),
  );
  const companyId = Number(args.get('company-id'));
  if (!Number.isInteger(companyId) || companyId < 1)
    throw new Error('Provide --company-id.');
  const asOf = args.get('as-of') ?? new Date().toISOString().slice(0, 10);
  const outDir =
    args.get('out') ?? join(process.cwd(), 'tmp', 'leave-readiness');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const ds = app.get(DataSource);
    const balances = app.get(LeaveBalanceService);
    const service = new LeaveConfigReadinessService(ds, {
      async conflicts(cid, date) {
        const policies = await balances.findActivePolicies(
          cid,
          undefined,
          date,
        );
        const [employees, types] = await Promise.all([
          ds.getRepository(Employee).find({ where: { company_id: cid } }),
          ds.getRepository(LeaveType).find({ where: { company_id: cid } }),
        ]);
        const messages: string[] = [];
        for (const e of employees)
          for (const t of types) {
            try {
              balances.selectPolicyAssignment(policies, e as never, t.id);
            } catch (error) {
              messages.push(
                `${e.employee_no} / ${t.code}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        return messages;
      },
    });
    const report = await service.report(companyId, asOf);
    mkdirSync(outDir, { recursive: true });
    const base = join(outDir, `leave-config-readiness-company-${companyId}`);
    writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
    writeFileSync(`${base}.md`, LeaveConfigReadinessService.toMarkdown(report));
    console.log(
      JSON.stringify(report.summary),
      `blocked: ${report.blocked_features.join('; ') || 'none'}`,
    );
    console.log(`wrote ${base}.json and ${base}.md`);
    if (report.summary.blocker) process.exitCode = 2;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
