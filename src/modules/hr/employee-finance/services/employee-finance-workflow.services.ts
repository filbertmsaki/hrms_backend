import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { PayrollPeriod } from '../../payroll/entities/payroll-configuration.entities';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollRun,
} from '../../payroll/entities/payroll-run.entities';
import { EmployeePayrollResultStatusEnum } from '../../payroll/payroll.enums';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import {
  CreateEmployeeFinanceAdjustmentDto,
  DecideEmployeeFinanceServicingRequestDto,
  ResolveEmployeeFinanceShortfallDto,
} from '../dto/employee-finance.dto';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
} from '../entities/employee-finance-account.entities';
import { EmployeeFinanceApplication } from '../entities/employee-finance-application.entities';
import { EmployeeFinanceAdjustment } from '../entities/employee-finance-servicing.entities';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceAdjustmentTypeEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
  EmployeeFinancePayrollInstructionStatusEnum,
  EmployeeFinanceRequestStatusEnum,
  EmployeeFinanceShortfallResolutionEnum,
} from '../employee-finance.enums';
import {
  actorMembershipId,
  recordValue,
  textValue,
} from '../employee-finance.utils';
import {
  EmployeeFinanceAuditService,
  EmployeeFinanceLedgerService,
  EmployeeFinanceRepaymentService,
  EmployeeFinanceRescheduleService,
  OPEN_INSTALLMENT_STATUSES,
  installmentRemainder,
} from './employee-finance-core.services';
import { EmployeeFinanceMoney } from './employee-finance-money.util';
import {
  EMPLOYEE_FINANCE_STAGE_PERMISSION,
  EmployeeFinanceAccountStatusService,
  EmployeeFinanceDelegationService,
  EmployeeFinanceNotifierService,
  EmployeeFinancePermissionDirectoryService,
  EmployeeFinanceRoutableStage,
  approvalTimingPolicy,
  assertDecidable,
  stageForStatus,
} from './employee-finance-policy.services';

const PENDING_STAGE_STATUSES = [
  EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
  EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
  EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
  EmployeeFinanceApplicationStatusEnum.PENDING_MANAGEMENT_APPROVAL,
];

/** Who hears about an application stuck at each stage, by escalation level. */
const ESCALATION_TARGETS: Record<
  EmployeeFinanceRoutableStage,
  EmployeeFinanceRoutableStage[]
> = {
  [EmployeeFinanceApprovalStageEnum.MANAGER]: [
    EmployeeFinanceApprovalStageEnum.HR,
    EmployeeFinanceApprovalStageEnum.MANAGEMENT,
  ],
  [EmployeeFinanceApprovalStageEnum.HR]: [
    EmployeeFinanceApprovalStageEnum.FINANCE,
    EmployeeFinanceApprovalStageEnum.MANAGEMENT,
  ],
  [EmployeeFinanceApprovalStageEnum.FINANCE]: [
    EmployeeFinanceApprovalStageEnum.MANAGEMENT,
    EmployeeFinanceApprovalStageEnum.MANAGEMENT,
  ],
  [EmployeeFinanceApprovalStageEnum.MANAGEMENT]: [
    EmployeeFinanceApprovalStageEnum.MANAGEMENT,
    EmployeeFinanceApprovalStageEnum.MANAGEMENT,
  ],
};

// ---------------------------------------------------------------------------
// Approval reminders and escalation
// ---------------------------------------------------------------------------

@Injectable()
export class EmployeeFinanceEscalationService {
  private readonly logger = new Logger(EmployeeFinanceEscalationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly notifier: EmployeeFinanceNotifierService,
    private readonly directory: EmployeeFinancePermissionDirectoryService,
    private readonly delegationService: EmployeeFinanceDelegationService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
  ) {}

