import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { EmployeeCompensationVersion } from '../../employee-movements/entities/employee-compensation-version.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { EmployeePayrollResult } from '../../payroll/entities/payroll-run.entities';
import { PayrollPeriod } from '../../payroll/entities/payroll-configuration.entities';
import { HrAccessService } from '../../shared/hr-access.service';
import { OffboardingRequest } from '../../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../../offboarding/entities/offboarding-settlement-item.entity';
import { OffboardingSettlementItemTypeEnum } from '../../offboarding/enums/offboarding-settlement-item-type.enum';
import { OffboardingSettlementSourceEnum } from '../../offboarding/enums/offboarding-settlement-source.enum';
import { OffboardingSettlementStatusEnum } from '../../offboarding/enums/offboarding-settlement-status.enum';
import { EmployeePayrollResultStatusEnum } from '../../payroll/payroll.enums';
import {
  ApproveEmployeeFinanceApplicationDto,
  CreateEmployeeFinanceApplicationDto,
  CreateEmployeeFinanceDisbursementDto,
  CreateEmployeeFinanceProductDto,
  CreateEmployeeFinanceRepaymentDto,
  EmployeeFinanceQueryDto,
  EvaluateEmployeeFinanceEligibilityDto,
  RequestEmployeeFinanceDefermentDto,
  RequestEmployeeFinanceRescheduleDto,
} from '../dto/employee-finance.dto';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceApplicationDocument,
} from '../entities/employee-finance-application.entities';
import {
  EmployeeFinanceAccount,
  EmployeeFinanceAuditLog,
  EmployeeFinanceDefermentRequest,
  EmployeeFinanceDisbursement,
  EmployeeFinanceExitRecovery,
  EmployeeFinanceInstallment,
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
  EmployeeFinanceRepayment,
  EmployeeFinanceRepaymentAllocation,
  EmployeeFinanceReschedule,
  EmployeeFinanceSettlementQuote,
} from '../entities/employee-finance-account.entities';
import {
  EmployeeFinanceProduct,
  EmployeeFinanceProductApplicability,
} from '../entities/employee-finance-product.entities';
import {
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceDecisionEnum,
  EmployeeFinanceDisbursementStatusEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
  EmployeeFinancePayrollInstructionStatusEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceRepaymentStatusEnum,
} from '../employee-finance.enums';
import { EmployeeFinanceMoney } from './employee-finance-money.util';

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: string, months: number, day = 28) {
  const source = new Date(`${date}T00:00:00.000Z`);
  const next = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

function addDaysString(date: string, days: number) {
  const source = new Date(`${date}T00:00:00.000Z`);
  source.setUTCDate(source.getUTCDate() + days);
  return source.toISOString().slice(0, 10);
}

function monthsBetween(from: string | null, to = new Date()) {
  if (!from) return 0;
  const start = new Date(`${from}T00:00:00.000Z`);
  return Math.max(
    0,
    (to.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - start.getUTCMonth()),
  );
}

function activeAccountStatuses() {
  return [
    EmployeeFinanceAccountStatusEnum.ACTIVE,
    EmployeeFinanceAccountStatusEnum.DEFERRED,
    EmployeeFinanceAccountStatusEnum.IN_ARREARS,
    EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
    EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
  ];
}

export type EmployeeFinanceScheduleItem = {
  installment_number: number;
  due_date: string;
  principal_due: string;
  interest_due: string;
  fee_due: string;
  total_due: string;
  outstanding_after: string;
};

type EmployeeFinanceReconciliationResult = {
  account_id: number;
  issue_count: number;
  issues: Record<string, unknown>[];
};

@Injectable()
export class EmployeeFinanceAuditService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(EmployeeFinanceAuditLog)
    private readonly repository: Repository<EmployeeFinanceAuditLog>,
  ) {}

  async log(args: {
    actor?: AuthenticatedUser;
    companyId?: number;
    action: string;
    entityType: string;
    entityId: string | number;
    summary?: Record<string, unknown> | null;
  }) {
    const companyId =
      args.companyId ?? this.hrAccessService.ensureActorCompanyId(args.actor!);
    return this.repository.save(
      this.repository.create({
        companyId,
        actorCompanyUserId: args.actor?.companyMembershipId ?? null,
        action: args.action,
        entityType: args.entityType,
        entityId: String(args.entityId),
        summary: args.summary ?? null,
      }),
    );
  }
}

