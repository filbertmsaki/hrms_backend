import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { getRequestAuditContext } from '../../../../common/request-context/request-context';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollAuditLog,
  PayrollRun,
} from '../entities/payroll-run.entities';
import {
  PayrollOverpaymentRecovery,
  PayrollOverpaymentRecoveryEntry,
  PayrollRecoveryEntryTypeEnum,
  PayrollRecoveryLegalBasisEnum,
  PayrollRecoveryMethodEnum,
  PayrollRecoveryStatusEnum,
} from '../entities/payroll-recovery.entities';
import {
  EmployeePayrollResultStatusEnum,
  PayrollRunStatusEnum,
} from '../payroll.enums';
import { PayrollMoney } from './payroll-money.util';

export const RECOVERY_COMPONENT_CODE = 'OVERPAYMENT_RECOVERY';
export const RECOVERY_SOURCE_TYPE = 'OVERPAYMENT_RECOVERY';

const DEDUCTION_METHODS = [
  PayrollRecoveryMethodEnum.NEXT_PAYROLL,
  PayrollRecoveryMethodEnum.INSTALLMENTS,
];

export type CreateRecoveryInput = {
  employee_id: number;
  original_payroll_run_id: number;
  correction_payroll_run_id?: number | null;
  overpaid_amount: string;
  method: PayrollRecoveryMethodEnum;
  installment_amount?: string | null;
  legal_basis: PayrollRecoveryLegalBasisEnum;
  consent_reference?: string | null;
  reason: string;
};

export type RecordRecoverySettlementInput = {
  amount: string;
  reference: string;
  evidence: string;
};

