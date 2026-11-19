import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../../common/utils/permission.util';
import { Company } from '../../../companies/entities/company.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import {
  ACTIVE_RECALCULATION_STATUSES,
  LeaveRecalculationLine,
  LeaveRecalculationRun,
  RecalculationScope,
  RecalculationTrigger,
} from '../entities/leave-recalculation-run.entity';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveBalanceService } from './leave-balance.service';
import {
  AccrualStartBasis,
  resolveAccrualStart,
} from '../utils/leave-accrual-engine.util';

export const RECALC_PERMISSIONS = {
  preview: 'leave_balance_recalculation:preview',
  employee: 'leave_balance_recalculation:employee',
  bulk: 'leave_balance_recalculation:bulk',
  approve: 'leave_balance_recalculation:approve',
  history: 'leave_balance_recalculation:history',
} as const;

const EXITED = ['terminated', 'exited', 'resigned', 'deceased', 'retired'];
const BATCH = 25;

class PreviewRollback extends Error {}

export type CreateRecalculationInput = {
  scope_type: RecalculationScope;
  scope_id?: number | null;
  leave_type_id?: number | null;
  as_of_date?: string | null;
};

/**
 * Leave balance recalculation (preview → apply). Reuses the balance
 * service's own calculation, so a preview shows exactly what applying would
 * post. Previews run inside a rolled-back transaction (no changes, ever).
 * Applying posts RECALCULATION ledger entries per balance, one employee per
 * transaction with that employee's balances locked, so a failure never
 * leaves an employee half-corrected and a concurrent leave approval or
 * nightly accrual waits rather than racing.
 */