@Injectable()
export class EmployeeFinanceProductService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(EmployeeFinanceProduct)
    private readonly repository: Repository<EmployeeFinanceProduct>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateEmployeeFinanceProductDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const minAmount = EmployeeFinanceMoney.toCents(dto.minimum_amount);
    const maxAmount =
      dto.maximum_amount !== undefined
        ? EmployeeFinanceMoney.toCents(dto.maximum_amount)
        : null;
    if (maxAmount !== null && minAmount > maxAmount) {
      throw new BadRequestException('Minimum amount cannot exceed maximum amount.');
    }
    if ((dto.minimum_term_months ?? 1) > dto.maximum_term_months) {
      throw new BadRequestException('Minimum term cannot exceed maximum term.');
    }
    if (Number(dto.annual_interest_rate ?? 0) < 0) {
      throw new BadRequestException('Interest rate cannot be negative.');
    }

    const product = await this.repository.save(
      this.repository.create({
        companyId,
        productType: dto.product_type,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        interestMethod:
          dto.interest_method ?? EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
        annualInterestRate: dto.annual_interest_rate ?? '0',
        minimumAmount: dto.minimum_amount,
        maximumAmount: dto.maximum_amount ?? null,
        maximumSalaryMultiple: dto.maximum_salary_multiple ?? null,
        minimumTermMonths: dto.minimum_term_months ?? 1,
        maximumTermMonths: dto.maximum_term_months,
        minimumServiceMonths: dto.minimum_service_months ?? 0,
        maximumInstallmentPercentage:
          dto.maximum_installment_percentage ??
          String(
            this.configService.get<number>(
              'EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY',
              35,
            ),
          ),
        maximumActiveAccounts: dto.maximum_active_accounts ?? 1,
        requiresConfirmation: dto.requires_confirmation ?? false,
        allowDuringProbation: dto.allow_during_probation ?? false,
        allowRescheduling: dto.allow_rescheduling ?? true,
        allowDeferment: dto.allow_deferment ?? true,
        allowEarlySettlement: dto.allow_early_settlement ?? true,
        allowAdditionalRepayment: dto.allow_additional_repayment ?? true,
        requiredDocumentTypes: dto.required_document_types ?? null,
        eligibilityConfiguration: dto.eligibility_configuration ?? {},
        approvalConfiguration: dto.approval_configuration ?? {},
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        status: 'ACTIVE',
      }),
    );
    await this.auditService.log({
      actor,
      action: 'finance.product.created',
      entityType: 'EMPLOYEE_FINANCE_PRODUCT',
      entityId: product.id,
      summary: { code: product.code, product_type: product.productType },
    });
    return product;
  }

  async update(actor: AuthenticatedUser, id: number, dto: CreateEmployeeFinanceProductDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const product = await this.repository.findOne({ where: { id, companyId } });
    if (!product) throw new NotFoundException('Finance product not found.');
    const used = await this.applicationRepository.count({
      where: { companyId, productId: product.id },
    });
    if (used > 0 || product.isLocked) {
      throw new ConflictException('Used finance products are immutable; create a new version.');
    }
    await this.repository.remove(product);
    return this.create(actor, dto);
  }

  list(actor: AuthenticatedUser) {
    return this.repository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { productType: 'ASC', code: 'ASC' },
    });
  }

  async getActive(companyId: number, productId: number) {
    const product = await this.repository.findOne({
      where: { id: productId, companyId, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundException('Finance product not found.');
    return product;
  }
}

@Injectable()
export class EmployeeFinanceEligibilityService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly productService: EmployeeFinanceProductService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeCompensationVersion)
    private readonly compensationRepository: Repository<EmployeeCompensationVersion>,
    @InjectRepository(EmployeePayrollResult)
    private readonly payrollResultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceProductApplicability)
    private readonly applicabilityRepository: Repository<EmployeeFinanceProductApplicability>,
  ) {}

  async evaluate(actor: AuthenticatedUser, dto: EvaluateEmployeeFinanceEligibilityDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const product = await this.productService.getActive(companyId, dto.product_id);
    return this.evaluateEligibility(
      companyId,
      dto.employee_id,
      product,
      dto.requested_amount,
      dto.requested_term_months,
    );
  }

  async evaluateEligibility(
    companyId: number,
    employeeId: number,
    product: EmployeeFinanceProduct,
    requestedAmount?: string,
    requestedTermMonths?: number,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    const compensation = await this.compensationRepository
      .createQueryBuilder('compensation')
      .where('compensation.companyId = :companyId', { companyId })
      .andWhere('compensation.employeeId = :employeeId', { employeeId })
      .andWhere('compensation.status IN (:...statuses)', {
        statuses: ['ACTIVE', 'SCHEDULED'],
      })
      .orderBy('compensation.effectiveFrom', 'DESC')
      .getOne();
    const latestPayroll = await this.payrollResultRepository.findOne({
      where: { companyId, employeeId, status: EmployeePayrollResultStatusEnum.LOCKED },
      order: { id: 'DESC' },
    });
    const activeAccounts = await this.accountRepository.find({
      where: {
        companyId,
        employeeId,
        productId: product.id,
        status: In(activeAccountStatuses()),
      },
    });
    const baseSalary = compensation?.baseSalary ?? '0.00';
    const netPay = latestPayroll?.netPay ?? baseSalary;
    const maximumAffordableInstallment = EmployeeFinanceMoney.multiply(
      netPay,
      Number(product.maximumInstallmentPercentage) / 100,
    );
    const existingInstallments = activeAccounts.reduce(
      (sum, account) => EmployeeFinanceMoney.add(sum, account.scheduledMonthlyInstallment),
      '0.00',
    );
    const availableInstallment = EmployeeFinanceMoney.subtract(
      maximumAffordableInstallment,
      existingInstallments,
    );
    const salaryMultipleLimit = product.maximumSalaryMultiple
      ? EmployeeFinanceMoney.multiply(baseSalary, Number(product.maximumSalaryMultiple))
      : null;
    const configuredMaximum = product.maximumAmount;
    const maximumEligibleAmount = [salaryMultipleLimit, configuredMaximum]
      .filter((value): value is string => Boolean(value))
      .reduce(
        (current, value) =>
          current === null ? value : EmployeeFinanceMoney.min(current, value),
        null as string | null,
      ) ?? '0.00';
    const allowedGradeIds = product.eligibilityConfiguration
      .allowed_grade_ids as number[] | undefined;
    const applicable = await this.isProductApplicable(companyId, employee, product);
    const serviceMonths = monthsBetween(employee.hire_date);
    const checks = [
      {
        code: 'EMPLOYEE_ACTIVE',
        passed: employee.employment_status === EmploymentStatusEnum.ACTIVE,
        value: employee.employment_status,
        required: EmploymentStatusEnum.ACTIVE,
        message: 'Employee must be active.',
      },
      {
        code: 'COMPENSATION_EXISTS',
        passed: Boolean(compensation),
        message: 'Employee must have active compensation.',
      },
      {
        code: 'PRODUCT_APPLICABLE',
        passed: applicable,
        message: 'Product must be applicable to employee assignment.',
      },
      {
        code: 'GRADE_ELIGIBLE',
        passed: !allowedGradeIds?.length || allowedGradeIds.includes(employee.grade_id ?? 0),
        value: employee.grade_id,
        required: allowedGradeIds ?? null,
        message: 'Employee grade must be eligible.',
      },
      {
        code: 'MINIMUM_SERVICE',
        passed: serviceMonths >= product.minimumServiceMonths,
        value: serviceMonths,
        required: product.minimumServiceMonths,
        message: 'Employee must meet minimum service period.',
      },
      {
        code: 'ACTIVE_ACCOUNT_LIMIT',
        passed: activeAccounts.length < product.maximumActiveAccounts,
        value: activeAccounts.length,
        required: product.maximumActiveAccounts,
        message: 'Employee must be within active account limit.',
      },
      {
        code: 'REQUESTED_AMOUNT',
        passed:
          !requestedAmount ||
          (EmployeeFinanceMoney.toCents(requestedAmount) >=
            EmployeeFinanceMoney.toCents(product.minimumAmount) &&
            (EmployeeFinanceMoney.toCents(maximumEligibleAmount) === 0n ||
              EmployeeFinanceMoney.toCents(requestedAmount) <=
                EmployeeFinanceMoney.toCents(maximumEligibleAmount))),
        value: requestedAmount ?? null,
        required: { minimum: product.minimumAmount, maximum: maximumEligibleAmount },
        message: 'Requested amount must fit configured eligibility limits.',
      },
      {
        code: 'REQUESTED_TERM',
        passed:
          !requestedTermMonths ||
          (requestedTermMonths >= product.minimumTermMonths &&
            requestedTermMonths <= product.maximumTermMonths),
        value: requestedTermMonths ?? null,
        required: {
          minimum: product.minimumTermMonths,
          maximum: product.maximumTermMonths,
        },
        message: 'Requested term must fit product limits.',
      },
      {
        code: 'PAYROLL_CAPACITY',
        passed: EmployeeFinanceMoney.toCents(availableInstallment) > 0n,
        value: availableInstallment,
        required: '> 0',
        message: 'Employee must have available payroll deduction capacity.',
      },
    ];
    const snapshot = {
      employee_id: employee.id,
      product_id: product.id,
      base_salary: baseSalary,
      latest_net_pay: latestPayroll?.netPay ?? null,
      active_account_ids: activeAccounts.map((account) => account.id),
      service_months: serviceMonths,
      evaluated_at: new Date().toISOString(),
    };
    return {
      eligible: checks.every((check) => check.passed),
      maximumEligibleAmount,
      maximumAffordableInstallment,
      maximumTermMonths: product.maximumTermMonths,
      currentExposure: activeAccounts.reduce(
        (sum, account) => EmployeeFinanceMoney.add(sum, account.outstandingTotal),
        '0.00',
      ),
      availableExposure: maximumEligibleAmount,
      checks,
      snapshot,
      snapshotHash: hash(snapshot),
    };
  }

  private async isProductApplicable(
    companyId: number,
    employee: Employee,
    product: EmployeeFinanceProduct,
  ) {
    const rules = await this.applicabilityRepository.find({
      where: { companyId, productId: product.id },
      order: { priority: 'DESC' },
    });
    if (!rules.length) return true;
    return rules.some(
      (rule) =>
        (!rule.specificEmployeeId || rule.specificEmployeeId === employee.id) &&
        (!rule.positionId || rule.positionId === employee.primary_position_id) &&
        (!rule.gradeId || rule.gradeId === employee.grade_id) &&
        (!rule.departmentId || rule.departmentId === employee.primary_department_id) &&
        (!rule.branchId || rule.branchId === employee.primary_branch_id) &&
        (!rule.employmentType || rule.employmentType === employee.employment_type),
    );
  }
}