  @Cron(process.env.EMPLOYEE_FINANCE_APPROVAL_SWEEP_CRON || '0 0 * * * *')
  async scheduledSweep() {
    try {
      return await this.sweep();
    } catch (error) {
      this.logger.error(
        `Approval escalation sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Reminds the current approvers (and their active delegates) when a stage
   * waits past its reminder window, then escalates to the next authority
   * after the escalation window, and again at twice that window.
   */
  async sweep(now = new Date(), companyId?: number) {
    const applications = await this.applicationRepository.find({
      where: {
        status: In(PENDING_STAGE_STATUSES),
        ...(companyId ? { companyId } : {}),
      },
      order: { id: 'ASC' },
    });
    let reminded = 0;
    let escalated = 0;
    for (const application of applications) {
      const stage = stageForStatus(application.status);
      if (!stage) continue;
      const policy = approvalTimingPolicy(
        recordValue(application.productSnapshot),
        this.configService,
      );
      const enteredAt =
        application.stageEnteredAt ??
        application.submittedAt ??
        application.updatedAt;
      if (!enteredAt) continue;
      const hoursWaiting =
        (now.getTime() - new Date(enteredAt).getTime()) / 3_600_000;
      let changed = false;
      const sinceReminder = application.lastRemindedAt
        ? (now.getTime() - new Date(application.lastRemindedAt).getTime()) /
          3_600_000
        : Number.POSITIVE_INFINITY;
      if (
        hoursWaiting >= policy.reminderHours &&
        sinceReminder >= policy.reminderHours
      ) {
        const approvers = await this.notifier.approverMembershipIds(
          application,
          stage,
        );
        const delegates = await this.delegationService.activeDelegatesFor(
          application.companyId,
          approvers,
          stage,
        );
        await this.notifier.notifyMemberships(
          application.companyId,
          [...approvers, ...delegates],
          {
            title: 'Reminder: loan application waiting for you',
            message: `${application.applicationNo} has waited ${Math.floor(hoursWaiting)} hours for ${stage.toLowerCase()} review.`,
            entityType: 'EMPLOYEE_FINANCE_APPLICATION',
            entityId: application.id,
            actionUrl: '/dashboard/finance/applications',
            dedupeKey: `ef-reminder:${application.id}:${application.approvalCycle}:${stage}:${Math.floor(hoursWaiting / policy.reminderHours)}`,
          },
        );
        application.lastRemindedAt = now;
        reminded += 1;
        changed = true;
      }
      const dueLevel = Math.min(
        2,
        Math.floor(hoursWaiting / policy.escalationHours),
      );
      if (dueLevel > (application.escalationLevel ?? 0)) {
        const target = ESCALATION_TARGETS[stage][dueLevel - 1];
        const recipients = await this.directory.membershipIdsWithPermission(
          application.companyId,
          EMPLOYEE_FINANCE_STAGE_PERMISSION[target],
        );
        await this.notifier.notifyMemberships(
          application.companyId,
          recipients,
          {
            title: 'Escalation: overdue loan approval',
            message: `${application.applicationNo} has waited ${Math.floor(hoursWaiting)} hours at ${stage.toLowerCase()} review, beyond the ${policy.escalationHours}-hour limit.`,
            entityType: 'EMPLOYEE_FINANCE_APPLICATION',
            entityId: application.id,
            actionUrl: '/dashboard/finance/applications',
            priority: NotificationPriorityEnum.HIGH,
            dedupeKey: `ef-escalation:${application.id}:${application.approvalCycle}:${stage}:${dueLevel}`,
          },
        );
        await this.auditService.log({
          companyId: application.companyId,
          action: 'finance.application.escalated',
          entityType: 'EMPLOYEE_FINANCE_APPLICATION',
          entityId: application.id,
          summary: {
            stage,
            escalation_level: dueLevel,
            escalated_to: target,
            hours_waiting: Math.floor(hoursWaiting),
          },
        });
        application.escalationLevel = dueLevel;
        escalated += 1;
        changed = true;
      }
      if (changed) {
        await this.applicationRepository.update(
          { id: application.id, companyId: application.companyId },
          {
            lastRemindedAt: application.lastRemindedAt,
            escalationLevel: application.escalationLevel,
          },
        );
      }
    }
    return {
      checked: applications.length,
      reminded,
      escalated,
    };
  }
}

// ---------------------------------------------------------------------------
// Penalties, waivers, and write-offs (maker-checker)
// ---------------------------------------------------------------------------

const ADJUSTABLE_ACCOUNT_STATUSES = [
  EmployeeFinanceAccountStatusEnum.ACTIVE,
  EmployeeFinanceAccountStatusEnum.IN_ARREARS,
  EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
  EmployeeFinanceAccountStatusEnum.DEFERRED,
  EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY,
];

@Injectable()
export class EmployeeFinanceAdjustmentService {
  constructor(
    private readonly ledgerService: EmployeeFinanceLedgerService,
    private readonly auditService: EmployeeFinanceAuditService,
    private readonly accountStatusService: EmployeeFinanceAccountStatusService,
    private readonly notifier: EmployeeFinanceNotifierService,
    @InjectRepository(EmployeeFinanceAdjustment)
    private readonly adjustmentRepository: Repository<EmployeeFinanceAdjustment>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository: Repository<EmployeeFinancePayrollInstruction>,
  ) {}

  list(
    actor: AuthenticatedUser,
    query: { status?: string; account_id?: number },
  ) {
    return this.adjustmentRepository.find({
      where: {
        companyId: actor.companyId!,
        ...(query.status ? { status: query.status } : {}),
        ...(query.account_id ? { accountId: Number(query.account_id) } : {}),
      },
      order: { id: 'DESC' },
      take: 500,
    });
  }

  async create(
    actor: AuthenticatedUser,
    accountId: number,
    dto: CreateEmployeeFinanceAdjustmentDto,
  ) {
    const account = await this.loadAdjustableAccount(
      actor.companyId!,
      accountId,
    );
    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 3) {
      throw new BadRequestException('A reason is required.');
    }
    const amounts = await this.validatedAmounts(
      account,
      dto.adjustment_type,
      dto.amount,
      dto.installment_id,
    );
    const adjustment = await this.adjustmentRepository.save(
      this.adjustmentRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        installmentId: amounts.installmentId,
        adjustmentType: dto.adjustment_type,
        principalAmount: amounts.principal,
        interestAmount: amounts.interest,
        feeAmount: amounts.fee,
        reason,
        source: 'MANUAL',
        status: EmployeeFinanceRequestStatusEnum.PENDING,
        idempotencyKey: `manual:${dto.adjustment_type}:${account.id}:${Date.now()}:${actorMembershipId(actor)}`,
        createdByCompanyUserId: actorMembershipId(actor),
      }),
    );
    await this.auditService.log({
      actor,
      action: 'finance.adjustment.requested',
      entityType: 'EMPLOYEE_FINANCE_ADJUSTMENT',
      entityId: adjustment.id,
      summary: {
        account_id: account.id,
        adjustment_type: adjustment.adjustmentType,
        principal: adjustment.principalAmount,
        interest: adjustment.interestAmount,
        fee: adjustment.feeAmount,
      },
    });
    return adjustment;
  }

  async decide(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideEmployeeFinanceServicingRequestDto,
  ) {
    const adjustment = await this.adjustmentRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!adjustment) throw new NotFoundException('Adjustment not found.');
    assertDecidable(adjustment, actor, adjustment.createdByCompanyUserId);
    const approved = dto.decision === EmployeeFinanceRequestStatusEnum.APPROVED;
    if (
      !approved &&
      dto.decision !== EmployeeFinanceRequestStatusEnum.REJECTED
    ) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED.');
    }
    const account = await this.loadAdjustableAccount(
      adjustment.companyId,
      adjustment.accountId,
    );
    if (approved) {
      await this.apply(adjustment, account, actor);
    }
    adjustment.status = approved
      ? EmployeeFinanceRequestStatusEnum.APPROVED
      : EmployeeFinanceRequestStatusEnum.REJECTED;
    adjustment.decidedByCompanyUserId = actorMembershipId(actor);
    adjustment.decidedAt = new Date();
    adjustment.decisionComments = dto.comments?.trim() || null;
    const saved = await this.adjustmentRepository.save(adjustment);
    await this.auditService.log({
      actor,
      action: approved
        ? 'finance.adjustment.approved'
        : 'finance.adjustment.rejected',
      entityType: 'EMPLOYEE_FINANCE_ADJUSTMENT',
      entityId: saved.id,
      summary: {
        account_id: saved.accountId,
        adjustment_type: saved.adjustmentType,
      },
    });
    if (approved) {
      const label: Record<string, string> = {
        [EmployeeFinanceAdjustmentTypeEnum.PENALTY]: `A late-payment charge of ${saved.feeAmount} was added to`,
        [EmployeeFinanceAdjustmentTypeEnum.INTEREST_WAIVER]: `Interest of ${saved.interestAmount} was waived on`,
        [EmployeeFinanceAdjustmentTypeEnum.FEE_WAIVER]: `Fees of ${saved.feeAmount} were waived on`,
        [EmployeeFinanceAdjustmentTypeEnum.WRITE_OFF]:
          'The remaining balance was written off on',
      };
      await this.notifier.notifyEmployee(
        account.companyId,
        account.employeeId,
        {
          title: 'Loan account updated',
          message: `${label[saved.adjustmentType] ?? 'An adjustment was applied to'} ${account.accountNo}.`,
          entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
          entityId: account.id,
          actionUrl: '/dashboard/me/finance',
          dedupeKey: `ef-adjustment:${saved.id}`,
        },
      );
    }
    return saved;
  }

  private async loadAdjustableAccount(companyId: number, accountId: number) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (!ADJUSTABLE_ACCOUNT_STATUSES.includes(account.status)) {
      throw new ConflictException(
        `A ${account.status.toLowerCase()} account cannot be adjusted.`,
      );
    }
    return account;
  }

  private async openInstallments(account: EmployeeFinanceAccount) {
    return this.installmentRepository.find({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
  }

  private async validatedAmounts(
    account: EmployeeFinanceAccount,
    type: EmployeeFinanceAdjustmentTypeEnum,
    amount: string | undefined,
    installmentId: number | undefined,
  ) {
    await this.ledgerService.ensureInterestAccrued(
      account.companyId,
      account.id,
    );
    const balance = await this.ledgerService.calculateBalance(
      account.companyId,
      account.id,
    );
    const open = await this.openInstallments(account);
    const zero = '0.00';
    if (type === EmployeeFinanceAdjustmentTypeEnum.WRITE_OFF) {
      if (EmployeeFinanceMoney.toCents(balance.total) <= 0n) {
        throw new ConflictException('Nothing is left to write off.');
      }
      const positive = (value: string) =>
        EmployeeFinanceMoney.toCents(value) > 0n ? value : zero;
      return {
        installmentId: null,
        principal: positive(balance.principal),
        interest: positive(balance.interest),
        fee: positive(balance.fees),
      };
    }
    const cents = EmployeeFinanceMoney.toCents(amount ?? '0');
    if (cents <= 0n) {
      throw new BadRequestException('Amount must be above zero.');
    }
    const value = EmployeeFinanceMoney.fromCents(cents);
    if (type === EmployeeFinanceAdjustmentTypeEnum.PENALTY) {
      const target = installmentId
        ? open.find((item) => item.id === installmentId)
        : (open.find(
            (item) =>
              item.status === EmployeeFinanceInstallmentStatusEnum.OVERDUE,
          ) ?? open[0]);
      if (!target) {
        throw new ConflictException(
          'Penalties can only be charged to an unpaid instalment.',
        );
      }
      return {
        installmentId: target.id,
        principal: zero,
        interest: zero,
        fee: value,
      };
    }
    if (type === EmployeeFinanceAdjustmentTypeEnum.INTEREST_WAIVER) {
      const waivable = open.reduce(
        (sum, item) => sum + installmentRemainder(item).interest,
        0n,
      );
      const limit = EmployeeFinanceMoney.toCents(balance.interest);
      const cap = waivable < limit ? waivable : limit;
      if (cents > cap) {
        throw new BadRequestException(
          `At most ${EmployeeFinanceMoney.fromCents(cap > 0n ? cap : 0n)} of interest can be waived.`,
        );
      }
      return {
        installmentId: null,
        principal: zero,
        interest: value,
        fee: zero,
      };
    }
    const waivableFees = open.reduce(
      (sum, item) => sum + installmentRemainder(item).fee,
      0n,
    );
    const feeLimit = EmployeeFinanceMoney.toCents(balance.fees);
    const feeCap = waivableFees < feeLimit ? waivableFees : feeLimit;
    if (cents > feeCap) {
      throw new BadRequestException(
        `At most ${EmployeeFinanceMoney.fromCents(feeCap > 0n ? feeCap : 0n)} of fees can be waived.`,
      );
    }
    return { installmentId: null, principal: zero, interest: zero, fee: value };
  }

  /** Posts the adjustment to the ledger and keeps the schedule in step. */
  private async apply(
    adjustment: EmployeeFinanceAdjustment,
    account: EmployeeFinanceAccount,
    actor: AuthenticatedUser,
  ) {
    const key = `adjustment:${adjustment.id}`;
    const today = new Date().toISOString().slice(0, 10);
    const postedBy = actorMembershipId(actor);
    const open = await this.openInstallments(account);
    if (
      (adjustment.adjustmentType as EmployeeFinanceAdjustmentTypeEnum) ===
      EmployeeFinanceAdjustmentTypeEnum.PENALTY
    ) {
      const target =
        open.find((item) => item.id === adjustment.installmentId) ?? open[0];
      if (!target) {
        throw new ConflictException('The instalment is no longer unpaid.');
      }
      target.feeDue = EmployeeFinanceMoney.add(
        target.feeDue,
        adjustment.feeAmount,
      );
      target.totalDue = EmployeeFinanceMoney.add(
        target.totalDue,
        adjustment.feeAmount,
      );
      await this.installmentRepository.save(target);
      await this.ledgerService.post({
        companyId: account.companyId,
        accountId: account.id,
        installmentId: target.id,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.PENALTY,
        direction: 'DEBIT',
        feeAmount: adjustment.feeAmount,
        effectiveDate: today,
        sourceType: 'ADJUSTMENT',
        sourceId: String(adjustment.id),
        idempotencyKey: key,
        postedByCompanyUserId: postedBy,
        description: adjustment.reason,
      });
      await this.accountStatusService.refresh(account.companyId, account.id);
      return;
    }
    if (
      (adjustment.adjustmentType as EmployeeFinanceAdjustmentTypeEnum) ===
        EmployeeFinanceAdjustmentTypeEnum.INTEREST_WAIVER ||
      (adjustment.adjustmentType as EmployeeFinanceAdjustmentTypeEnum) ===
        EmployeeFinanceAdjustmentTypeEnum.FEE_WAIVER
    ) {
      const interestWaiver =
        (adjustment.adjustmentType as EmployeeFinanceAdjustmentTypeEnum) ===
        EmployeeFinanceAdjustmentTypeEnum.INTEREST_WAIVER;
      let remaining = EmployeeFinanceMoney.toCents(
        interestWaiver ? adjustment.interestAmount : adjustment.feeAmount,
      );
      // Interest is waived from the latest instalments back (future interest
      // first); fees from the earliest forward.
      const ordered = interestWaiver ? [...open].reverse() : open;
      const changed: EmployeeFinanceInstallment[] = [];
      for (const installment of ordered) {
        if (remaining <= 0n) break;
        const owed = installmentRemainder(installment);
        const available = interestWaiver ? owed.interest : owed.fee;
        const cut = available < remaining ? available : remaining;
        if (cut <= 0n) continue;
        if (interestWaiver) {
          installment.interestDue = EmployeeFinanceMoney.fromCents(
            EmployeeFinanceMoney.toCents(installment.interestDue) - cut,
          );
        } else {
          installment.feeDue = EmployeeFinanceMoney.fromCents(
            EmployeeFinanceMoney.toCents(installment.feeDue) - cut,
          );
        }
        installment.totalDue = EmployeeFinanceMoney.fromCents(
          EmployeeFinanceMoney.toCents(installment.totalDue) - cut,
        );
        if (
          EmployeeFinanceMoney.toCents(installment.paidAmount) >=
          EmployeeFinanceMoney.toCents(installment.totalDue)
        ) {
          installment.status = EmployeeFinanceInstallmentStatusEnum.PAID;
          installment.overdueSince = null;
        }
        remaining -= cut;
        changed.push(installment);
      }
      if (remaining > 0n) {
        throw new ConflictException(
          'The schedule no longer has enough to waive; raise a new request.',
        );
      }
      await this.installmentRepository.save(changed);
      await this.ledgerService.post({
        companyId: account.companyId,
        accountId: account.id,
        entryType: interestWaiver
          ? EmployeeFinanceLedgerEntryTypeEnum.INTEREST_WAIVER
          : EmployeeFinanceLedgerEntryTypeEnum.FEE_WAIVER,
        direction: 'CREDIT',
        interestAmount: interestWaiver ? adjustment.interestAmount : '0.00',
        feeAmount: interestWaiver ? '0.00' : adjustment.feeAmount,
        effectiveDate: today,
        sourceType: 'ADJUSTMENT',
        sourceId: String(adjustment.id),
        idempotencyKey: key,
        postedByCompanyUserId: postedBy,
        description: adjustment.reason,
      });
      await this.accountStatusService.refresh(account.companyId, account.id);
      return;
    }
    // Write-off clears whatever is still owed today.
    const balance = await this.ledgerService.calculateBalance(
      account.companyId,
      account.id,
    );
    const positive = (value: string) =>
      EmployeeFinanceMoney.toCents(value) > 0n ? value : '0.00';
    adjustment.principalAmount = positive(balance.principal);
    adjustment.interestAmount = positive(balance.interest);
    adjustment.feeAmount = positive(balance.fees);
    await this.ledgerService.post({
      companyId: account.companyId,
      accountId: account.id,
      entryType: EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_WRITE_OFF,
      direction: 'CREDIT',
      principalAmount: adjustment.principalAmount,
      interestAmount: adjustment.interestAmount,
      feeAmount: adjustment.feeAmount,
      effectiveDate: today,
      sourceType: 'ADJUSTMENT',
      sourceId: String(adjustment.id),
      idempotencyKey: key,
      postedByCompanyUserId: postedBy,
      description: adjustment.reason,
    });
    for (const installment of open) {
      installment.status = EmployeeFinanceInstallmentStatusEnum.CANCELLED;
    }
    await this.installmentRepository.save(open);
    if (open.length) {
      await this.instructionRepository.update(
        {
          companyId: account.companyId,
          installmentId: In(open.map((item) => item.id)),
          status: EmployeeFinancePayrollInstructionStatusEnum.OPEN,
        },
        {
          status: EmployeeFinancePayrollInstructionStatusEnum.CANCELLED,
          resolution: 'WRITTEN_OFF',
        },
      );
    }
    await this.accountRepository.update(
      { id: account.id, companyId: account.companyId },
      { status: EmployeeFinanceAccountStatusEnum.WRITTEN_OFF },
    );
  }
}

// ---------------------------------------------------------------------------
// Payroll deduction preview, shortfalls, and run reconciliation
// ---------------------------------------------------------------------------

@Injectable()
export class EmployeeFinancePayrollOpsService {
  constructor(
    private readonly auditService: EmployeeFinanceAuditService,
    private readonly repaymentService: EmployeeFinanceRepaymentService,
    private readonly rescheduleService: EmployeeFinanceRescheduleService,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineItemRepository: Repository<EmployeePayrollLineItem>,
    @InjectRepository(EmployeePayrollResult)
    private readonly payrollResultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository: Repository<EmployeeFinancePayrollInstruction>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
  ) {}

  private async employeeLabels(companyId: number, employeeIds: number[]) {
    const unique = Array.from(new Set(employeeIds));
    if (!unique.length)
      return new Map<number, { employee_no: string; name: string }>();
    const employees = await this.employeeRepository.find({
      where: { company_id: companyId, id: In(unique) },
      select: ['id', 'employee_no', 'first_name', 'last_name'],
    });
    return new Map(
      employees.map((employee) => [
        employee.id,
        {
          employee_no: employee.employee_no,
          name: [employee.first_name, employee.last_name]
            .filter(Boolean)
            .join(' '),
        },
      ]),
    );
  }

  /**
   * What loans expect payroll to collect in a period, before the run is
   * calculated. Rows where the deduction exceeds the employee's usual
   * deduction capacity are flagged so Finance can act before payroll does.
   */
  async preview(actor: AuthenticatedUser, payrollPeriodId: number) {
    const companyId = actor.companyId!;
    const period = await this.periodRepository.findOne({
      where: { id: payrollPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');
    const installments = await this.installmentRepository
      .createQueryBuilder('installment')
      .innerJoin(
        EmployeeFinanceAccount,
        'account',
        'account.id = installment.accountId',
      )
      .where('installment.companyId = :companyId', { companyId })
      .andWhere('installment.dueDate <= :endDate', { endDate: period.endDate })
      .andWhere('installment.status IN (:...statuses)', {
        statuses: [
          EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
          EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
          EmployeeFinanceInstallmentStatusEnum.OVERDUE,
        ],
      })
      .andWhere('account.status IN (:...accountStatuses)', {
        accountStatuses: [
          EmployeeFinanceAccountStatusEnum.ACTIVE,
          EmployeeFinanceAccountStatusEnum.IN_ARREARS,
          EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
        ],
      })
      .orderBy('installment.employeeId', 'ASC')
      .addOrderBy('installment.dueDate', 'ASC')
      .getMany();
    const accountIds = Array.from(
      new Set(installments.map((item) => item.accountId)),
    );
    const accounts = accountIds.length
      ? await this.accountRepository.find({
          where: { companyId, id: In(accountIds) },
        })
      : [];
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const instructions = installments.length
      ? await this.instructionRepository.find({
          where: {
            companyId,
            payrollPeriodId,
            installmentId: In(installments.map((item) => item.id)),
          },
        })
      : [];
    const instructionByInstallment = new Map(
      instructions.map((instruction) => [
        instruction.installmentId,
        instruction,
      ]),
    );
    const employeeIds = installments.map((item) => item.employeeId);
    const labels = await this.employeeLabels(companyId, employeeIds);
    const latestNetPay = new Map<number, string>();
    for (const employeeId of new Set(employeeIds)) {
      const result = await this.payrollResultRepository.findOne({
        where: {
          companyId,
          employeeId,
          status: EmployeePayrollResultStatusEnum.LOCKED,
        },
        order: { id: 'DESC' },
      });
      if (result) latestNetPay.set(employeeId, result.netPay);
    }
    const rows = installments.map((installment) => {
      const account = accountById.get(installment.accountId);
      const due = EmployeeFinanceMoney.fromCents(
        installmentRemainder(installment).total,
      );
      const instruction = instructionByInstallment.get(installment.id);
      return {
        employee_id: installment.employeeId,
        employee_no: labels.get(installment.employeeId)?.employee_no ?? null,
        employee_name: labels.get(installment.employeeId)?.name ?? null,
        account_id: installment.accountId,
        account_no: account?.accountNo ?? null,
        product_type: account?.productType ?? null,
        installment_id: installment.id,
        installment_number: installment.installmentNumber,
        due_date: installment.dueDate,
        installment_status: installment.status,
        amount_due: due,
        instruction_status: instruction?.status ?? 'NOT_GENERATED',
      };
    });
    const byEmployee = new Map<number, typeof rows>();
    for (const row of rows) {
      byEmployee.set(row.employee_id, [
        ...(byEmployee.get(row.employee_id) ?? []),
        row,
      ]);
    }
    const employees = Array.from(byEmployee.entries()).map(
      ([employeeId, items]) => {
        const total = items.reduce(
          (sum, item) => EmployeeFinanceMoney.add(sum, item.amount_due),
          '0.00',
        );
        const netPay = latestNetPay.get(employeeId) ?? null;
        const capPercent = items
          .map((item) => accountById.get(item.account_id)?.productSnapshot)
          .map((snapshot) =>
            Number(recordValue(snapshot).maximumInstallmentPercentage ?? 0),
          )
          .filter((value) => value > 0);
        const capacity =
          netPay && capPercent.length
            ? EmployeeFinanceMoney.multiplyPercent(
                netPay,
                String(Math.min(...capPercent)),
              )
            : null;
        return {
          employee_id: employeeId,
          employee_no: items[0].employee_no,
          employee_name: items[0].employee_name,
          deduction_total: total,
          last_locked_net_pay: netPay,
          deduction_capacity: capacity,
          shortfall_risk:
            capacity !== null &&
            EmployeeFinanceMoney.toCents(total) >
              EmployeeFinanceMoney.toCents(capacity),
          items,
        };
      },
    );
    return {
      payroll_period_id: period.id,
      period_start: period.startDate,
      period_end: period.endDate,
      totals: {
        employee_count: employees.length,
        installment_count: rows.length,
        deduction_total: rows.reduce(
          (sum, row) => EmployeeFinanceMoney.add(sum, row.amount_due),
          '0.00',
        ),
        shortfall_risk_count: employees.filter((item) => item.shortfall_risk)
          .length,
      },
      employees,
    };
  }

  /**
   * Per-instruction view of a payroll run: what the loan asked for, what
   * payroll reserved and deducted on the payslip, and what reached the
   * loan ledger. Any disagreement is listed as an issue.
   */
  async runDeductions(actor: AuthenticatedUser, payrollRunId: number) {
    const companyId = actor.companyId!;
    const run = await this.runRepository.findOne({
      where: { id: payrollRunId, companyId },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    const instructions = await this.instructionRepository.find({
      where: { companyId, payrollRunId },
      order: { employeeId: 'ASC', id: 'ASC' },
    });
    const lines = await this.lineItemRepository.find({
      where: { companyId, payrollRunId, sourceType: 'EMPLOYEE_FINANCE' },
    });
    const lineByInstruction = new Map(
      lines.map((line) => [Number(line.sourceReference), line]),
    );
    const ledger = instructions.length
      ? await this.ledgerRepository.find({
          where: {
            companyId,
            idempotencyKey: In(
              instructions.map(
                (instruction) => `payroll:${payrollRunId}:${instruction.id}`,
              ),
            ),
          },
        })
      : [];
    const ledgerByInstruction = new Map(
      ledger.map((entry) => {
        const parts = entry.idempotencyKey.split(':');
        return [Number(parts[parts.length - 1]), entry] as const;
      }),
    );
    const labels = await this.employeeLabels(
      companyId,
      instructions.map((item) => item.employeeId),
    );
    const locked = Boolean(run.lockedAt);
    const issues: Record<string, unknown>[] = [];
    const rows = instructions.map((instruction) => {
      const line = lineByInstruction.get(instruction.id);
      const entry = ledgerByInstruction.get(instruction.id);
      const requested = EmployeeFinanceMoney.toCents(instruction.amount);
      const reserved = EmployeeFinanceMoney.toCents(instruction.reservedAmount);
      const posted = EmployeeFinanceMoney.toCents(instruction.postedAmount);
      const payslip = line ? EmployeeFinanceMoney.toCents(line.amount) : 0n;
      const ledgerAmount = entry
        ? EmployeeFinanceMoney.toCents(entry.totalAmount)
        : 0n;
      const rowIssues: string[] = [];
      if (reserved > 0n && payslip !== reserved)
        rowIssues.push('PAYSLIP_DIFFERS_FROM_RESERVED');
      if (locked && reserved > 0n && !entry)
        rowIssues.push('LEDGER_POSTING_MISSING');
      if (entry && ledgerAmount !== posted)
        rowIssues.push('LEDGER_DIFFERS_FROM_POSTED');
      if (recordValue(instruction.snapshot).overcollected_amount)
        rowIssues.push('OVERCOLLECTED');
      for (const code of rowIssues) {
        issues.push({
          code,
          instruction_id: instruction.id,
          employee_id: instruction.employeeId,
        });
      }
      const basis =
        instruction.status ===
        EmployeeFinancePayrollInstructionStatusEnum.POSTED
          ? posted
          : reserved;
      return {
        instruction_id: instruction.id,
        employee_id: instruction.employeeId,
        employee_no: labels.get(instruction.employeeId)?.employee_no ?? null,
        employee_name: labels.get(instruction.employeeId)?.name ?? null,
        account_id: instruction.accountId,
        account_no: textValue(recordValue(instruction.snapshot).account_no),
        component_code: instruction.componentCode,
        status: instruction.status,
        requested_amount: instruction.amount,
        reserved_amount: instruction.reservedAmount,
        payslip_amount: EmployeeFinanceMoney.fromCents(payslip),
        posted_amount: instruction.postedAmount,
        ledger_amount: EmployeeFinanceMoney.fromCents(ledgerAmount),
        shortfall_amount: EmployeeFinanceMoney.fromCents(
          requested - basis > 0n ? requested - basis : 0n,
        ),
        resolution: instruction.resolution,
        issues: rowIssues,
      };
    });
    const sum = (key: keyof (typeof rows)[number]) =>
      rows.reduce(
        (total, row) => EmployeeFinanceMoney.add(total, String(row[key])),
        '0.00',
      );
    return {
      payroll_run_id: run.id,
      run_no: run.runNo,
      run_status: run.status,
      locked,
      totals: {
        instruction_count: rows.length,
        requested: sum('requested_amount'),
        reserved: sum('reserved_amount'),
        payslip: sum('payslip_amount'),
        posted: sum('posted_amount'),
        ledger: sum('ledger_amount'),
        shortfall: sum('shortfall_amount'),
        issue_count: issues.length,
      },
      issues,
      rows,
    };
  }

  /** Deductions payroll could not take in full and nobody has resolved yet. */
  async shortfalls(
    actor: AuthenticatedUser,
    query: { payroll_period_id?: number; include_resolved?: boolean },
  ) {
    const companyId = actor.companyId!;
    const instructions = await this.instructionRepository.find({
      where: {
        companyId,
        status: In([
          EmployeeFinancePayrollInstructionStatusEnum.SHORTFALL,
          EmployeeFinancePayrollInstructionStatusEnum.POSTED,
        ]),
        ...(query.payroll_period_id
          ? { payrollPeriodId: Number(query.payroll_period_id) }
          : {}),
      },
      order: { id: 'DESC' },
    });
    const short = instructions.filter((instruction) => {
      const gap =
        EmployeeFinanceMoney.toCents(instruction.amount) -
        EmployeeFinanceMoney.toCents(instruction.postedAmount);
      return gap > 0n && (query.include_resolved || !instruction.resolution);
    });
    const labels = await this.employeeLabels(
      companyId,
      short.map((item) => item.employeeId),
    );
    return short.map((instruction) => ({
      instruction_id: instruction.id,
      payroll_period_id: instruction.payrollPeriodId,
      payroll_run_id: instruction.payrollRunId,
      employee_id: instruction.employeeId,
      employee_no: labels.get(instruction.employeeId)?.employee_no ?? null,
      employee_name: labels.get(instruction.employeeId)?.name ?? null,
      account_id: instruction.accountId,
      account_no: textValue(recordValue(instruction.snapshot).account_no),
      requested_amount: instruction.amount,
      posted_amount: instruction.postedAmount,
      shortfall_amount: EmployeeFinanceMoney.subtract(
        instruction.amount,
        instruction.postedAmount,
      ),
      status: instruction.status,
      resolution: instruction.resolution,
      resolution_reference: instruction.resolutionReference,
      resolved_at: instruction.resolvedAt,
    }));
  }

  /**
   * Decides how a payroll shortfall is recovered. Carry-forward relies on
   * the unpaid instalment being collected by the next payroll; direct
   * collection and rescheduling raise requests that still need approval.
   */
  async resolveShortfall(
    actor: AuthenticatedUser,
    instructionId: number,
    dto: ResolveEmployeeFinanceShortfallDto,
  ) {
    const instruction = await this.instructionRepository.findOne({
      where: { id: instructionId, companyId: actor.companyId! },
    });
    if (!instruction)
      throw new NotFoundException('Payroll instruction not found.');
    const gap =
      EmployeeFinanceMoney.toCents(instruction.amount) -
      EmployeeFinanceMoney.toCents(instruction.postedAmount);
    if (
      ![
        EmployeeFinancePayrollInstructionStatusEnum.SHORTFALL,
        EmployeeFinancePayrollInstructionStatusEnum.POSTED,
      ].includes(instruction.status) ||
      gap <= 0n
    ) {
      throw new ConflictException(
        'This deduction has no shortfall to resolve.',
      );
    }
    if (instruction.resolution) {
      throw new ConflictException('This shortfall is already resolved.');
    }
    let reference: string | null = null;
    if (
      dto.resolution === EmployeeFinanceShortfallResolutionEnum.COLLECT_DIRECT
    ) {
      if (!dto.payment_reference?.trim() || !dto.payment_date) {
        throw new BadRequestException(
          'Payment reference and date are required to collect directly.',
        );
      }
      const repayment = await this.repaymentService.create(actor, {
        account_id: instruction.accountId,
        amount: EmployeeFinanceMoney.fromCents(gap),
        payment_reference: dto.payment_reference.trim(),
        payment_date: dto.payment_date,
        repayment_type: 'DIRECT_REPAYMENT',
      });
      reference = `REPAYMENT:${repayment.id}`;
    } else if (
      dto.resolution === EmployeeFinanceShortfallResolutionEnum.RESCHEDULE
    ) {
      if (!dto.new_term_months) {
        throw new BadRequestException('A new term is required to reschedule.');
      }
      const reschedule = await this.rescheduleService.request(
        actor,
        instruction.accountId,
        {
          new_term_months: dto.new_term_months,
          reason:
            dto.comments?.trim() ||
            `Payroll shortfall on instruction ${instruction.id}`,
        },
      );
      reference = `RESCHEDULE:${reschedule.id}`;
    } else if (
      dto.resolution !== EmployeeFinanceShortfallResolutionEnum.CARRY_FORWARD
    ) {
      throw new BadRequestException('Unknown resolution.');
    }
    instruction.resolution = dto.resolution;
    instruction.resolutionReference = reference;
    instruction.resolvedByCompanyUserId = actorMembershipId(actor);
    instruction.resolvedAt = new Date();
    instruction.snapshot = {
      ...(instruction.snapshot ?? {}),
      resolution_comments: dto.comments?.trim() || null,
    };
    const saved = await this.instructionRepository.save(instruction);
    await this.auditService.log({
      actor,
      action: 'finance.payroll_shortfall.resolved',
      entityType: 'EMPLOYEE_FINANCE_PAYROLL_INSTRUCTION',
      entityId: saved.id,
      summary: {
        resolution: dto.resolution,
        reference,
        shortfall: EmployeeFinanceMoney.fromCents(gap),
      },
    });
    return saved;
  }
}