@Injectable()
export class PayrollRecoveryService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollOverpaymentRecovery)
    private readonly recoveryRepository: Repository<PayrollOverpaymentRecovery>,
    @InjectRepository(PayrollOverpaymentRecoveryEntry)
    private readonly entryRepository: Repository<PayrollOverpaymentRecoveryEntry>,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineItemRepository: Repository<EmployeePayrollLineItem>,
    @InjectRepository(PayrollAuditLog)
    private readonly auditRepository: Repository<PayrollAuditLog>,
  ) {}

  list(
    actor: AuthenticatedUser,
    query: { employee_id?: number; status?: string },
  ) {
    const where: Record<string, unknown> = {
      companyId: this.hrAccessService.ensureActorCompanyId(actor),
    };
    if (query.employee_id) where.employeeId = query.employee_id;
    if (query.status) where.status = query.status;
    return this.recoveryRepository.find({ where, order: { id: 'DESC' } });
  }

  async get(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const recovery = await this.find(companyId, id);
    const entries = await this.entryRepository.find({
      where: { companyId, recoveryId: id },
      order: { id: 'ASC' },
    });
    return { ...recovery, entries, remaining_amount: this.remaining(recovery) };
  }

  async create(actor: AuthenticatedUser, dto: CreateRecoveryInput) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('A reason is required.');
    if (PayrollMoney.toCents(dto.overpaid_amount) <= 0n) {
      throw new BadRequestException('Overpaid amount must be positive.');
    }
    const original = await this.runRepository.findOne({
      where: { id: dto.original_payroll_run_id, companyId },
    });
    if (!original) {
      throw new NotFoundException('Original payroll run not found.');
    }
    if (
      ![PayrollRunStatusEnum.PAID, PayrollRunStatusEnum.CLOSED].includes(
        original.status,
      )
    ) {
      throw new ConflictException(
        'Overpayment recovery applies to paid payroll only. Correct unpaid payroll by rejecting, cancelling or reversing it.',
      );
    }
    const paidResult = await this.resultRepository.findOne({
      where: {
        companyId,
        payrollRunId: original.id,
        employeeId: dto.employee_id,
      },
    });
    if (!paidResult) {
      throw new ConflictException(
        'The employee was not paid in the original payroll run.',
      );
    }
    if (DEDUCTION_METHODS.includes(dto.method)) {
      // Deducting from salary needs a documented lawful basis.
      if (dto.legal_basis === PayrollRecoveryLegalBasisEnum.NOT_APPLICABLE) {
        throw new BadRequestException(
          'Salary deductions require a legal basis (consent, written agreement, court order or statute).',
        );
      }
      if (
        [
          PayrollRecoveryLegalBasisEnum.EMPLOYEE_CONSENT,
          PayrollRecoveryLegalBasisEnum.WRITTEN_AGREEMENT,
          PayrollRecoveryLegalBasisEnum.COURT_ORDER,
        ].includes(dto.legal_basis) &&
        !dto.consent_reference?.trim()
      ) {
        throw new BadRequestException(
          'Record the consent, agreement or order reference for this deduction.',
        );
      }
    }
    if (dto.method === PayrollRecoveryMethodEnum.INSTALLMENTS) {
      if (
        !dto.installment_amount ||
        PayrollMoney.toCents(dto.installment_amount) <= 0n
      ) {
        throw new BadRequestException(
          'Instalment recovery needs a positive instalment amount.',
        );
      }
    }
    const recovery = await this.recoveryRepository.save(
      this.recoveryRepository.create({
        companyId,
        employeeId: dto.employee_id,
        originalPayrollRunId: original.id,
        correctionPayrollRunId: dto.correction_payroll_run_id ?? null,
        overpaidAmount: PayrollMoney.add(dto.overpaid_amount),
        recoveredAmount: '0.00',
        method: dto.method,
        installmentAmount:
          dto.method === PayrollRecoveryMethodEnum.INSTALLMENTS
            ? PayrollMoney.add(dto.installment_amount)
            : null,
        legalBasis: dto.legal_basis,
        consentReference: dto.consent_reference?.trim() || null,
        reason,
        status: PayrollRecoveryStatusEnum.PENDING_APPROVAL,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.audit(actor, companyId, 'payroll.recovery.created', recovery, {
      after: this.auditValues(recovery),
    });
    return recovery;
  }

  async decide(
    actor: AuthenticatedUser,
    id: number,
    decision: 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const actorId = actor.companyMembershipId ?? actor.id;
    const recovery = await this.find(companyId, id);
    if (recovery.status !== PayrollRecoveryStatusEnum.PENDING_APPROVAL) {
      throw new ConflictException('Only pending recoveries can be decided.');
    }
    if (recovery.createdByCompanyUserId === actorId) {
      throw new ForbiddenException(
        'An overpayment recovery needs an independent approver.',
      );
    }
    if (decision === 'REJECT' && !note?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }
    const before = this.auditValues(recovery);
    recovery.status =
      decision === 'APPROVE'
        ? PayrollRecoveryStatusEnum.ACTIVE
        : PayrollRecoveryStatusEnum.REJECTED;
    recovery.approvedByCompanyUserId = actorId;
    recovery.approvedAt = new Date();
    recovery.decisionNote = note?.trim() || null;
    const saved = await this.recoveryRepository.save(recovery);
    await this.audit(
      actor,
      companyId,
      decision === 'APPROVE'
        ? 'payroll.recovery.approved'
        : 'payroll.recovery.rejected',
      saved,
      { before, after: this.auditValues(saved) },
    );
    return saved;
  }

  async cancel(actor: AuthenticatedUser, id: number, reason: string) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required.');
    }
    const recovery = await this.find(companyId, id);
    if (
      ![
        PayrollRecoveryStatusEnum.PENDING_APPROVAL,
        PayrollRecoveryStatusEnum.ACTIVE,
      ].includes(recovery.status)
    ) {
      throw new ConflictException('This recovery can no longer be cancelled.');
    }
    if (await this.pendingDeductionCents(companyId, recovery, null)) {
      throw new ConflictException(
        'A payroll run that is not yet paid already deducts this recovery. Cancel or reprocess that run first.',
      );
    }
    const before = this.auditValues(recovery);
    recovery.status = PayrollRecoveryStatusEnum.CANCELLED;
    recovery.decisionNote = reason.trim();
    const saved = await this.recoveryRepository.save(recovery);
    await this.audit(actor, companyId, 'payroll.recovery.cancelled', saved, {
      before,
      after: this.auditValues(saved),
    });
    return saved;
  }

  /** Records a verified refund from the employee (any active recovery). */
  recordRefund(
    actor: AuthenticatedUser,
    id: number,
    dto: RecordRecoverySettlementInput,
  ) {
    return this.recordSettlement(
      actor,
      id,
      dto,
      PayrollRecoveryEntryTypeEnum.REFUND,
    );
  }

  /** Settles an ACCOUNTING_ADJUSTMENT recovery (e.g. Finance write-off). */
  recordAccountingAdjustment(
    actor: AuthenticatedUser,
    id: number,
    dto: RecordRecoverySettlementInput,
  ) {
    return this.recordSettlement(
      actor,
      id,
      dto,
      PayrollRecoveryEntryTypeEnum.ACCOUNTING_ADJUSTMENT,
    );
  }

  /**
   * Amount a regular run should deduct for the employee now: the next
   * instalment (or full balance), less what other unpaid runs already deduct.
   */
  async plannedDeductions(
    companyId: number,
    employeeId: number,
    payrollRunId: number,
  ) {
    const recoveries = await this.recoveryRepository.find({
      where: {
        companyId,
        employeeId,
        status: PayrollRecoveryStatusEnum.ACTIVE,
        method: In(DEDUCTION_METHODS),
      },
      order: { id: 'ASC' },
    });
    const planned: Array<{
      recovery: PayrollOverpaymentRecovery;
      amount: string;
    }> = [];
    for (const recovery of recoveries) {
      const remaining =
        PayrollMoney.toCents(this.remaining(recovery)) -
        (await this.pendingDeductionCents(companyId, recovery, payrollRunId));
      if (remaining <= 0n) continue;
      const step =
        recovery.method === PayrollRecoveryMethodEnum.INSTALLMENTS
          ? PayrollMoney.toCents(recovery.installmentAmount)
          : remaining;
      planned.push({
        recovery,
        amount: PayrollMoney.fromCents(step < remaining ? step : remaining),
      });
    }
    return planned;
  }

  /**
   * Called when an employee's net pay is confirmed paid: books the recovery
   * deductions of that result exactly once.
   */
  async postForPaidPayrollResult(
    companyId: number,
    payrollRunId: number,
    employeeId: number,
  ) {
    const result = await this.resultRepository.findOne({
      where: { companyId, payrollRunId, employeeId },
    });
    if (!result) return 0;
    const lines = await this.lineItemRepository.find({
      where: {
        companyId,
        employeePayrollResultId: result.id,
        sourceType: RECOVERY_SOURCE_TYPE,
      },
    });
    let posted = 0;
    for (const line of lines) {
      const recoveryId = Number(line.sourceReference);
      const key = `payroll-deduction:${recoveryId}:${result.id}`;
      const existing = await this.entryRepository.findOne({
        where: { companyId, idempotencyKey: key },
      });
      if (existing) continue;
      await this.recoveryRepository.manager.transaction(async (manager) => {
        const recovery = await manager
          .getRepository(PayrollOverpaymentRecovery)
          .createQueryBuilder('recovery')
          .setLock('pessimistic_write')
          .where('recovery.id = :id AND recovery.companyId = :companyId', {
            id: recoveryId,
            companyId,
          })
          .getOne();
        if (!recovery) return;
        await manager.getRepository(PayrollOverpaymentRecoveryEntry).save({
          companyId,
          recoveryId,
          entryType: PayrollRecoveryEntryTypeEnum.PAYROLL_DEDUCTION,
          amount: line.amount,
          payrollRunId,
          employeePayrollResultId: result.id,
          reference: `RUN-${payrollRunId}`,
          evidence: null,
          idempotencyKey: key,
          createdByCompanyUserId: null,
        });
        this.applyRecovered(recovery, line.amount);
        await manager.getRepository(PayrollOverpaymentRecovery).save(recovery);
      });
      posted += 1;
    }
    return posted;
  }

  private async recordSettlement(
    actor: AuthenticatedUser,
    id: number,
    dto: RecordRecoverySettlementInput,
    type: PayrollRecoveryEntryTypeEnum,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const reference = dto.reference?.trim();
    const evidence = dto.evidence?.trim();
    if (!reference || !evidence) {
      throw new BadRequestException(
        'A reference and supporting evidence are required.',
      );
    }
    if (PayrollMoney.toCents(dto.amount) <= 0n) {
      throw new BadRequestException('Amount must be positive.');
    }
    return this.recoveryRepository.manager.transaction(async (manager) => {
      const recovery = await manager
        .getRepository(PayrollOverpaymentRecovery)
        .createQueryBuilder('recovery')
        .setLock('pessimistic_write')
        .where('recovery.id = :id AND recovery.companyId = :companyId', {
          id,
          companyId,
        })
        .getOne();
      if (!recovery) throw new NotFoundException('Recovery not found.');
      if (recovery.status !== PayrollRecoveryStatusEnum.ACTIVE) {
        throw new ConflictException(
          'Only approved, active recoveries can be settled.',
        );
      }
      if (
        type === PayrollRecoveryEntryTypeEnum.ACCOUNTING_ADJUSTMENT &&
        recovery.method !== PayrollRecoveryMethodEnum.ACCOUNTING_ADJUSTMENT
      ) {
        throw new ConflictException(
          'Accounting adjustments settle only recoveries approved for that method.',
        );
      }
      const pending = await this.pendingDeductionCents(
        companyId,
        recovery,
        null,
      );
      const open = PayrollMoney.toCents(this.remaining(recovery)) - pending;
      if (PayrollMoney.toCents(dto.amount) > open) {
        throw new ConflictException(
          `Amount exceeds the open balance of ${PayrollMoney.fromCents(open > 0n ? open : 0n)}.`,
        );
      }
      const key = `${type.toLowerCase()}:${recovery.id}:${reference}`;
      const duplicate = await manager
        .getRepository(PayrollOverpaymentRecoveryEntry)
        .findOne({ where: { companyId, idempotencyKey: key } });
      if (duplicate) {
        throw new ConflictException('This reference is already recorded.');
      }
      const entry = await manager
        .getRepository(PayrollOverpaymentRecoveryEntry)
        .save({
          companyId,
          recoveryId: recovery.id,
          entryType: type,
          amount: PayrollMoney.add(dto.amount),
          payrollRunId: null,
          employeePayrollResultId: null,
          reference,
          evidence,
          idempotencyKey: key,
          createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
        });
      const before = this.auditValues(recovery);
      this.applyRecovered(recovery, dto.amount);
      const saved = await manager
        .getRepository(PayrollOverpaymentRecovery)
        .save(recovery);
      await manager.getRepository(PayrollAuditLog).save(
        manager.getRepository(PayrollAuditLog).create({
          companyId,
          actorCompanyUserId: actor.companyMembershipId ?? null,
          action:
            type === PayrollRecoveryEntryTypeEnum.REFUND
              ? 'payroll.recovery.refund_recorded'
              : 'payroll.recovery.accounting_adjustment_recorded',
          entityType: 'PAYROLL_OVERPAYMENT_RECOVERY',
          entityId: String(recovery.id),
          summary: { entry_id: entry.id, amount: entry.amount, reference },
          beforeValues: before,
          afterValues: this.auditValues(saved),
          ipAddress: getRequestAuditContext().ipAddress?.slice(0, 64) ?? null,
        }),
      );
      return { ...saved, entry };
    });
  }

  /** Recovery amounts sitting in runs that are calculated but not yet paid. */
  private async pendingDeductionCents(
    companyId: number,
    recovery: PayrollOverpaymentRecovery,
    excludeRunId: number | null,
  ) {
    const query = this.lineItemRepository
      .createQueryBuilder('line')
      .innerJoin(
        EmployeePayrollResult,
        'result',
        'result.id = line.employeePayrollResultId',
      )
      .innerJoin(PayrollRun, 'run', 'run.id = result.payrollRunId')
      .select('COALESCE(SUM(line.amount), 0)', 'total')
      .where('line.companyId = :companyId', { companyId })
      .andWhere('line.sourceType = :sourceType', {
        sourceType: RECOVERY_SOURCE_TYPE,
      })
      .andWhere('line.sourceReference = :recoveryId', {
        recoveryId: String(recovery.id),
      })
      .andWhere('result.status NOT IN (:...settled)', {
        settled: [
          EmployeePayrollResultStatusEnum.PAID,
          EmployeePayrollResultStatusEnum.REVERSED,
          EmployeePayrollResultStatusEnum.EXCLUDED,
        ],
      })
      .andWhere('run.status NOT IN (:...dead)', {
        dead: [PayrollRunStatusEnum.CANCELLED, PayrollRunStatusEnum.REVERSED],
      });
    if (excludeRunId) {
      query.andWhere('run.id != :excludeRunId', { excludeRunId });
    }
    const raw = await query.getRawOne<{ total: string }>();
    return PayrollMoney.toCents(raw?.total ?? '0');
  }

  private remaining(recovery: PayrollOverpaymentRecovery) {
    return PayrollMoney.add(
      recovery.overpaidAmount,
      PayrollMoney.fromCents(-PayrollMoney.toCents(recovery.recoveredAmount)),
    );
  }

  private applyRecovered(recovery: PayrollOverpaymentRecovery, amount: string) {
    recovery.recoveredAmount = PayrollMoney.add(
      recovery.recoveredAmount,
      amount,
    );
    if (PayrollMoney.toCents(this.remaining(recovery)) <= 0n) {
      recovery.status = PayrollRecoveryStatusEnum.SETTLED;
    }
  }

  private async find(companyId: number, id: number) {
    const recovery = await this.recoveryRepository.findOne({
      where: { id, companyId },
    });
    if (!recovery) throw new NotFoundException('Recovery not found.');
    return recovery;
  }

  private auditValues(recovery: PayrollOverpaymentRecovery) {
    return {
      status: recovery.status,
      method: recovery.method,
      overpaid_amount: recovery.overpaidAmount,
      recovered_amount: recovery.recoveredAmount,
      legal_basis: recovery.legalBasis,
    };
  }

  private async audit(
    actor: AuthenticatedUser,
    companyId: number,
    action: string,
    recovery: PayrollOverpaymentRecovery,
    values: {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
  ) {
    await this.auditRepository.save(
      this.auditRepository.create({
        companyId,
        actorCompanyUserId: actor.companyMembershipId ?? null,
        action,
        entityType: 'PAYROLL_OVERPAYMENT_RECOVERY',
        entityId: String(recovery.id),
        summary: {
          employee_id: recovery.employeeId,
          original_payroll_run_id: recovery.originalPayrollRunId,
        },
        beforeValues: values.before ?? null,
        afterValues: values.after ?? null,
        ipAddress: getRequestAuditContext().ipAddress?.slice(0, 64) ?? null,
      }),
    );
  }
}

export const isRecoveryLine = (line: { sourceType?: string | null }) =>
  line.sourceType === RECOVERY_SOURCE_TYPE;