@Injectable()
export class EmployeeFinanceInterestService {
  calculateSchedule(args: {
    principal: string;
    annualInterestRate: string;
    termMonths: number;
    method: EmployeeFinanceInterestMethodEnum;
    firstRepaymentDate: string;
    repaymentDay: number;
  }) {
    const principalCents = EmployeeFinanceMoney.toCents(args.principal);
    const term = Math.max(args.termMonths, 1);
    if (
      args.method === EmployeeFinanceInterestMethodEnum.ZERO_INTEREST ||
      Number(args.annualInterestRate) === 0
    ) {
      return this.equalPrincipalSchedule(principalCents, 0n, term, args);
    }
    if (args.method === EmployeeFinanceInterestMethodEnum.FLAT_RATE) {
      const interest = EmployeeFinanceMoney.toCents(
        EmployeeFinanceMoney.multiply(
          args.principal,
          (Number(args.annualInterestRate) / 100 / 12) * term,
        ),
      );
      return this.equalPrincipalSchedule(principalCents, interest, term, args);
    }

    let remaining = principalCents;
    const principalBase = principalCents / BigInt(term);
    const schedule: EmployeeFinanceScheduleItem[] = [];
    for (let i = 1; i <= term; i += 1) {
      const principalDue = i === term ? remaining : principalBase;
      const interestDue = EmployeeFinanceMoney.toCents(
        EmployeeFinanceMoney.multiply(
          EmployeeFinanceMoney.fromCents(remaining),
          Number(args.annualInterestRate) / 100 / 12,
        ),
      );
      remaining -= principalDue;
      schedule.push({
        installment_number: i,
        due_date: addMonths(args.firstRepaymentDate, i - 1, args.repaymentDay),
        principal_due: EmployeeFinanceMoney.fromCents(principalDue),
        interest_due: EmployeeFinanceMoney.fromCents(interestDue),
        fee_due: '0.00',
        total_due: EmployeeFinanceMoney.fromCents(principalDue + interestDue),
        outstanding_after: EmployeeFinanceMoney.fromCents(remaining),
      });
    }
    return schedule;
  }

  private equalPrincipalSchedule(
    principalCents: bigint,
    interestCents: bigint,
    term: number,
    args: { firstRepaymentDate: string; repaymentDay: number },
  ) {
    const principalBase = principalCents / BigInt(term);
    const interestBase = interestCents / BigInt(term);
    let principalRemaining = principalCents;
    let interestRemaining = interestCents;
    const schedule: EmployeeFinanceScheduleItem[] = [];
    for (let i = 1; i <= term; i += 1) {
      const principalDue = i === term ? principalRemaining : principalBase;
      const interestDue = i === term ? interestRemaining : interestBase;
      principalRemaining -= principalDue;
      interestRemaining -= interestDue;
      schedule.push({
        installment_number: i,
        due_date: addMonths(args.firstRepaymentDate, i - 1, args.repaymentDay),
        principal_due: EmployeeFinanceMoney.fromCents(principalDue),
        interest_due: EmployeeFinanceMoney.fromCents(interestDue),
        fee_due: '0.00',
        total_due: EmployeeFinanceMoney.fromCents(principalDue + interestDue),
        outstanding_after: EmployeeFinanceMoney.fromCents(principalRemaining),
      });
    }
    return schedule;
  }
}

@Injectable()
export class EmployeeFinanceLedgerService {
  constructor(
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
  ) {}

  async post(args: {
    companyId: number;
    accountId: number;
    installmentId?: number | null;
    entryType: EmployeeFinanceLedgerEntryTypeEnum;
    direction: 'DEBIT' | 'CREDIT';
    principalAmount?: string;
    interestAmount?: string;
    feeAmount?: string;
    effectiveDate: string;
    sourceType: string;
    sourceId?: string | null;
    idempotencyKey: string;
    postedByCompanyUserId?: number | null;
    description?: string | null;
  }) {
    const existing = await this.ledgerRepository.findOne({
      where: { companyId: args.companyId, idempotencyKey: args.idempotencyKey },
    });
    if (existing) return existing;
    const balance = await this.calculateBalance(args.companyId, args.accountId);
    const sign = args.direction === 'DEBIT' ? 1n : -1n;
    const nextPrincipal = EmployeeFinanceMoney.fromCents(
      EmployeeFinanceMoney.toCents(balance.principal) +
        sign * EmployeeFinanceMoney.toCents(args.principalAmount ?? '0'),
    );
    const nextInterest = EmployeeFinanceMoney.fromCents(
      EmployeeFinanceMoney.toCents(balance.interest) +
        sign * EmployeeFinanceMoney.toCents(args.interestAmount ?? '0'),
    );
    const nextFees = EmployeeFinanceMoney.fromCents(
      EmployeeFinanceMoney.toCents(balance.fees) +
        sign * EmployeeFinanceMoney.toCents(args.feeAmount ?? '0'),
    );
    const nextTotal = EmployeeFinanceMoney.add(nextPrincipal, nextInterest, nextFees);
    const entry = await this.ledgerRepository.save(
      this.ledgerRepository.create({
        companyId: args.companyId,
        accountId: args.accountId,
        installmentId: args.installmentId ?? null,
        entryType: args.entryType,
        direction: args.direction,
        principalAmount: args.principalAmount ?? '0.00',
        interestAmount: args.interestAmount ?? '0.00',
        feeAmount: args.feeAmount ?? '0.00',
        totalAmount: EmployeeFinanceMoney.add(
          args.principalAmount,
          args.interestAmount,
          args.feeAmount,
        ),
        effectiveDate: args.effectiveDate,
        postedAt: new Date(),
        sourceType: args.sourceType,
        sourceId: args.sourceId ?? null,
        idempotencyKey: args.idempotencyKey,
        reversesEntryId: null,
        description: args.description ?? null,
        balanceSnapshot: {
          outstanding_principal: nextPrincipal,
          outstanding_interest: nextInterest,
          outstanding_fees: nextFees,
          outstanding_total: nextTotal,
        },
        postedByCompanyUserId: args.postedByCompanyUserId ?? null,
      }),
    );
    await this.accountRepository.update(
      { id: args.accountId, companyId: args.companyId },
      {
        outstandingPrincipal: nextPrincipal,
        outstandingInterest: nextInterest,
        outstandingFees: nextFees,
        outstandingTotal: nextTotal,
      },
    );
    return entry;
  }

