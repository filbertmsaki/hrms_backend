import { openingOrCarriedDays } from '../utils/leave-balance-rules.util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../../common/utils/permission.util';
import { Company } from '../../../companies/entities/company.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveEncashmentRequest } from '../entities/leave-encashment-request.entity';
import { LeavePolicyType } from '../entities/leave-policy-type.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import {
  LeaveRolloverException,
  LeaveRolloverLine,
} from '../entities/leave-rollover-line.entity';
import { LeaveRolloverRun } from '../entities/leave-rollover-run.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { roundLeaveDays } from '../utils/leave-accrual.util';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveBalanceService, PolicyAssignment } from './leave-balance.service';
import { LeaveEncashmentCalculatorService } from './leave-encashment-calculator.service';
import { LeaveStatutoryService } from './leave-statutory.service';

/** How a year's unused days split; all parts add up to `unused`. */
export type RolloverSplit = {
  unused: number;
  protected: number;
  carry: number;
  encash: number;
  lapse: number;
  retained: number;
};

/**
 * The rollover rule, in order: carry forward (rules + accumulation cap),
 * then automatic encashment of what is left, then lapse — except protected
 * days (statutory/contractual minimum not already carried or encashed) and,
 * when lapse is disabled or its legality is unverified, the rest, which are
 * retained on the new year. Nothing is ever silently dropped.
 */
export function splitUnusedDays(input: {
  unused: number;
  carry: number;
  protectedMinimum: number;
  autoEncash: {
    enabled: boolean;
    method: 'all' | 'limited' | 'percentage' | null;
    maxDays: number | null;
    percentage: number | null;
  } | null;
  lapseAllowed: boolean;
}): RolloverSplit {
  const unused = roundLeaveDays(Math.max(0, input.unused));
  const carry = roundLeaveDays(Math.min(Math.max(0, input.carry), unused));
  let left = roundLeaveDays(unused - carry);
  let encash = 0;
  if (input.autoEncash?.enabled && left > 0) {
    const method = input.autoEncash.method ?? 'all';
    encash =
      method === 'percentage'
        ? (left *
            Math.min(Math.max(input.autoEncash.percentage ?? 0, 0), 100)) /
          100
        : left;
    if (method !== 'all' && input.autoEncash.maxDays !== null) {
      encash = Math.min(encash, input.autoEncash.maxDays);
    }
    encash = roundLeaveDays(Math.min(encash, left));
    left = roundLeaveDays(left - encash);
  }
  const protectedDays = roundLeaveDays(
    Math.min(Math.max(0, input.protectedMinimum), unused),
  );
  const protectedStillOpen = Math.max(0, protectedDays - carry - encash);
  const retainedProtected = roundLeaveDays(Math.min(left, protectedStillOpen));
  const lapseCandidates = roundLeaveDays(left - retainedProtected);
  const lapse = input.lapseAllowed ? lapseCandidates : 0;
  const retained = roundLeaveDays(
    retainedProtected + (input.lapseAllowed ? 0 : lapseCandidates),
  );
  return { unused, protected: protectedDays, carry, encash, lapse, retained };
}

const OPEN_STATUSES = ['draft', 'previewed', 'pending_approval', 'approved'];

@Injectable()
export class LeaveRolloverService {
  private readonly logger = new Logger(LeaveRolloverService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly ledger: LeaveBalanceLedgerService,
    private readonly calculator: LeaveEncashmentCalculatorService,
    private readonly statutory: LeaveStatutoryService,
    private readonly leaveAuditService: LeaveAuditService,
  ) {}

  // ---------------------------------------------------------------- reading