@Injectable()
export class LeaveRecalculationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeaveRecalculationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveAuditService: LeaveAuditService,
    private readonly hrAccessService: HrAccessService,
    private readonly advisoryLock: PostgresAdvisoryLockService,
  ) {}

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  async create(
    companyId: number,
    input: CreateRecalculationInput,
    actor: AuthenticatedUser | null,
    trigger: RecalculationTrigger = 'manual',
  ): Promise<LeaveRecalculationRun> {
    const scopeType = input.scope_type;
    if (!['employee', 'department', 'branch', 'company'].includes(scopeType))
      throw new BadRequestException('Unknown recalculation scope.');
    const scopeId = scopeType === 'company' ? null : (input.scope_id ?? null);
    if (scopeType !== 'company' && !scopeId)
      throw new BadRequestException(`Choose the ${scopeType} to recalculate.`);
    const today = this.leaveBalanceService.todayIso();
    const asOf = (input.as_of_date || today).slice(0, 10);
    if (asOf > today)
      throw new BadRequestException(
        'The cutoff date cannot be in the future (projections are never posted).',
      );
    if (actor) {
      this.require(actor, RECALC_PERMISSIONS.preview);
      if (scopeType !== 'employee')
        this.require(actor, RECALC_PERMISSIONS.bulk);
      await this.assertScopeAccess(companyId, scopeType, scopeId, actor);
    }
    const repo = this.dataSource.getRepository(LeaveRecalculationRun);
    const scopeKey = `${scopeType}:${scopeId ?? 'all'}${input.leave_type_id ? `:type:${input.leave_type_id}` : ''}`;
    const active = await repo.findOne({
      where: {
        company_id: companyId,
        scope_key: scopeKey,
        status: In(ACTIVE_RECALCULATION_STATUSES),
      },
    });
    if (active)
      throw new ConflictException({
        message: `Recalculation ${active.reference} is already open for this scope (${active.status}). Finish or cancel it first.`,
        run_id: active.id,
      });
    let run: LeaveRecalculationRun;
    try {
      run = await repo.save(
        repo.create({
          company_id: companyId,
          reference: `RCL-${today.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          scope_type: scopeType,
          scope_id: scopeId,
          leave_type_id: input.leave_type_id ?? null,
          scope_key: scopeKey,
          as_of_date: asOf,
          trigger,
          status: 'queued',
          initiated_by_company_user_id: actor?.companyMembershipId ?? null,
        }),
      );
    } catch (error) {
      // Two instances / double clicks racing on the same scope.
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'A recalculation is already open for this scope.',
        );
      throw error;
    }
    await this.audit(run, 'leave_recalculation.created', actor, {
      trigger,
      as_of_date: asOf,
    });
    this.kick();
    return run;
  }

  /**
   * Ask to apply the previewed corrections. A single employee is applied by
   * whoever holds the employee permission; bulk scopes wait for an
   * independent approver.
   */
  async submit(
    companyId: number,
    runId: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 5)
      throw new BadRequestException(
        'Give a reason for applying the corrections.',
      );
    const run = await this.load(companyId, runId);
    if (run.status !== 'preview_ready')
      throw new ConflictException(
        `Run ${run.reference} is ${run.status}; only a finished preview can be applied.`,
      );
    if (run.as_of_date !== this.leaveBalanceService.todayIso())
      throw new BadRequestException(
        'This preview was calculated for a past cutoff date. Corrections are applied as at today: run a new preview first.',
      );
    if (!run.lines_changed)
      throw new BadRequestException(
        'Nothing to apply: every balance already matches.',
      );
    const bulk = run.scope_type !== 'employee';
    this.require(
      actor,
      bulk ? RECALC_PERMISSIONS.bulk : RECALC_PERMISSIONS.employee,
    );
    run.reason = trimmed;
    run.submitted_by_company_user_id = actor.companyMembershipId ?? null;
    run.submitted_at = new Date();
    if (bulk) run.status = 'pending_approval';
    else {
      run.status = 'approved';
      run.approved_by_company_user_id = actor.companyMembershipId ?? null;
      run.approved_at = new Date();
    }
    await this.dataSource.getRepository(LeaveRecalculationRun).save(run);
    await this.audit(
      run,
      bulk ? 'leave_recalculation.submitted' : 'leave_recalculation.approved',
      actor,
      { reason: trimmed },
    );
    if (!bulk) this.kick();
    return run;
  }

  async approve(companyId: number, runId: number, actor: AuthenticatedUser) {
    this.require(actor, RECALC_PERMISSIONS.approve);
    const run = await this.load(companyId, runId);
    if (run.status !== 'pending_approval')
      throw new ConflictException(
        `Run ${run.reference} is ${run.status}, not awaiting approval.`,
      );
    if (run.submitted_by_company_user_id === actor.companyMembershipId)
      throw new ForbiddenException(
        'A bulk recalculation must be approved by someone other than the person who submitted it.',
      );
    run.status = 'approved';
    run.approved_by_company_user_id = actor.companyMembershipId ?? null;
    run.approved_at = new Date();
    await this.dataSource.getRepository(LeaveRecalculationRun).save(run);
    await this.audit(run, 'leave_recalculation.approved', actor, {});
    this.kick();
    return run;
  }

  async cancel(companyId: number, runId: number, actor: AuthenticatedUser) {
    const run = await this.load(companyId, runId);
    if (!['queued', 'preview_ready', 'pending_approval'].includes(run.status))
      throw new ConflictException(
        `Run ${run.reference} is ${run.status} and cannot be cancelled.`,
      );
    this.require(
      actor,
      run.scope_type === 'employee'
        ? RECALC_PERMISSIONS.preview
        : RECALC_PERMISSIONS.bulk,
    );
    run.status = 'cancelled';
    await this.dataSource.getRepository(LeaveRecalculationRun).save(run);
    await this.audit(run, 'leave_recalculation.cancelled', actor, {});
    return run;
  }

  /** Re-run apply for failed / stale lines of a partially failed run. */
  async retry(companyId: number, runId: number, actor: AuthenticatedUser) {
    const run = await this.load(companyId, runId);
    if (run.status !== 'partially_failed' && run.status !== 'failed')
      throw new ConflictException(
        'Only failed or partially failed runs can be retried.',
      );
    this.require(
      actor,
      run.scope_type === 'employee'
        ? RECALC_PERMISSIONS.employee
        : RECALC_PERMISSIONS.bulk,
    );
    await this.dataSource
      .getRepository(LeaveRecalculationLine)
      .update(
        { run_id: run.id, status: 'failed' },
        { status: 'changed', error: null },
      );
    run.status = 'approved';
    run.error = null;
    await this.dataSource.getRepository(LeaveRecalculationRun).save(run);
    await this.audit(run, 'leave_recalculation.retried', actor, {});
    this.kick();
    return run;
  }

  // -------------------------------------------------------------------------
  // Worker
  // -------------------------------------------------------------------------

  private kicking = false;
  /** Start processing soon (after the request returns). */
  private kick() {
    if (process.env.NODE_ENV === 'test' || this.kicking) return;
    this.kicking = true;
    setTimeout(() => {
      this.kicking = false;
      void this.work().catch((error) =>
        this.logger.error(
          'Recalculation worker failed',
          error instanceof Error ? error.stack : String(error),
        ),
      );
    }, 50);
  }

  /** Background worker; one instance at a time (advisory lock). */
  @Cron(CronExpression.EVERY_MINUTE)
  async work(): Promise<void> {
    await this.advisoryLock.runWithLock(
      'leave-recalculation-worker',
      async () => {
        for (;;) {
          const run = await this.dataSource
            .getRepository(LeaveRecalculationRun)
            .findOne({
              where: {
                status: In(['queued', 'previewing', 'approved', 'applying']),
              },
              order: { id: 'ASC' },
            });
          if (!run) return;
          if (run.status === 'queued' || run.status === 'previewing')
            await this.runPreview(run);
          else await this.runApply(run);
        }
      },
    );
  }

  private async scopeEmployees(
    run: LeaveRecalculationRun,
  ): Promise<Employee[]> {
    const qb = this.dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.company_id = :companyId', { companyId: run.company_id });
    if (run.scope_type === 'employee')
      qb.andWhere('e.id = :id', { id: run.scope_id });
    else {
      qb.andWhere(
        '(e.employment_status IS NULL OR e.employment_status NOT IN (:...exited))',
        { exited: EXITED },
      );
      if (run.scope_type === 'department')
        qb.andWhere('e.primary_department_id = :id', { id: run.scope_id });
      if (run.scope_type === 'branch')
        qb.andWhere('e.primary_branch_id = :id', { id: run.scope_id });
    }
    return qb.orderBy('e.id', 'ASC').getMany();
  }

  private balancesFor(
    manager: EntityManager,
    run: LeaveRecalculationRun,
    employee: Employee,
    lock: boolean,
  ) {
    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      new Date(`${run.as_of_date}T00:00:00Z`),
    );
    return manager.getRepository(LeaveBalance).find({
      where: {
        employee_id: employee.id,
        fiscal_year: fiscalYear,
        ...(run.leave_type_id ? { leave_type_id: run.leave_type_id } : {}),
      },
      order: { id: 'ASC' },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  }

  /** Dry run: computes every line in a transaction that is rolled back. */
  private async runPreview(run: LeaveRecalculationRun) {
    const runs = this.dataSource.getRepository(LeaveRecalculationRun);
    const lines = this.dataSource.getRepository(LeaveRecalculationLine);
    run.status = 'previewing';
    await lines.delete({ run_id: run.id });
    const employees = await this.scopeEmployees(run);
    Object.assign(run, {
      employees_total: employees.length,
      employees_done: 0,
      lines_changed: 0,
      lines_skipped: 0,
    });
    await runs.save(run);
    for (let i = 0; i < employees.length; i += BATCH) {
      // Cancelled while previewing?
      const fresh = await runs.findOne({ where: { id: run.id } });
      if (fresh?.status === 'cancelled') return;
      for (const employee of employees.slice(i, i + BATCH)) {
        try {
          const computed = await this.previewEmployee(run, employee);
          if (computed.length) await lines.save(computed);
          run.lines_changed += computed.filter(
            (l) => l.status === 'changed',
          ).length;
        } catch (error) {
          run.lines_skipped += 1;
          await lines.save(
            lines.create({
              run_id: run.id,
              company_id: run.company_id,
              employee_id: employee.id,
              leave_type_id: run.leave_type_id ?? 0,
              fiscal_year: '-',
              status: 'failed',
              error:
                error instanceof Error
                  ? error.message.slice(0, 500)
                  : String(error),
            }),
          );
        }
        run.employees_done += 1;
      }
      await runs.save(run);
    }
    run.status = 'preview_ready';
    await runs.save(run);
    await this.audit(run, 'leave_recalculation.previewed', null, {
      employees: run.employees_total,
      lines_changed: run.lines_changed,
    });
  }

  private async previewEmployee(
    run: LeaveRecalculationRun,
    employee: Employee,
  ) {
    const out: LeaveRecalculationLine[] = [];
    const lines = this.dataSource.getRepository(LeaveRecalculationLine);
    try {
      await this.dataSource.transaction(async (manager) => {
        const balances = await this.balancesFor(manager, run, employee, true);
        for (const before of balances) {
          const snapshot = { ...before };
          const after = await this.leaveBalanceService.ensureBalanceForEmployee(
            run.company_id,
            employee,
            before.leave_type_id,
            before.fiscal_year,
            manager,
            {
              forceRecalculate: true,
              allowAccrualDecrease: true,
              asOfDate: run.as_of_date,
            },
          );
          const meta = await this.policyMeta(manager, after);
          out.push(
            lines.create(this.toLine(run, employee, snapshot, after, meta)),
          );
        }
        throw new PreviewRollback();
      });
    } catch (error) {
      if (!(error instanceof PreviewRollback)) throw error;
    }
    return out;
  }

  private toLine(
    run: LeaveRecalculationRun,
    employee: Employee,
    before: LeaveBalance,
    after: LeaveBalance,
    meta: {
      version: number | null;
      frequency: string | null;
      basis: AccrualStartBasis;
    },
  ): Partial<LeaveRecalculationLine> {
    const n = (v: string | null | undefined) =>
      this.leaveBalanceService.toNumber(v ?? '0');
    const currentAvailable =
      this.leaveBalanceService.calculateAvailableDays(before);
    const newAvailable = this.leaveBalanceService.calculateAvailableDays(after);
    const accruedDiff = n(after.accrued_days) - n(before.accrued_days);
    const availableDiff = newAvailable - currentAvailable;
    const changed =
      Math.abs(accruedDiff) >= 0.005 || Math.abs(availableDiff) >= 0.005;
    const start = resolveAccrualStart(employee, meta.basis);
    const warnings: string[] = [];
    if (meta.basis === 'probation_completion' && !start.date)
      warnings.push(start.reason);
    if (availableDiff < -0.005 && newAvailable < 0)
      warnings.push(
        'Recalculated balance is negative: leave already taken exceeds what is earned.',
      );
    if (!employee.hire_date) warnings.push('No hire date recorded.');
    if (Math.abs(availableDiff - accruedDiff) >= 0.005)
      warnings.push(
        'Used / pending days also differ from the stored balance (taken leave was re-counted).',
      );
    return {
      run_id: run.id,
      company_id: run.company_id,
      employee_id: employee.id,
      leave_type_id: before.leave_type_id,
      leave_balance_id: before.id,
      fiscal_year: before.fiscal_year,
      entitlement_days: this.leaveBalanceService.toDecimal(
        n(after.entitlement_days),
      ),
      current_accrued_days: this.leaveBalanceService.toDecimal(
        n(before.accrued_days),
      ),
      recalculated_accrued_days: this.leaveBalanceService.toDecimal(
        n(after.accrued_days),
      ),
      current_available_days:
        this.leaveBalanceService.toDecimal(currentAvailable),
      recalculated_available_days:
        this.leaveBalanceService.toDecimal(newAvailable),
      difference_days: this.leaveBalanceService.toDecimal(availableDiff),
      used_days: this.leaveBalanceService.toDecimal(n(after.used_days)),
      pending_days: this.leaveBalanceService.toDecimal(n(after.pending_days)),
      adjusted_days: this.leaveBalanceService.toDecimal(n(after.adjusted_days)),
      policy_id: after.policy_id ?? null,
      policy_version: meta.version,
      accrual_frequency: meta.frequency,
      accrual_start_basis: meta.basis,
      accrual_start_date: start.date,
      hire_date: employee.hire_date ?? null,
      probation_status: start.probation,
      probation_completion_date:
        start.probation === 'confirmed'
          ? (employee.confirmation_date ?? null)
          : null,
      warnings: warnings.length ? warnings : null,
      status: changed ? 'changed' : 'unchanged',
    };
  }

  /** Policy version and the leave type's accrual settings for a balance. */
  private async policyMeta(manager: EntityManager, balance: LeaveBalance) {
    if (!balance.policy_id)
      return {
        version: null,
        frequency: null,
        basis: 'hire_date' as AccrualStartBasis,
      };
    const [row] = await manager.query<
      Array<{
        version_no: number | null;
        method: string | null;
        basis: string | null;
      }>
    >(
      `SELECT p.version_no, COALESCE(pt.accrual_method, p.accrual_method::text) AS method,
              pt.accrual_start_basis AS basis
         FROM leave_policies p
         LEFT JOIN leave_policy_types pt ON pt.policy_id = p.id AND pt.leave_type_id = $2
        WHERE p.id = $1`,
      [balance.policy_id, balance.leave_type_id],
    );
    return {
      version: row?.version_no ?? null,
      frequency: row?.method ?? null,
      basis: (row?.basis ?? 'hire_date') as AccrualStartBasis,
    };
  }

  /** Applies changed lines, one employee per transaction. */
  private async runApply(run: LeaveRecalculationRun) {
    const runs = this.dataSource.getRepository(LeaveRecalculationRun);
    const lineRepo = this.dataSource.getRepository(LeaveRecalculationLine);
    run.status = 'applying';
    await runs.save(run);
    const pending = await lineRepo.find({
      where: { run_id: run.id, status: 'changed' },
      order: { employee_id: 'ASC', id: 'ASC' },
    });
    const byEmployee = new Map<number, LeaveRecalculationLine[]>();
    for (const line of pending)
      byEmployee.set(line.employee_id, [
        ...(byEmployee.get(line.employee_id) ?? []),
        line,
      ]);
    for (const [employeeId, employeeLines] of byEmployee) {
      try {
        const results = await this.dataSource.transaction(async (manager) => {
          const employee = await manager.getRepository(Employee).findOneOrFail({
            where: { id: employeeId, company_id: run.company_id },
          });
          const balances = await this.balancesFor(manager, run, employee, true);
          const outcome: Array<[LeaveRecalculationLine, 'applied' | 'stale']> =
            [];
          for (const line of employeeLines) {
            const balance = balances.find(
              (b) => b.id === line.leave_balance_id,
            );
            // The stored balance moved since the preview: do not apply blind.
            if (
              !balance ||
              Math.abs(
                this.leaveBalanceService.toNumber(balance.accrued_days) -
                  this.leaveBalanceService.toNumber(line.current_accrued_days),
              ) >= 0.005
            ) {
              outcome.push([line, 'stale']);
              continue;
            }
            await this.leaveBalanceService.ensureBalanceForEmployee(
              run.company_id,
              employee,
              line.leave_type_id,
              line.fiscal_year,
              manager,
              {
                forceRecalculate: true,
                allowAccrualDecrease: true,
                recalculationRunId: run.id,
                actorCompanyUserId: run.approved_by_company_user_id,
              },
            );
            outcome.push([line, 'applied']);
          }
          await this.leaveAuditService.log(
            {
              company_id: run.company_id,
              entity_name: 'leave_recalculation_run',
              entity_id: run.id,
              action: 'leave_recalculation.employee_applied',
              payload: {
                employee_id: employeeId,
                reference: run.reference,
                reason: run.reason,
                lines: employeeLines.map((l) => ({
                  leave_type_id: l.leave_type_id,
                  accrued: [
                    l.current_accrued_days,
                    l.recalculated_accrued_days,
                  ],
                  available: [
                    l.current_available_days,
                    l.recalculated_available_days,
                  ],
                })),
              },
            },
            manager,
          );
          return outcome;
        });
        for (const [line, status] of results) {
          await lineRepo.update(line.id, {
            status,
            error:
              status === 'stale'
                ? 'Balance changed after the preview; run a new preview.'
                : null,
          });
          if (status === 'applied') run.lines_applied += 1;
          else run.lines_skipped += 1;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 500) : String(error);
        await lineRepo.update(
          { id: In(employeeLines.map((l) => l.id)) },
          { status: 'failed', error: message },
        );
        run.lines_failed += employeeLines.length;
      }
      await runs.save(run);
    }
    run.status = run.lines_failed
      ? run.lines_applied
        ? 'partially_failed'
        : 'failed'
      : 'completed';
    run.completed_at = new Date();
    await runs.save(run);
    await this.audit(run, `leave_recalculation.${run.status}`, null, {
      applied: run.lines_applied,
      failed: run.lines_failed,
      skipped: run.lines_skipped,
    });
  }

  // -------------------------------------------------------------------------
  // Automatic previews
  // -------------------------------------------------------------------------

  /**
   * After this upgrade is deployed, one company-wide preview is started per
   * company (dry run only — nothing changes until HR applies it).
   */
  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.LEAVE_RECALC_INITIAL_PREVIEW === 'false'
    )
      return;
    setTimeout(
      () =>
        void this.startInitialPreviews().catch((e) =>
          this.logger.error(
            'Initial leave recalculation preview failed',
            e instanceof Error ? e.stack : String(e),
          ),
        ),
      30_000,
    );
  }

  async startInitialPreviews(): Promise<number> {
    let started = 0;
    const companies = await this.dataSource
      .getRepository(Company)
      .find({ select: ['id'] });
    for (const company of companies) {
      const exists = await this.dataSource
        .getRepository(LeaveRecalculationRun)
        .exist({
          where: { company_id: company.id, trigger: 'initial' },
        });
      if (exists) continue;
      try {
        await this.create(
          company.id,
          { scope_type: 'company' },
          null,
          'initial',
        );
        started++;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    if (started)
      this.logger.log(
        `Started ${started} initial leave balance recalculation preview(s)`,
      );
    return started;
  }

  /**
   * Daily: employees whose routine refresh held back a decrease (probation
   * or hire date corrected, policy changed) get an employee preview for HR.
   */
  @Cron('30 2 * * *')
  async openReviewPreviews(): Promise<number> {
    const rows = await this.dataSource.query<
      Array<{ company_id: number; employee_id: number }>
    >(
      `SELECT DISTINCT e.company_id, b.employee_id
         FROM leave_balances b JOIN employees e ON e.id = b.employee_id
        WHERE b.accrual_review_required_at IS NOT NULL`,
    );
    for (const row of rows)
      await this.previewForEmployee(
        row.company_id,
        row.employee_id,
        'policy_change',
      );
    return rows.length;
  }

  /** Probation confirmed / extended, hire date corrected, policy change. */
  async previewForEmployee(
    companyId: number,
    employeeId: number,
    trigger: RecalculationTrigger,
  ) {
    try {
      await this.create(
        companyId,
        { scope_type: 'employee', scope_id: employeeId },
        null,
        trigger,
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async list(
    companyId: number,
    actor: AuthenticatedUser,
    filters: { employee_id?: number; page?: number; limit?: number },
  ) {
    this.requireAny(actor, [
      RECALC_PERMISSIONS.history,
      RECALC_PERMISSIONS.preview,
    ]);
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const qb = this.dataSource
      .getRepository(LeaveRecalculationRun)
      .createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId });
    if (filters.employee_id)
      qb.andWhere(
        `(r.scope_type = 'employee' AND r.scope_id = :e) OR EXISTS (SELECT 1 FROM leave_recalculation_lines l WHERE l.run_id = r.id AND l.employee_id = :e AND l.status <> 'unchanged')`,
        { e: filters.employee_id },
      );
    const [data, total] = await qb
      .orderBy('r.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async detail(
    companyId: number,
    runId: number,
    actor: AuthenticatedUser,
    filters: { only_changed?: boolean; page?: number; limit?: number },
  ) {
    this.requireAny(actor, [
      RECALC_PERMISSIONS.history,
      RECALC_PERMISSIONS.preview,
    ]);
    const run = await this.load(companyId, runId);
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(500, Math.max(1, filters.limit ?? 50));
    const [lines, total] = await this.dataSource
      .getRepository(LeaveRecalculationLine)
      .findAndCount({
        where: {
          run_id: run.id,
          ...(filters.only_changed ? { status: Not('unchanged') } : {}),
        },
        order: { employee_id: 'ASC', leave_type_id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    const names = await this.lookupNames(companyId, lines);
    return {
      run,
      lines: lines.map((l) => ({ ...l, ...names(l) })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Whole run as CSV (preview report / reconciliation result). */
  async csv(
    companyId: number,
    runId: number,
    actor: AuthenticatedUser,
  ): Promise<{ filename: string; body: string }> {
    this.requireAny(actor, [
      RECALC_PERMISSIONS.history,
      RECALC_PERMISSIONS.preview,
    ]);
    const run = await this.load(companyId, runId);
    const lines = await this.dataSource
      .getRepository(LeaveRecalculationLine)
      .find({
        where: { run_id: run.id },
        order: { employee_id: 'ASC', leave_type_id: 'ASC' },
      });
    const names = await this.lookupNames(companyId, lines);
    const header = [
      'Employee No',
      'Employee',
      'Leave Type',
      'Leave Year',
      'Entitlement',
      'Current Accrued',
      'Recalculated Accrued',
      'Current Balance',
      'Recalculated Balance',
      'Difference',
      'Used',
      'Pending',
      'Hire Date',
      'Probation',
      'Status',
      'Warnings / Error',
    ];
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v);
      // Neutralise spreadsheet formulas; quote everything.
      return `"${(/^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const rows = lines.map((l) => {
      const n = names(l);
      return [
        n.employee_no,
        n.employee_name,
        n.leave_type_name,
        l.fiscal_year,
        l.entitlement_days,
        l.current_accrued_days,
        l.recalculated_accrued_days,
        l.current_available_days,
        l.recalculated_available_days,
        l.difference_days,
        l.used_days,
        l.pending_days,
        l.hire_date,
        l.probation_status,
        l.status,
        [...(l.warnings ?? []), l.error].filter(Boolean).join(' | '),
      ]
        .map(esc)
        .join(',');
    });
    return {
      filename: `${run.reference}.csv`,
      body: [header.map(esc).join(','), ...rows].join('\r\n'),
    };
  }

  private async lookupNames(
    companyId: number,
    lines: LeaveRecalculationLine[],
  ) {
    const employeeIds = [...new Set(lines.map((l) => l.employee_id))];
    const typeIds = [...new Set(lines.map((l) => l.leave_type_id))];
    type EmployeeName = {
      id: number;
      employee_no: string;
      first_name: string;
      last_name: string;
    };
    const [employees, types] = await Promise.all<
      [Promise<EmployeeName[]>, Promise<Array<{ id: number; name: string }>>]
    >([
      employeeIds.length
        ? this.dataSource.query<
            Array<{
              id: number;
              employee_no: string;
              first_name: string;
              last_name: string;
            }>
          >(
            `SELECT id, employee_no, first_name, last_name FROM employees WHERE company_id = $1 AND id = ANY($2)`,
            [companyId, employeeIds],
          )
        : Promise.resolve([]),
      typeIds.length
        ? this.dataSource.query<Array<{ id: number; name: string }>>(
            `SELECT id, name FROM leave_types WHERE id = ANY($1)`,
            [typeIds],
          )
        : Promise.resolve([]),
    ]);
    const e = new Map(employees.map((r) => [r.id, r]));
    const t = new Map(types.map((r) => [r.id, r.name]));
    return (l: LeaveRecalculationLine) => ({
      employee_no: e.get(l.employee_id)?.employee_no ?? null,
      employee_name: e.get(l.employee_id)
        ? `${e.get(l.employee_id)!.first_name} ${e.get(l.employee_id)!.last_name}`
        : null,
      leave_type_name: t.get(l.leave_type_id) ?? null,
    });
  }

  // -------------------------------------------------------------------------

  private async load(companyId: number, runId: number) {
    const run = await this.dataSource
      .getRepository(LeaveRecalculationRun)
      .findOne({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundException('Recalculation run not found');
    return run;
  }

  private require(actor: AuthenticatedUser, permission: string) {
    if (!hasPermission(actor.permissions, permission))
      throw new ForbiddenException(`You need the ${permission} permission.`);
  }

  private requireAny(actor: AuthenticatedUser, permissions: string[]) {
    if (!permissions.some((p) => hasPermission(actor.permissions, p)))
      throw new ForbiddenException(
        'You are not allowed to view leave balance recalculations.',
      );
  }

  private async assertScopeAccess(
    companyId: number,
    scope: RecalculationScope,
    scopeId: number | null,
    actor: AuthenticatedUser,
  ) {
    if (actor.companyId !== companyId)
      throw new ForbiddenException('Other company.');
    if (scope === 'employee') {
      const employee = await this.dataSource.getRepository(Employee).findOne({
        where: { id: scopeId!, company_id: companyId },
        relations: { primary_department: true, primary_position: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
      return;
    }
    // Department / branch / company runs touch many employees: company-wide
    // data scope only.
    if (!this.hrAccessService.hasCompanyScope(actor))
      throw new ForbiddenException(
        'Bulk recalculation needs company-wide HR access.',
      );
    if (scope === 'department' || scope === 'branch') {
      const table = scope === 'department' ? 'departments' : 'branches';
      const [row] = await this.dataSource.query<Array<{ id: number }>>(
        `SELECT id FROM ${table} WHERE id = $1 AND company_id = $2`,
        [scopeId, companyId],
      );
      if (!row) throw new NotFoundException(`${scope} not found`);
    }
  }

  private audit(
    run: LeaveRecalculationRun,
    action: string,
    actor: AuthenticatedUser | null,
    payload: Record<string, unknown>,
  ) {
    return this.leaveAuditService.log({
      company_id: run.company_id,
      entity_name: 'leave_recalculation_run',
      entity_id: run.id,
      action,
      actor: actor ?? undefined,
      payload: { reference: run.reference, scope: run.scope_key, ...payload },
    });
  }
}