  async calculateBalance(companyId: number, accountId: number) {
    const entries = await this.ledgerRepository.find({
      where: { companyId, accountId },
      order: { id: 'ASC' },
    });
    let principal = '0.00';
    let interest = '0.00';
    let fees = '0.00';
    for (const entry of entries) {
      const sign = entry.direction === 'DEBIT' ? 1n : -1n;
      principal = EmployeeFinanceMoney.fromCents(
        EmployeeFinanceMoney.toCents(principal) +
          sign * EmployeeFinanceMoney.toCents(entry.principalAmount),
      );
      interest = EmployeeFinanceMoney.fromCents(
        EmployeeFinanceMoney.toCents(interest) +
          sign * EmployeeFinanceMoney.toCents(entry.interestAmount),
      );
      fees = EmployeeFinanceMoney.fromCents(
        EmployeeFinanceMoney.toCents(fees) +
          sign * EmployeeFinanceMoney.toCents(entry.feeAmount),
      );
    }
    return {
      principal,
      interest,
      fees,
      total: EmployeeFinanceMoney.add(principal, interest, fees),
    };
  }
}

@Injectable()
export class EmployeeFinanceAccountService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly interestService: EmployeeFinanceInterestService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
  ) {}

  async createFromApplication(actor: AuthenticatedUser, applicationId: number) {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });
    if (!application) throw new NotFoundException('Finance application not found.');
    if (
      application.status !==
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE
    ) {
      throw new ConflictException('Application must be ready for employee acceptance.');
    }
    const existing = await this.accountRepository.findOne({
      where: { applicationId: application.id, companyId: application.companyId },
    });
    if (existing) return existing;
    const approvedAmount = application.approvedAmount ?? application.requestedAmount;
    const term = application.approvedTermMonths ?? application.requestedTermMonths;
    const product = application.productSnapshot as unknown as {
      interestMethod: EmployeeFinanceInterestMethodEnum;
      annualInterestRate: string;
    };
    const repaymentDay = this.configService.get<number>(
      'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY',
      28,
    );
    const firstRepaymentDate = addMonths(todayString(), 1, repaymentDay);
    const schedule = this.interestService.calculateSchedule({
      principal: approvedAmount,
      annualInterestRate: application.approvedInterestRate ?? product.annualInterestRate ?? '0',
      termMonths: term,
      method: product.interestMethod ?? EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
      firstRepaymentDate,
      repaymentDay,
    });
    const interestTotal = schedule.reduce(
      (sum, item) => EmployeeFinanceMoney.add(sum, item.interest_due),
      '0.00',
    );
    const totalPayable = EmployeeFinanceMoney.add(approvedAmount, interestTotal);
    const account = await this.accountRepository.save(
      this.accountRepository.create({
        companyId: application.companyId,
        employeeId: application.employeeId,
        applicationId: application.id,
        productId: application.productId,
        accountNo: `EF-${application.companyId}-${String(application.id).padStart(6, '0')}`,
        productType: application.productType,
        principalAmount: approvedAmount,
        interestAmount: interestTotal,
        feeAmount: '0.00',
        totalPayable,
        outstandingPrincipal: '0.00',
        outstandingInterest: '0.00',
        outstandingFees: '0.00',
        outstandingTotal: '0.00',
        scheduledMonthlyInstallment: schedule[0]?.total_due ?? totalPayable,
        termMonths: term,
        interestRate: application.approvedInterestRate ?? product.annualInterestRate ?? '0',
        firstRepaymentDate,
        maturityDate: schedule[schedule.length - 1]?.due_date ?? firstRepaymentDate,
        productSnapshot: application.productSnapshot,
        agreementSnapshot: {
          application_id: application.id,
          approved_amount: approvedAmount,
          approved_term_months: term,
          accepted_at: new Date().toISOString(),
        },
      }),
    );
    await this.installmentRepository.save(
      schedule.map((item) =>
        this.installmentRepository.create({
          companyId: account.companyId,
          accountId: account.id,
          employeeId: account.employeeId,
          scheduleVersion: 1,
          installmentNumber: item.installment_number,
          dueDate: item.due_date,
          principalDue: item.principal_due,
          interestDue: item.interest_due,
          feeDue: item.fee_due,
          totalDue: item.total_due,
        }),
      ),
    );
    application.employeeAcceptedAt = new Date();
    application.status = EmployeeFinanceApplicationStatusEnum.APPROVED;
    await this.applicationRepository.save(application);
    await this.auditService.log({
      actor,
      companyId: account.companyId,
      action: 'finance.account.created',
      entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
      entityId: account.id,
      summary: { application_id: application.id },
    });
    return account;
  }

  list(actor: AuthenticatedUser, query: EmployeeFinanceQueryDto) {
    const where: Record<string, unknown> = {
      companyId: actor.companyId!,
    };
    if (query.employee_id) where.employeeId = query.employee_id;
    if (query.status) where.status = query.status;
    return this.accountRepository.find({ where, order: { id: 'DESC' } });
  }

  async getStatement(actor: AuthenticatedUser, accountId: number) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (actor.employeeId && actor.employeeId !== account.employeeId) {
      await this.hrAccessService.assertCanAccessEmployee(actor, {
        id: account.employeeId,
        company_id: account.companyId,
      } as Employee);
    }
    const [installments, ledger] = await Promise.all([
      this.installmentRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { installmentNumber: 'ASC' },
      }),
      this.ledgerRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { effectiveDate: 'ASC', id: 'ASC' },
      }),
    ]);
    return { account, installments, ledger };
  }
}