  async listRuns(companyId: number) {
    return this.dataSource.getRepository(LeaveRolloverRun).find({
      where: { company_id: companyId },
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async getRun(companyId: number, runId: number, manager?: EntityManager) {
    const run = await (manager ?? this.dataSource.manager)
      .getRepository(LeaveRolloverRun)
      .findOne({ where: { id: runId, company_id: companyId } });
    if (!run) throw new NotFoundException('Rollover run not found');
    return run;
  }

  async getRunWithLines(companyId: number, runId: number) {
    const run = await this.getRun(companyId, runId);
    const lines = await this.dataSource.getRepository(LeaveRolloverLine).find({
      where: { run_id: run.id },
      order: { employee_id: 'ASC', leave_type_id: 'ASC' },
    });
    const employees = new Map(
      (
        await this.dataSource.getRepository(Employee).find({
          where: {
            company_id: companyId,
            id: In(
              [...new Set(lines.map((line) => line.employee_id))].concat(0),
            ),
          },
          select: ['id', 'employee_no', 'first_name', 'last_name'],
        })
      ).map((employee) => [employee.id, employee]),
    );
    const types = new Map(
      (
        await this.dataSource.getRepository(LeaveType).find({
          where: { company_id: companyId },
          select: ['id', 'name'],
        })
      ).map((type) => [type.id, type.name]),
    );
    return {
      ...run,
      lines: lines.map((line) => {
        const employee = employees.get(line.employee_id);
        return {
          ...line,
          employee_no: employee?.employee_no ?? null,
          employee_name: employee
            ? [employee.first_name, employee.last_name]
                .filter(Boolean)
                .join(' ')
            : null,
          leave_type_name: types.get(line.leave_type_id) ?? null,
        };
      }),
    };
  }

  /** CSV of a run's lines (the rollover processing report). */
  async exportRunCsv(companyId: number, runId: number): Promise<string> {
    const run = await this.getRunWithLines(companyId, runId);
    const header = [
      'employee_no',
      'employee_name',
      'leave_type',
      'policy_id',
      'policy_version',
      'opening',
      'accrued',
      'used',
      'unused',
      'protected',
      'carry_forward',
      'encash',
      'lapse',
      'retained',
      'closing',
      'encash_amount',
      'currency',
      'status',
      'exceptions',
    ];
    const escape = (value: unknown) => {
      const text =
        value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value as string | number | boolean);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = run.lines.map((line) =>
      [
        line.employee_no,
        line.employee_name,
        line.leave_type_name,
        line.policy_id,
        line.policy_version_no,
        line.opening_days,
        line.accrued_days,
        line.used_days,
        line.unused_days,
        line.protected_days,
        line.carry_forward_days,
        line.encash_days,
        line.lapse_days,
        line.retained_days,
        line.closing_days,
        line.encash_amount,
        line.currency,
        line.status,
        line.exceptions
          .map((item) => `${item.severity}:${item.code}`)
          .join(' '),
      ]
        .map(escape)
        .join(','),
    );
    return [header.join(','), ...rows].join('\n');
  }

  // ---------------------------------------------------------------- preview

  /**
   * Creates (or refreshes) a preview for closing `fromLeaveYear`: one line
   * per open balance, using the policy version in effect at that year's end.
   */
  async createPreview(
    companyId: number,
    dto: {
      from_leave_year: string;
      leave_type_id?: number | null;
      notes?: string;
    },
    actor: AuthenticatedUser | null,
    executionMode: 'manual_approval' | 'automatic' = 'manual_approval',
  ) {
    if (!/^\d{4}$/.test(dto.from_leave_year)) {
      throw new BadRequestException('from_leave_year must be a 4-digit year.');
    }
    const runRepository = this.dataSource.getRepository(LeaveRolloverRun);
    const open = await runRepository.findOne({
      where: {
        company_id: companyId,
        from_leave_year: dto.from_leave_year,
        status: In(OPEN_STATUSES),
      },
    });
    if (open && (open.leave_type_id ?? null) === (dto.leave_type_id ?? null)) {
      if (['approved'].includes(open.status)) {
        throw new ConflictException(
          `Rollover run ${open.id} for ${dto.from_leave_year} is approved and waiting to post.`,
        );
      }
      return this.refreshPreview(companyId, open.id, actor);
    }
    const run = await runRepository.save(
      runRepository.create({
        company_id: companyId,
        from_leave_year: dto.from_leave_year,
        leave_type_id: dto.leave_type_id ?? null,
        status: 'draft',
        execution_mode: executionMode,
        as_of_date: new Date().toISOString().slice(0, 10),
        notes: dto.notes?.trim() || null,
        created_by_company_user_id: actor?.companyMembershipId ?? null,
      }),
    );
    await this.audit(companyId, 'leave_rollover.created', run, actor);
    return this.refreshPreview(companyId, run.id, actor);
  }

  async refreshPreview(
    companyId: number,
    runId: number,
    actor: AuthenticatedUser | null,
  ) {
    const run = await this.getRun(companyId, runId);
    if (!['draft', 'previewed', 'pending_approval'].includes(run.status)) {
      throw new BadRequestException(
        `A ${run.status} rollover run can no longer be recalculated.`,
      );
    }
    const balances = await this.dataSource.getRepository(LeaveBalance).find({
      where: {
        company_id: companyId,
        fiscal_year: run.from_leave_year,
        ...(run.leave_type_id ? { leave_type_id: run.leave_type_id } : {}),
      },
      order: { employee_id: 'ASC', leave_type_id: 'ASC' },
    });
    const lines: Array<Partial<LeaveRolloverLine>> = [];
    for (const balance of balances) {
      if (balance.closed_at) continue;
      try {
        lines.push(await this.calculateLine(companyId, run, balance));
      } catch (error) {
        lines.push({
          run_id: run.id,
          company_id: companyId,
          employee_id: balance.employee_id,
          leave_type_id: balance.leave_type_id,
          source_balance_id: balance.id,
          status: 'pending',
          exceptions: [
            {
              code: 'calculation_failed',
              severity: 'error',
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        });
      }
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(LeaveRolloverLine).delete({ run_id: run.id });
      if (lines.length) {
        await manager.getRepository(LeaveRolloverLine).save(lines);
      }
      const totals = this.totals(lines);
      await manager.getRepository(LeaveRolloverRun).update(
        { id: run.id },
        {
          status:
            run.status === 'pending_approval'
              ? 'pending_approval'
              : 'previewed',
          as_of_date: new Date().toISOString().slice(0, 10),
          totals,
          exception_count: lines.filter((line) =>
            (line.exceptions ?? []).some((item) => item.severity === 'error'),
          ).length,
        },
      );
    });
    await this.audit(companyId, 'leave_rollover.previewed', run, actor, {
      lines: lines.length,
    });
    return this.getRunWithLines(companyId, run.id);
  }

  private totals(lines: Array<Partial<LeaveRolloverLine>>) {
    const sum = (key: keyof LeaveRolloverLine) =>
      roundLeaveDays(
        lines.reduce((total, line) => total + Number(line[key] ?? 0), 0),
      );
    return {
      lines: lines.length,
      unused_days: sum('unused_days'),
      carry_forward_days: sum('carry_forward_days'),
      encash_days: sum('encash_days'),
      lapse_days: sum('lapse_days'),
      retained_days: sum('retained_days'),
      protected_days: sum('protected_days'),
      encash_amount:
        Math.round(
          lines.reduce(
            (total, line) => total + Number(line.encash_amount ?? 0),
            0,
          ) * 100,
        ) / 100,
    };
  }

  /** One balance's rollover, without writing anything. */
  async calculateLine(
    companyId: number,
    run: Pick<LeaveRolloverRun, 'id' | 'from_leave_year'>,
    balance: LeaveBalance,
    manager?: EntityManager,
  ): Promise<Partial<LeaveRolloverLine>> {
    const em = manager ?? this.dataSource.manager;
    const employee = await em.getRepository(Employee).findOneOrFail({
      where: { id: balance.employee_id, company_id: companyId },
    });
    const leaveType = await em.getRepository(LeaveType).findOneOrFail({
      where: { id: balance.leave_type_id, company_id: companyId },
    });
    const yearEnd =
      balance.leave_year_end_date?.slice(0, 10) ??
      `${balance.fiscal_year}-12-31`;
    // The policy version in effect on the last day of the year being closed.
    const policies = await this.leaveBalanceService.findActivePolicies(
      companyId,
      manager,
      yearEnd,
    );
    let assignment: PolicyAssignment | null = null;
    const exceptions: LeaveRolloverException[] = [];
    try {
      assignment = this.leaveBalanceService.selectPolicyAssignment(
        policies,
        employee,
        balance.leave_type_id,
      );
    } catch (error) {
      exceptions.push({
        code: 'policy_conflict',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (!assignment) {
      exceptions.push({
        code: 'no_policy',
        severity: 'warning',
        message:
          'No leave policy applied at year end; leave-type defaults are used.',
      });
    }
    const pending = await em
      .getRepository(LeaveRequest)
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', {
        employeeId: employee.id,
      })
      .andWhere('request.leave_type_id = :leaveTypeId', {
        leaveTypeId: balance.leave_type_id,
      })
      .andWhere('request.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
        ],
      })
      .andWhere('request.start_date <= :end', { end: yearEnd })
      .andWhere('request.end_date >= :start', {
        start:
          balance.leave_year_start_date?.slice(0, 10) ??
          `${balance.fiscal_year}-01-01`,
      })
      .getCount();
    if (pending > 0) {
      exceptions.push({
        code: 'pending_requests',
        severity: 'error',
        message: `${pending} leave request(s) in this year are still awaiting approval; decide them before closing the year.`,
      });
    }
    const split = this.leaveBalanceService.yearEndSplit(
      balance,
      leaveType,
      assignment,
      employee,
    );
    const policyType: LeavePolicyType | null = assignment?.policyType ?? null;
    const statutoryProtected = await this.statutory.protectedUnusedDays(
      companyId,
      { ...employee },
      balance.leave_type_id,
      yearEnd,
      manager,
    );
    const statutoryAnnual = await this.statutory.annualMinimum(
      companyId,
      { ...employee },
      balance.leave_type_id,
      yearEnd,
      manager,
    );
    const protectedMinimum = Math.max(
      Number(policyType?.protected_minimum_days ?? 0),
      statutoryProtected?.days ?? 0,
    );
    // Annual leave without a verified statutory rule: lapse is not proven to
    // be lawful, so unused days are retained and flagged for HR review.
    const legalUnverified =
      leaveType.code?.toUpperCase() === 'ANNUAL' && !statutoryAnnual;
    const lapseAllowed =
      (policyType?.lapse_enabled ?? true) && !legalUnverified;
    const result = splitUnusedDays({
      unused: split.remaining,
      carry: split.carried,
      protectedMinimum,
      autoEncash: policyType?.auto_encash_enabled
        ? {
            enabled: true,
            method: policyType.auto_encash_method,
            maxDays:
              policyType.auto_encash_max_days == null
                ? null
                : Number(policyType.auto_encash_max_days),
            percentage:
              policyType.auto_encash_percentage == null
                ? null
                : Number(policyType.auto_encash_percentage),
          }
        : null,
      lapseAllowed,
    });
    if (
      legalUnverified &&
      result.retained > 0 &&
      (policyType?.lapse_enabled ?? true)
    ) {
      exceptions.push({
        code: 'legal_treatment_unverified',
        severity: 'warning',
        message:
          'No active statutory annual-leave rule for this employee; days that would lapse are retained until HR decides.',
      });
    }
    let encashAmount: number | null = null;
    let dailyRate: number | null = null;
    let currency: string | null = null;
    let encash = result.encash;
    let retained = result.retained;
    if (encash > 0 && policyType) {
      try {
        const calc = await this.calculator.calculate(
          {
            companyId,
            employeeId: employee.id,
            policyType,
            days: encash,
            asOf: yearEnd,
          },
          manager,
        );
        encashAmount = calc.amount;
        dailyRate = calc.daily_rate;
        currency = calc.currency;
      } catch (error) {
        // Cannot price it: keep the days (retained) rather than pay a guess.
        exceptions.push({
          code: 'encashment_not_calculable',
          severity: 'warning',
          message: `${error instanceof Error ? error.message : String(error)} The ${encash} day(s) are retained instead.`,
        });
        retained = roundLeaveDays(retained + encash);
        encash = 0;
      }
    }
    const opening = openingOrCarriedDays(balance);
    return {
      run_id: run.id,
      company_id: companyId,
      employee_id: employee.id,
      leave_type_id: balance.leave_type_id,
      source_balance_id: balance.id,
      policy_id: assignment?.policy.id ?? null,
      policy_version_no: assignment?.policy.version_no ?? null,
      statutory_rule_set_id:
        statutoryAnnual?.ruleSetId ?? statutoryProtected?.ruleSetId ?? null,
      opening_days: opening.toFixed(4),
      accrued_days: Number(balance.accrued_days ?? 0).toFixed(4),
      used_days: Number(balance.used_days ?? 0).toFixed(4),
      unused_days: result.unused.toFixed(4),
      protected_days: result.protected.toFixed(4),
      carry_forward_days: result.carry.toFixed(4),
      encash_days: encash.toFixed(4),
      lapse_days: result.lapse.toFixed(4),
      retained_days: retained.toFixed(4),
      closing_days: roundLeaveDays(result.carry + retained).toFixed(4),
      encash_amount: encashAmount === null ? null : encashAmount.toFixed(2),
      encash_daily_rate: dailyRate === null ? null : dailyRate.toFixed(4),
      currency,
      status: 'pending',
      exceptions,
      calculation: {
        year_end: yearEnd,
        carry_rules_carried: split.carried,
        protected_minimum: protectedMinimum,
        statutory_protected: statutoryProtected?.days ?? null,
        lapse_allowed: lapseAllowed,
        legal_unverified: legalUnverified,
      },
    };
  }

  // ------------------------------------------------------- approval/posting

  async submit(companyId: number, runId: number, actor: AuthenticatedUser) {
    const run = await this.getRun(companyId, runId);
    if (run.status !== 'previewed') {
      throw new BadRequestException('Only a previewed run can be submitted.');
    }
    run.status = 'pending_approval';
    run.submitted_by_company_user_id = actor.companyMembershipId ?? null;
    run.submitted_at = new Date();
    await this.dataSource.getRepository(LeaveRolloverRun).save(run);
    await this.audit(companyId, 'leave_rollover.submitted', run, actor);
    return run;
  }

  /**
   * Approves and posts a run. Lines with blocking exceptions are skipped
   * (their year stays open). Each line posts in its own transaction and is
   * idempotent, so a failed run can be retried safely.
   */
  async approveAndPost(
    companyId: number,
    runId: number,
    actor: AuthenticatedUser | null,
  ) {
    if (actor && !hasPermission(actor.permissions, 'leave_rollover:approve')) {
      throw new ForbiddenException(
        'Approving a rollover needs leave_rollover:approve.',
      );
    }
    const claimed = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRolloverRun);
      const run = await repository.findOne({
        where: { id: runId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!run) throw new NotFoundException('Rollover run not found');
      const allowed =
        run.execution_mode === 'automatic'
          ? [
              'previewed',
              'pending_approval',
              'approved',
              'partially_failed',
              'failed',
            ]
          : ['pending_approval', 'approved', 'partially_failed', 'failed'];
      if (!allowed.includes(run.status)) {
        throw new BadRequestException(
          run.status === 'previewed'
            ? 'Submit the previewed run for approval first.'
            : `A ${run.status} run cannot be posted.`,
        );
      }
      if (
        run.status !== 'approved' &&
        !['partially_failed', 'failed'].includes(run.status)
      ) {
        run.approved_by_company_user_id = actor?.companyMembershipId ?? null;
        run.approved_at = new Date();
      }
      run.status = 'processing';
      run.processing_started_at = new Date();
      run.error = null;
      return repository.save(run);
    });
    await this.audit(companyId, 'leave_rollover.approved', claimed, actor);

    const lines = await this.dataSource.getRepository(LeaveRolloverLine).find({
      where: { run_id: claimed.id, status: In(['pending', 'failed']) },
      order: { id: 'ASC' },
    });
    let failed = 0;
    for (const line of lines) {
      if (line.exceptions.some((item) => item.severity === 'error')) {
        await this.dataSource
          .getRepository(LeaveRolloverLine)
          .update({ id: line.id }, { status: 'skipped' });
        continue;
      }
      try {
        await this.dataSource.transaction((manager) =>
          this.postLine(companyId, claimed, line, actor, manager),
        );
      } catch (error) {
        failed += 1;
        await this.dataSource.getRepository(LeaveRolloverLine).update(
          { id: line.id },
          {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
        );
        this.logger.error(
          `Rollover run ${claimed.id} line ${line.id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    const status = failed
      ? failed === lines.length
        ? 'failed'
        : 'partially_failed'
      : 'completed';
    await this.dataSource.getRepository(LeaveRolloverRun).update(
      { id: claimed.id },
      {
        status,
        completed_at: status === 'completed' ? new Date() : null,
        error: failed
          ? `${failed} line(s) failed; retry posting after fixing them.`
          : null,
      },
    );
    await this.audit(companyId, `leave_rollover.${status}`, claimed, actor, {
      failed,
    });
    return this.getRunWithLines(companyId, claimed.id);
  }

  private async postLine(
    companyId: number,
    run: LeaveRolloverRun,
    line: LeaveRolloverLine,
    actor: AuthenticatedUser | null,
    manager: EntityManager,
  ) {
    const balanceRepository = manager.getRepository(LeaveBalance);
    const source = await balanceRepository.findOne({
      where: { id: line.source_balance_id, company_id: companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!source) throw new Error('Source balance no longer exists');
    if (source.closed_by_rollover_run_id === run.id) {
      await manager
        .getRepository(LeaveRolloverLine)
        .update({ id: line.id }, { status: 'posted' });
      return;
    }
    if (source.closed_at) {
      throw new Error(
        `Leave year ${source.fiscal_year} was already closed by run ${source.closed_by_rollover_run_id}.`,
      );
    }
    const yearEnd =
      source.leave_year_end_date?.slice(0, 10) ?? `${source.fiscal_year}-12-31`;
    const key = `rollover:${run.id}:${line.id}`;
    const encash = Number(line.encash_days);
    let encashmentRequestId: number | null = line.encashment_request_id;
    if (encash > 0 && !encashmentRequestId) {
      const encashRepository = manager.getRepository(LeaveEncashmentRequest);
      const request = await encashRepository.save(
        encashRepository.create({
          company_id: companyId,
          employee_id: source.employee_id,
          leave_type_id: source.leave_type_id,
          leave_balance_id: source.id,
          fiscal_year: source.fiscal_year,
          requested_days: encash.toFixed(2),
          approved_days: encash.toFixed(2),
          minimum_balance_after_encashment: '0.00',
          reason: `Automatic year-end encashment (rollover run ${run.id})`,
          status: 'approved',
          reviewed_by_company_user_id: actor?.companyMembershipId ?? null,
          reviewed_at: new Date(),
          created_by_company_user_id: actor?.companyMembershipId ?? null,
          source: 'rollover',
          rollover_line_id: line.id,
          currency: line.currency,
          calculated_amount: line.encash_amount,
          payable_amount: line.encash_amount,
          daily_rate: line.encash_daily_rate,
          calculation: { rollover_run_id: run.id, ...(line.calculation ?? {}) },
          payment_status: 'NOT_PAID',
        }),
      );
      const ledger = await this.ledger.applyEncashment(
        source,
        {
          companyId,
          employeeId: source.employee_id,
          leaveTypeId: source.leave_type_id,
          leaveYear: source.fiscal_year,
          effectiveDate: yearEnd,
          days: encash,
          requestId: request.id,
          createdByCompanyUserId: actor?.companyMembershipId ?? null,
          reason: `Year-end automatic encashment (rollover run ${run.id})`,
          idempotencyKey: `${key}:encash`,
        },
        manager,
      );
      request.ledger_transaction_id = ledger.transaction.id;
      await encashRepository.save(request);
      encashmentRequestId = request.id;
    }
    const lapse = Number(line.lapse_days);
    if (lapse > 0) {
      await this.ledger.recordBalanceMovement(
        {
          balance: source,
          companyId,
          transactionType: LeaveBalanceTransactionTypeEnum.LAPSED,
          amountDays: -lapse,
          effectiveDate: yearEnd,
          reason: `Unused leave lapsed at the end of ${source.fiscal_year} (rollover run ${run.id})`,
          idempotencyKey: `${key}:lapse`,
          metadata: {
            rollover_run_id: run.id,
            rollover_line_id: line.id,
            policy_id: line.policy_id,
            policy_version_no: line.policy_version_no,
          },
        },
        manager,
      );
    }
    // Close the year being rolled over.
    const freshSource = await balanceRepository.findOneOrFail({
      where: { id: source.id },
    });
    freshSource.closed_at = new Date();
    freshSource.closed_by_rollover_run_id = run.id;
    await balanceRepository.save(freshSource);

    // Open (or update) the new year with the frozen carried and retained days.
    const employee = await manager.getRepository(Employee).findOneOrFail({
      where: { id: source.employee_id, company_id: companyId },
    });
    const nextYear = String(Number(source.fiscal_year) + 1);
    const target = await this.leaveBalanceService.ensureBalanceForEmployee(
      companyId,
      employee,
      source.leave_type_id,
      nextYear,
      manager,
      {},
    );
    target.carry_forward_locked_days = Number(line.carry_forward_days).toFixed(
      2,
    );
    target.retained_days = Number(line.retained_days).toFixed(2);
    await balanceRepository.save(target);
    const recalculated = await this.leaveBalanceService.recalculateBalance(
      companyId,
      employee,
      source.leave_type_id,
      nextYear,
      manager,
      target,
    );
    const carried = Number(line.carry_forward_days);
    if (carried > 0) {
      const already = await this.ledger.sumCarryForwardRecorded(
        recalculated,
        manager,
      );
      const delta = roundLeaveDays(carried - already);
      if (Math.abs(delta) >= 0.01) {
        await this.ledger.recordBalanceMovement(
          {
            balance: recalculated,
            companyId,
            transactionType: LeaveBalanceTransactionTypeEnum.CARRY_FORWARD,
            amountDays: delta,
            effectiveDate:
              recalculated.leave_year_start_date?.slice(0, 10) ??
              `${nextYear}-01-01`,
            reason: `Carried forward from ${source.fiscal_year} (rollover run ${run.id})`,
            idempotencyKey: `carry-forward:${recalculated.id}:${already}->${roundLeaveDays(carried)}`,
            metadata: {
              carried_forward_days: carried,
              rollover_run_id: run.id,
            },
          },
          manager,
        );
      }
    }
    await manager.getRepository(LeaveRolloverLine).update(
      { id: line.id },
      {
        status: 'posted',
        error: null,
        target_balance_id: recalculated.id,
        encashment_request_id: encashmentRequestId,
        posted_at: new Date(),
      },
    );
  }

  async cancel(
    companyId: number,
    runId: number,
    reason: string,
    actor: AuthenticatedUser,
  ) {
    const run = await this.getRun(companyId, runId);
    if (!['draft', 'previewed', 'pending_approval'].includes(run.status)) {
      throw new BadRequestException(
        'Only a run that has not started posting can be cancelled.',
      );
    }
    run.status = 'cancelled';
    run.cancelled_at = new Date();
    run.cancel_reason = reason?.trim() || null;
    await this.dataSource.getRepository(LeaveRolloverRun).save(run);
    await this.audit(companyId, 'leave_rollover.cancelled', run, actor, {
      reason,
    });
    return run;
  }

  // -------------------------------------------------------- automatic mode

  /**
   * Daily: for policies set to automatic rollover, preview and post the year
   * that ended yesterday or earlier. Manual-approval policies only get a
   * preview prepared for HR (never posted automatically).
   */
  @Cron('45 1 * * *')
  async runScheduled(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const companies = await this.dataSource
      .getRepository(Company)
      .find({ select: ['id'] });
    for (const company of companies) {
      try {
        await this.scheduleForCompany(company.id, today);
      } catch (error) {
        this.logger.error(
          `Scheduled rollover failed for company ${company.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async scheduleForCompany(companyId: number, today: string) {
    const due = await this.dataSource
      .getRepository(LeaveBalance)
      .createQueryBuilder('balance')
      .select('DISTINCT balance.fiscal_year', 'fiscal_year')
      .where('balance.company_id = :companyId', { companyId })
      .andWhere('balance.closed_at IS NULL')
      .andWhere('balance.leave_year_end_date < :today', { today })
      .getRawMany<{ fiscal_year: string }>();
    const policies = await this.leaveBalanceService.findActivePolicies(
      companyId,
      undefined,
      today,
    );
    // Post automatically only when every policy in effect opted in;
    // otherwise HR approves the prepared preview.
    const automatic =
      policies.length > 0 &&
      policies.every(
        (policy) => policy.rollover_execution_mode === 'automatic',
      );
    for (const { fiscal_year } of due) {
      const existing = await this.dataSource
        .getRepository(LeaveRolloverRun)
        .findOne({
          where: {
            company_id: companyId,
            from_leave_year: fiscal_year,
            status: In([...OPEN_STATUSES, 'processing']),
          },
        });
      if (existing && !automatic) continue;
      const preview = existing
        ? await this.getRunWithLines(companyId, existing.id)
        : await this.createPreview(
            companyId,
            {
              from_leave_year: fiscal_year,
              notes: 'Prepared automatically after the leave year ended',
            },
            null,
            automatic ? 'automatic' : 'manual_approval',
          );
      if (
        automatic &&
        preview.execution_mode === 'automatic' &&
        preview.status !== 'processing'
      ) {
        await this.approveAndPost(companyId, preview.id, null);
      }
    }
  }

  private async audit(
    companyId: number,
    action: string,
    run: LeaveRolloverRun,
    actor: AuthenticatedUser | null,
    extra: Record<string, unknown> = {},
  ) {
    await this.leaveAuditService.log({
      company_id: companyId,
      action,
      entity_name: 'leave_rollover_run',
      entity_id: run.id,
      actor: actor ?? undefined,
      payload: {
        from_leave_year: run.from_leave_year,
        leave_type_id: run.leave_type_id,
        status: run.status,
        ...extra,
      },
    });
  }
}