@Injectable()
export class EmployeeFinanceApplicationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly productService: EmployeeFinanceProductService,
    private readonly eligibilityService: EmployeeFinanceEligibilityService,
    private readonly accountService: EmployeeFinanceAccountService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceApplicationDocument)
    private readonly documentRepository: Repository<EmployeeFinanceApplicationDocument>,
  ) {}

  async createMine(actor: AuthenticatedUser, dto: CreateEmployeeFinanceApplicationDto) {
    if (!actor.employeeId) throw new ForbiddenException('Employee profile is required.');
    return this.createForEmployee(actor, actor.employeeId, dto);
  }

  async createForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
    dto: CreateEmployeeFinanceApplicationDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (actor.employeeId && actor.employeeId !== employeeId) {
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }
    const product = await this.productService.getActive(companyId, dto.product_id);
    const activeApplications = await this.applicationRepository.count({
      where: {
        companyId,
        employeeId,
        status: In([
          EmployeeFinanceApplicationStatusEnum.DRAFT,
          EmployeeFinanceApplicationStatusEnum.SUBMITTED,
          EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
          EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
          EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
          EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
        ]),
      },
    });
    if (
      activeApplications >=
      this.configService.get<number>('EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS', 1)
    ) {
      throw new ConflictException('Employee already has active finance applications.');
    }
    const eligibility = await this.eligibilityService.evaluateEligibility(
      companyId,
      employeeId,
      product,
      dto.requested_amount,
      dto.requested_term_months,
    );
    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: 'Employee is not eligible for this product.',
        eligibility,
      });
    }
    const count = await this.applicationRepository.count({ where: { companyId } });
    const productSnapshot = { ...product };
    const employeeSnapshot = {
      id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      grade_id: employee.grade_id,
      hire_date: employee.hire_date,
    };
    const estimatedInstallment = EmployeeFinanceMoney.divide(
      dto.requested_amount,
      dto.requested_term_months,
    );
    const application = await this.applicationRepository.save(
      this.applicationRepository.create({
        companyId,
        employeeId,
        productId: product.id,
        applicationNo: `EFAPP-${companyId}-${String(count + 1).padStart(6, '0')}`,
        productType: product.productType,
        requestedAmount: dto.requested_amount,
        requestedTermMonths: dto.requested_term_months,
        purpose: dto.purpose.trim(),
        approvedAmount: null,
        approvedTermMonths: null,
        approvedInterestRate: null,
        estimatedInstallment,
        eligibilitySnapshot: eligibility,
        eligibilitySnapshotHash: eligibility.snapshotHash,
        productSnapshot,
        productSnapshotHash: hash(productSnapshot),
        employeeSnapshot,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'finance.application.created',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: { employee_id: employeeId, product_type: product.productType },
    });
    return application;
  }

  async submitMine(actor: AuthenticatedUser, id: number) {
    const application = await this.getOwnedApplication(actor, id);
    if (application.status !== EmployeeFinanceApplicationStatusEnum.DRAFT) {
      throw new ConflictException('Only draft applications can be submitted.');
    }
    application.status = this.configService.get<boolean>(
      'EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION',
      true,
    )
      ? EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION
      : this.configService.get<boolean>('EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL', true)
        ? EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL
        : EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL;
    application.submittedAt = new Date();
    await this.auditService.log({
      actor,
      action: 'finance.application.submitted',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
    });
    return this.applicationRepository.save(application);
  }

  async acceptMine(actor: AuthenticatedUser, id: number) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      application.status !==
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE
    ) {
      throw new ConflictException('Application is not awaiting employee acceptance.');
    }
    const account = await this.accountService.createFromApplication(actor, application.id);
    await this.auditService.log({
      actor,
      action: 'finance.application.accepted',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
    });
    return account;
  }

  async withdrawMine(actor: AuthenticatedUser, id: number) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      [
        EmployeeFinanceApplicationStatusEnum.APPROVED,
        EmployeeFinanceApplicationStatusEnum.DISBURSED,
      ].includes(application.status)
    ) {
      throw new ConflictException('Approved or disbursed applications cannot be withdrawn.');
    }
    application.status = EmployeeFinanceApplicationStatusEnum.WITHDRAWN;
    return this.applicationRepository.save(application);
  }

  listMine(actor: AuthenticatedUser) {
    if (!actor.employeeId) throw new ForbiddenException('Employee profile is required.');
    return this.applicationRepository.find({
      where: { companyId: actor.companyId!, employeeId: actor.employeeId },
      order: { id: 'DESC' },
    });
  }

  list(actor: AuthenticatedUser, query: EmployeeFinanceQueryDto) {
    const where: Record<string, unknown> = { companyId: actor.companyId! };
    if (query.employee_id) where.employeeId = query.employee_id;
    if (query.product_id) where.productId = query.product_id;
    if (query.status) where.status = query.status;
    return this.applicationRepository.find({ where, order: { id: 'DESC' } });
  }

  async getApplication(actor: AuthenticatedUser, id: number) {
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!application) throw new NotFoundException('Finance application not found.');
    return application;
  }

  private async getOwnedApplication(actor: AuthenticatedUser, id: number) {
    if (!actor.employeeId) throw new ForbiddenException('Employee profile is required.');
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId!, employeeId: actor.employeeId },
    });
    if (!application) throw new NotFoundException('Finance application not found.');
    return application;
  }
}

@Injectable()
export class EmployeeFinanceApprovalService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceApplicationApproval)
    private readonly approvalRepository: Repository<EmployeeFinanceApplicationApproval>,
  ) {}

  async approve(actor: AuthenticatedUser, id: number, dto: ApproveEmployeeFinanceApplicationDto) {
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!application) throw new NotFoundException('Finance application not found.');
    if (actor.employeeId === application.employeeId) {
      throw new ForbiddenException('Employee cannot approve their own finance application.');
    }
    const expected = this.expectedStage(application.status);
    if (expected !== dto.stage) {
      throw new ConflictException('Application is not waiting for this approval stage.');
    }
    const currentHash = hash({
      requested_amount: application.requestedAmount,
      requested_term_months: application.requestedTermMonths,
      eligibility_hash: application.eligibilitySnapshotHash,
      product_hash: application.productSnapshotHash,
    });
    if (dto.snapshot_hash !== currentHash && dto.snapshot_hash !== application.eligibilitySnapshotHash) {
      throw new ConflictException('Approval hash must match the current application snapshot.');
    }
    if (dto.stage === EmployeeFinanceApprovalStageEnum.MANAGER) {
      const employee = await this.employeeRepository.findOne({
        where: { id: application.employeeId, company_id: application.companyId },
      });
      if (!employee) throw new NotFoundException('Employee not found.');
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }
    if (dto.approved_amount) application.approvedAmount = dto.approved_amount;
    if (dto.approved_term_months) application.approvedTermMonths = dto.approved_term_months;
    application.approvedInterestRate =
      application.approvedInterestRate ??
      String((application.productSnapshot as Record<string, unknown>).annualInterestRate ?? '0');
    application.estimatedInstallment = EmployeeFinanceMoney.divide(
      application.approvedAmount ?? application.requestedAmount,
      application.approvedTermMonths ?? application.requestedTermMonths,
    );
    await this.approvalRepository.save(
      this.approvalRepository.create({
        companyId: application.companyId,
        applicationId: application.id,
        stage: dto.stage,
        decision:
          dto.stage === EmployeeFinanceApprovalStageEnum.MANAGER
            ? EmployeeFinanceDecisionEnum.RECOMMENDED
            : EmployeeFinanceDecisionEnum.APPROVED,
        snapshotHash: dto.snapshot_hash,
        approvedAmount: application.approvedAmount,
        approvedTermMonths: application.approvedTermMonths,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
        comments: dto.comments ?? null,
      }),
    );
    application.status = this.nextStatus(dto.stage);
    if (application.status === EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE) {
      application.approvedAt = new Date();
    }
    const action =
      dto.stage === EmployeeFinanceApprovalStageEnum.MANAGER
        ? 'finance.application.recommended'
        : dto.stage === EmployeeFinanceApprovalStageEnum.HR
          ? 'finance.application.hr_approved'
          : 'finance.application.finance_approved';
    await this.auditService.log({
      actor,
      action,
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: { stage: dto.stage },
    });
    return this.applicationRepository.save(application);
  }

  private expectedStage(status: EmployeeFinanceApplicationStatusEnum) {
    if (status === EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION) {
      return EmployeeFinanceApprovalStageEnum.MANAGER;
    }
    if (status === EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL) {
      return EmployeeFinanceApprovalStageEnum.HR;
    }
    if (status === EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL) {
      return EmployeeFinanceApprovalStageEnum.FINANCE;
    }
    return null;
  }

  private nextStatus(stage: EmployeeFinanceApprovalStageEnum) {
    if (stage === EmployeeFinanceApprovalStageEnum.MANAGER) {
      return this.configService.get<boolean>('EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL', true)
        ? EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL
        : EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL;
    }
    if (stage === EmployeeFinanceApprovalStageEnum.HR) {
      return this.configService.get<boolean>('EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL', true)
        ? EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL
        : EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE;
    }
    return EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE;
  }
}

@Injectable()
export class EmployeeFinanceDisbursementService {
  constructor(
    private readonly ledgerService: EmployeeFinanceLedgerService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceDisbursement)
    private readonly repository: Repository<EmployeeFinanceDisbursement>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateEmployeeFinanceDisbursementDto) {
    const account = await this.accountRepository.findOne({
      where: { id: dto.account_id, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (account.status !== EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT) {
      throw new ConflictException('Account is not pending disbursement.');
    }
    return this.repository.save(
      this.repository.create({
        companyId: account.companyId,
        accountId: account.id,
        amount: dto.amount,
        paymentReference: dto.payment_reference.trim(),
        paymentDate: dto.payment_date,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const item = await this.repository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!item) throw new NotFoundException('Disbursement not found.');
    if (item.createdByCompanyUserId === (actor.companyMembershipId ?? actor.id)) {
      throw new ForbiddenException('Disbursement maker cannot approve it.');
    }
    item.status = EmployeeFinanceDisbursementStatusEnum.APPROVED;
    item.approvedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    return this.repository.save(item);
  }

  async confirm(actor: AuthenticatedUser, id: number) {
    const item = await this.repository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!item) throw new NotFoundException('Disbursement not found.');
    if (item.status === EmployeeFinanceDisbursementStatusEnum.CONFIRMED) return item;
    if (item.status !== EmployeeFinanceDisbursementStatusEnum.APPROVED) {
      throw new ConflictException('Only approved disbursements can be confirmed.');
    }
    const account = await this.accountRepository.findOne({
      where: { id: item.accountId, companyId: item.companyId },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    await this.ledgerService.post({
      companyId: item.companyId,
      accountId: item.accountId,
      entryType: EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_DISBURSEMENT,
      direction: 'DEBIT',
      principalAmount: item.amount,
      effectiveDate: item.paymentDate,
      sourceType: 'DISBURSEMENT',
      sourceId: String(item.id),
      idempotencyKey: `disbursement:${item.id}`,
      postedByCompanyUserId: actor.companyMembershipId ?? actor.id,
    });
    item.status = EmployeeFinanceDisbursementStatusEnum.CONFIRMED;
    item.confirmedAt = new Date();
    account.status = EmployeeFinanceAccountStatusEnum.ACTIVE;
    account.disbursedAt = new Date();
    await this.accountRepository.save(account);
    await this.applicationRepository.update(
      { id: account.applicationId, companyId: account.companyId },
      { status: EmployeeFinanceApplicationStatusEnum.DISBURSED },
    );
    await this.auditService.log({
      actor,
      action: 'finance.disbursement.confirmed',
      entityType: 'EMPLOYEE_FINANCE_DISBURSEMENT',
      entityId: item.id,
    });
    return this.repository.save(item);
  }
}

@Injectable()
export class EmployeeFinancePayrollInstructionService {
  constructor(
    private readonly ledgerService: EmployeeFinanceLedgerService,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository: Repository<EmployeeFinancePayrollInstruction>,
  ) {}

  async generateForPeriod(companyId: number, payrollPeriodId: number) {
    const period = await this.periodRepository.findOne({
      where: { id: payrollPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');
    const installments = await this.installmentRepository
      .createQueryBuilder('installment')
      .innerJoin(EmployeeFinanceAccount, 'account', 'account.id = installment.accountId')
      .where('installment.companyId = :companyId', { companyId })
      .andWhere('installment.dueDate >= :startDate', { startDate: period.startDate })
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
      .getMany();
    const instructions: EmployeeFinancePayrollInstruction[] = [];
    for (const installment of installments) {
      const existing = await this.instructionRepository.findOne({
        where: { installmentId: installment.id, payrollPeriodId },
      });
      if (existing) {
        instructions.push(existing);
        continue;
      }
      const account = await this.accountRepository.findOne({
        where: { id: installment.accountId, companyId },
      });
      if (!account) continue;
      instructions.push(
        await this.instructionRepository.save(
          this.instructionRepository.create({
            companyId,
            employeeId: installment.employeeId,
            accountId: installment.accountId,
            installmentId: installment.id,
            payrollPeriodId,
            componentCode:
              account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
                ? 'SALARY_ADVANCE'
                : 'STAFF_LOAN',
            amount: EmployeeFinanceMoney.subtract(
              installment.totalDue,
              installment.paidAmount,
            ),
            snapshot: {
              account_no: account.accountNo,
              installment_number: installment.installmentNumber,
              due_date: installment.dueDate,
            },
          }),
        ),
      );
    }
    return instructions;
  }

  async reserveForPayrollRun(companyId: number, payrollPeriodId: number, payrollRunId: number, employeeId: number) {
    await this.generateForPeriod(companyId, payrollPeriodId);
    const instructions = await this.instructionRepository.find({
      where: {
        companyId,
        payrollPeriodId,
        employeeId,
        status: In([
          EmployeeFinancePayrollInstructionStatusEnum.OPEN,
          EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
        ]),
      },
      order: { id: 'ASC' },
    });
    for (const instruction of instructions) {
      if (instruction.payrollRunId && instruction.payrollRunId !== payrollRunId) {
        throw new ConflictException('Payroll instruction is already reserved by another run.');
      }
      instruction.payrollRunId = payrollRunId;
      instruction.reservedAmount = instruction.amount;
      instruction.status = EmployeeFinancePayrollInstructionStatusEnum.RESERVED;
      await this.instructionRepository.save(instruction);
    }
    return instructions;
  }

  async lockForPayrollRun(companyId: number, payrollRunId: number) {
    const instructions = await this.instructionRepository.find({
      where: {
        companyId,
        payrollRunId,
        status: EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
      },
      order: { id: 'ASC' },
    });
    for (const instruction of instructions) {
      await this.postPayrollInstruction(instruction);
    }
  }

  private async postPayrollInstruction(instruction: EmployeeFinancePayrollInstruction) {
    const installment = await this.installmentRepository.findOne({
      where: {
        id: instruction.installmentId,
        companyId: instruction.companyId,
        accountId: instruction.accountId,
      },
    });
    if (!installment) throw new NotFoundException('Finance installment not found.');
    const amountCents = EmployeeFinanceMoney.toCents(instruction.reservedAmount);
    let remaining = amountCents;
    const feeCents = remaining < EmployeeFinanceMoney.toCents(installment.feeDue)
      ? remaining
      : EmployeeFinanceMoney.toCents(installment.feeDue);
    remaining -= feeCents;
    const interestCents = remaining < EmployeeFinanceMoney.toCents(installment.interestDue)
      ? remaining
      : EmployeeFinanceMoney.toCents(installment.interestDue);
    remaining -= interestCents;
    const principalCents = remaining;
    await this.ledgerService.post({
      companyId: instruction.companyId,
      accountId: instruction.accountId,
      installmentId: instruction.installmentId,
      entryType: EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
      direction: 'CREDIT',
      principalAmount: EmployeeFinanceMoney.fromCents(principalCents),
      interestAmount: EmployeeFinanceMoney.fromCents(interestCents),
      feeAmount: EmployeeFinanceMoney.fromCents(feeCents),
      effectiveDate: todayString(),
      sourceType: 'PAYROLL',
      sourceId: String(instruction.payrollRunId),
      idempotencyKey: `payroll:${instruction.payrollRunId}:${instruction.id}`,
    });
    installment.paidAmount = EmployeeFinanceMoney.add(
      installment.paidAmount,
      instruction.reservedAmount,
    );
    installment.status =
      EmployeeFinanceMoney.toCents(installment.paidAmount) >=
      EmployeeFinanceMoney.toCents(installment.totalDue)
        ? EmployeeFinanceInstallmentStatusEnum.PAID
        : EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID;
    await this.installmentRepository.save(installment);
    instruction.postedAmount = instruction.reservedAmount;
    instruction.status = EmployeeFinancePayrollInstructionStatusEnum.POSTED;
    await this.instructionRepository.save(instruction);
  }
}

@Injectable()
export class EmployeeFinanceRepaymentService {
  constructor(
    private readonly ledgerService: EmployeeFinanceLedgerService,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinanceRepayment)
    private readonly repaymentRepository: Repository<EmployeeFinanceRepayment>,
    @InjectRepository(EmployeeFinanceRepaymentAllocation)
    private readonly allocationRepository: Repository<EmployeeFinanceRepaymentAllocation>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateEmployeeFinanceRepaymentDto) {
    const account = await this.accountRepository.findOne({
      where: { id: dto.account_id, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    return this.repaymentRepository.save(
      this.repaymentRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        repaymentType: dto.repayment_type ?? 'DIRECT_REPAYMENT',
        amount: dto.amount,
        paymentReference: dto.payment_reference ?? null,
        paymentDate: dto.payment_date,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const repayment = await this.repaymentRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!repayment) throw new NotFoundException('Repayment not found.');
    if (repayment.createdByCompanyUserId === (actor.companyMembershipId ?? actor.id)) {
      throw new ForbiddenException('Repayment maker cannot approve it.');
    }
    repayment.status = EmployeeFinanceRepaymentStatusEnum.APPROVED;
    repayment.approvedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    await this.postRepayment(repayment);
    return this.repaymentRepository.save(repayment);
  }

  private async postRepayment(repayment: EmployeeFinanceRepayment) {
    if (repayment.status === EmployeeFinanceRepaymentStatusEnum.POSTED) return repayment;
    let remaining = EmployeeFinanceMoney.toCents(repayment.amount);
    const installments = await this.installmentRepository.find({
      where: {
        companyId: repayment.companyId,
        accountId: repayment.accountId,
        status: In([
          EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
          EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
          EmployeeFinanceInstallmentStatusEnum.OVERDUE,
        ]),
      },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    for (const installment of installments) {
      if (remaining <= 0n) break;
      const due = EmployeeFinanceMoney.toCents(
        EmployeeFinanceMoney.subtract(installment.totalDue, installment.paidAmount),
      );
      const applied = remaining > due ? due : remaining;
      remaining -= applied;
      installment.paidAmount = EmployeeFinanceMoney.add(
        installment.paidAmount,
        EmployeeFinanceMoney.fromCents(applied),
      );
      installment.status =
        EmployeeFinanceMoney.toCents(installment.paidAmount) >=
        EmployeeFinanceMoney.toCents(installment.totalDue)
          ? EmployeeFinanceInstallmentStatusEnum.PAID
          : EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID;
      await this.installmentRepository.save(installment);
      await this.allocationRepository.save(
        this.allocationRepository.create({
          companyId: repayment.companyId,
          repaymentId: repayment.id,
          installmentId: installment.id,
          principalAmount: EmployeeFinanceMoney.fromCents(applied),
          interestAmount: '0.00',
          feeAmount: '0.00',
        }),
      );
    }
    await this.ledgerService.post({
      companyId: repayment.companyId,
      accountId: repayment.accountId,
      entryType:
        repayment.repaymentType === 'ADDITIONAL_REPAYMENT'
          ? EmployeeFinanceLedgerEntryTypeEnum.ADDITIONAL_REPAYMENT
          : EmployeeFinanceLedgerEntryTypeEnum.DIRECT_REPAYMENT,
      direction: 'CREDIT',
      principalAmount: repayment.amount,
      effectiveDate: repayment.paymentDate,
      sourceType: 'REPAYMENT',
      sourceId: String(repayment.id),
      idempotencyKey: `repayment:${repayment.id}`,
    });
    repayment.status = EmployeeFinanceRepaymentStatusEnum.POSTED;
    return repayment;
  }
}

@Injectable()
export class EmployeeFinanceSettlementService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ledgerService: EmployeeFinanceLedgerService,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceSettlementQuote)
    private readonly quoteRepository: Repository<EmployeeFinanceSettlementQuote>,
  ) {}

  async quote(actor: AuthenticatedUser, accountId: number) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    const balance = await this.ledgerService.calculateBalance(account.companyId, account.id);
    const validDays = this.configService.get<number>(
      'EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS',
      7,
    );
    const validUntil = addDaysString(todayString(), validDays);
    const snapshot = { account_id: account.id, balance, generated_at: new Date().toISOString() };
    return this.quoteRepository.save(
      this.quoteRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        quoteNo: `EFQ-${account.companyId}-${account.id}-${Date.now()}`,
        settlementAmount: balance.total,
        validUntil,
        snapshot,
        snapshotHash: hash(snapshot),
      }),
    );
  }
}

@Injectable()
export class EmployeeFinanceDefermentService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(EmployeeFinanceProduct)
    private readonly productRepository: Repository<EmployeeFinanceProduct>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinanceDefermentRequest)
    private readonly defermentRepository: Repository<EmployeeFinanceDefermentRequest>,
  ) {}

  async request(actor: AuthenticatedUser, accountId: number, dto: RequestEmployeeFinanceDefermentDto) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    const product = await this.productRepository.findOne({
      where: { id: account.productId, companyId: account.companyId },
    });
    if (!product?.allowDeferment) {
      throw new ConflictException('This product does not allow installment deferment.');
    }
    const count = await this.defermentRepository.count({
      where: { companyId: account.companyId, accountId: account.id },
    });
    if (
      count >=
      this.configService.get<number>('EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR', 2)
    ) {
      throw new ConflictException('Maximum deferments reached.');
    }
    const installment = await this.installmentRepository.findOne({
      where: { id: dto.installment_id, accountId: account.id },
    });
    if (!installment) throw new NotFoundException('Installment not found.');
    if (installment.status === EmployeeFinanceInstallmentStatusEnum.PAID) {
      throw new ConflictException('Paid installments cannot be deferred.');
    }
    installment.status = EmployeeFinanceInstallmentStatusEnum.DEFERRED;
    await this.installmentRepository.save(installment);
    return this.defermentRepository.save(
      this.defermentRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        installmentId: installment.id,
        reason: dto.reason,
        status: 'APPROVED',
      }),
    );
  }
}

@Injectable()
export class EmployeeFinanceRescheduleService {
  constructor(
    @InjectRepository(EmployeeFinanceProduct)
    private readonly productRepository: Repository<EmployeeFinanceProduct>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceReschedule)
    private readonly rescheduleRepository: Repository<EmployeeFinanceReschedule>,
  ) {}

  async request(actor: AuthenticatedUser, accountId: number, dto: RequestEmployeeFinanceRescheduleDto) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    const product = await this.productRepository.findOne({
      where: { id: account.productId, companyId: account.companyId },
    });
    if (!product?.allowRescheduling) {
      throw new ConflictException('This product does not allow rescheduling.');
    }
    const reschedule = await this.rescheduleRepository.save(
      this.rescheduleRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        oldScheduleVersion: account.scheduleVersion,
        newScheduleVersion: account.scheduleVersion + 1,
        newTermMonths: dto.new_term_months,
        reason: dto.reason,
        status: 'APPROVED',
      }),
    );
    account.scheduleVersion += 1;
    account.termMonths = dto.new_term_months;
    account.status = EmployeeFinanceAccountStatusEnum.RESTRUCTURED;
    await this.accountRepository.save(account);
    return reschedule;
  }
}

@Injectable()
export class EmployeeFinanceExitRecoveryService {
  constructor(
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceExitRecovery)
    private readonly exitRecoveryRepository: Repository<EmployeeFinanceExitRecovery>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRepository: Repository<OffboardingRequest>,
    @InjectRepository(OffboardingSettlementItem)
    private readonly settlementItemRepository: Repository<OffboardingSettlementItem>,
  ) {}

  async createForOffboarding(companyId: number, offboardingRequestId: number) {
    const offboarding = await this.offboardingRepository.findOne({
      where: { id: offboardingRequestId, company_id: companyId },
    });
    if (!offboarding) throw new NotFoundException('Offboarding request not found.');
    const accounts = await this.accountRepository.find({
      where: {
        companyId,
        employeeId: offboarding.employee_id,
        status: In(activeAccountStatuses()),
      },
    });
    const recoveries: EmployeeFinanceExitRecovery[] = [];
    for (const account of accounts) {
      const snapshot = {
        account_id: account.id,
        account_no: account.accountNo,
        product_type: account.productType,
        outstanding_total: account.outstandingTotal,
      };
      const recovery =
        (await this.exitRecoveryRepository.findOne({
          where: { offboardingRequestId, accountId: account.id },
        })) ??
        (await this.exitRecoveryRepository.save(
          this.exitRecoveryRepository.create({
            companyId,
            offboardingRequestId,
            employeeId: offboarding.employee_id,
            accountId: account.id,
            recoveryAmount: account.outstandingTotal,
            snapshot,
            snapshotHash: hash(snapshot),
          }),
        ));
      await this.settlementItemRepository.save(
        this.settlementItemRepository.create({
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          item_type:
            account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
              ? OffboardingSettlementItemTypeEnum.SALARY_ADVANCE_RECOVERY
              : OffboardingSettlementItemTypeEnum.LOAN_RECOVERY,
          title:
            account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
              ? 'Salary advance recovery'
              : 'Staff loan recovery',
          status: OffboardingSettlementStatusEnum.PENDING,
          amount: account.outstandingTotal,
          currency: 'TZS',
          source_type:
            account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
              ? OffboardingSettlementSourceEnum.ADVANCE_EXTERNAL
              : OffboardingSettlementSourceEnum.LOAN_EXTERNAL,
          source_reference: account.accountNo,
          calculation_snapshot: snapshot,
          metadata: { employee_finance_exit_recovery_id: recovery.id },
        }),
      );
      account.status = EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY;
      await this.accountRepository.save(account);
      recoveries.push(recovery);
    }
    return recoveries;
  }
}

@Injectable()
export class EmployeeFinanceReportsService {
  constructor(
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
  ) {}

  async dashboard(actor: AuthenticatedUser) {
    const companyId = actor.companyId!;
    const [pendingApplications, activeAccounts, arrearsAccounts] = await Promise.all([
      this.applicationRepository.count({
        where: {
          companyId,
          status: In([
            EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
            EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
            EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
            EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
          ]),
        },
      }),
      this.accountRepository.count({
        where: { companyId, status: In(activeAccountStatuses()) },
      }),
      this.accountRepository.count({
        where: { companyId, status: EmployeeFinanceAccountStatusEnum.IN_ARREARS },
      }),
    ]);
    return { pendingApplications, activeAccounts, arrearsAccounts };
  }
}

@Injectable()
export class EmployeeFinanceReconciliationService {
  constructor(
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository: Repository<EmployeeFinancePayrollInstruction>,
    private readonly ledgerService: EmployeeFinanceLedgerService,
  ) {}

  @Cron(process.env.EMPLOYEE_FINANCE_RECONCILIATION_CRON || '0 30 2 * * *')
  async scheduledReconciliation() {
    const accounts = await this.accountRepository.find({ take: 100 });
    let issues = 0;
    for (const account of accounts) {
      issues += (await this.reconcileAccount(account.companyId, account.id)).issue_count;
    }
    return issues;
  }

  async reconcile(actor: AuthenticatedUser, accountId?: number) {
    if (accountId) return this.reconcileAccount(actor.companyId!, accountId);
    const accounts = await this.accountRepository.find({
      where: { companyId: actor.companyId! },
      order: { id: 'ASC' },
    });
    const results: EmployeeFinanceReconciliationResult[] = [];
    for (const account of accounts) {
      results.push(await this.reconcileAccount(account.companyId, account.id));
    }
    return {
      account_count: results.length,
      issue_count: results.reduce((sum, item) => sum + item.issue_count, 0),
      results,
    };
  }

  private async reconcileAccount(
    companyId: number,
    accountId: number,
  ): Promise<EmployeeFinanceReconciliationResult> {
    const issues: Record<string, unknown>[] = [];
    const account = await this.accountRepository.findOne({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Finance account not found.');
    const balance = await this.ledgerService.calculateBalance(companyId, accountId);
    if (EmployeeFinanceMoney.toCents(balance.total) !== EmployeeFinanceMoney.toCents(account.outstandingTotal)) {
      issues.push({ code: 'ACCOUNT_BALANCE_DIFFERS_FROM_LEDGER', account_id: accountId });
    }
    const unpaidFuture = await this.installmentRepository.count({
      where: {
        companyId,
        accountId,
        status: In([
          EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
          EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
          EmployeeFinanceInstallmentStatusEnum.OVERDUE,
        ]),
      },
    });
    if (activeAccountStatuses().includes(account.status) && unpaidFuture === 0) {
      issues.push({ code: 'ACTIVE_ACCOUNT_HAS_NO_FUTURE_SCHEDULE', account_id: accountId });
    }
    const duplicateInstructionRows = await this.instructionRepository
      .createQueryBuilder('instruction')
      .select('instruction.installmentId', 'installment_id')
      .addSelect('COUNT(*)', 'count')
      .where('instruction.companyId = :companyId', { companyId })
      .andWhere('instruction.accountId = :accountId', { accountId })
      .groupBy('instruction.installmentId')
      .having('COUNT(*) > 1')
      .getRawMany();
    if (duplicateInstructionRows.length > 0) {
      issues.push({ code: 'PAYROLL_INSTRUCTION_INCLUDED_TWICE', account_id: accountId });
    }
    return { account_id: accountId, issue_count: issues.length, issues };
  }
}
