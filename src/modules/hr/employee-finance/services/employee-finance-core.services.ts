import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { basename } from 'path';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../../common/utils/permission.util';
import { FilesService } from '../../../files/files.service';
import { EmployeeCompensationVersion } from '../../employee-movements/entities/employee-compensation-version.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeConfirmationStatusEnum } from '../../employees/enums/employee-confirmation-status.enum';
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
  CreateEmployeeFinanceApplicationDocumentDto,
  CreateEmployeeFinanceApplicationDto,
  CreateEmployeeFinanceGuarantorDto,
  CreateEmployeeFinanceDisbursementDto,
  CreateEmployeeFinanceProductDto,
  CreateEmployeeFinanceRepaymentDto,
  ConfirmEmployeeFinanceExitRecoveryDto,
  DecideEmployeeFinanceApplicationDto,
  DecideEmployeeFinanceGuarantorDto,
  DecideEmployeeFinanceServicingRequestDto,
  DelegatedEmployeeFinanceDecisionDto,
  EmployeeFinanceQueryDto,
  EvaluateEmployeeFinanceEligibilityDto,
  EvaluateMyEmployeeFinanceEligibilityDto,
  ImportEmployeeFinancePaymentFileDto,
  PostEmployeeFinanceAccountingDto,
  RequestEmployeeFinanceDefermentDto,
  RequestEmployeeFinanceRescheduleDto,
  SettleEmployeeFinanceQuoteDto,
  UpdateEmployeeFinanceApplicationDto,
  UploadEmployeeFinanceApplicationDocumentDto,
  VerifyEmployeeFinanceApplicationDocumentDto,
} from '../dto/employee-finance.dto';
import {
  EmployeeFinanceApplication,
  EmployeeFinanceApplicationApproval,
  EmployeeFinanceApplicationDocument,
  EmployeeFinanceApplicationGuarantor,
  EmployeeFinanceSanctionLetter,
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
import { NotificationQueueService } from '../../../notifications/notification-queue.service';
import { SmsNotificationManagementService } from '../../../sms/sms-notification-management.service';
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
  EmployeeFinanceRequestStatusEnum,
} from '../employee-finance.enums';
import { EmployeeFinanceMoney } from './employee-finance-money.util';
import {
  DEFAULT_SANCTION_LETTER_BODY,
  EMPLOYEE_FINANCE_STAGE_PERMISSION,
  EMPLOYEE_FINANCE_STAGE_STATUS,
  EmployeeFinanceAccountStatusService,
  EmployeeFinanceDelegationService,
  EmployeeFinanceLetterTemplateService,
  EmployeeFinanceNotifierService,
  EmployeeFinancePermissionDirectoryService,
  EmployeeFinanceRoutableStage,
  assertDecidable,
  fillTemplate,
  isRoutableStage,
  normalizeApprovalTiers,
  resolveApprovalRoute,
  stageForStatus,
} from './employee-finance-policy.services';
import {
  activeAccountStatuses,
  addDaysString,
  addMonths,
  daysBetweenDates,
  hash,
  monthsBetween,
  recordValue,
  textValue,
  todayString,
} from '../employee-finance.utils';

const EMPLOYEE_FINANCE_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const EMPLOYEE_FINANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

function numberFromPolicy(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function moneyStringFromPolicy(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '0';
  const candidate = String(value).trim();
  if (!candidate) return '0';
  try {
    const parsed = new Decimal(candidate);
    return parsed.isFinite() ? parsed.toString() : '0';
  } catch {
    return '0';
  }
}

function requiredGuarantorCount(productSnapshotValue: unknown) {
  const productSnapshot = recordValue(productSnapshotValue);
  const approval = recordValue(productSnapshot.approvalConfiguration);
  const eligibility = recordValue(productSnapshot.eligibilityConfiguration);
  return Math.max(
    numberFromPolicy(productSnapshot.requiredGuarantors),
    numberFromPolicy(productSnapshot.required_guarantors),
    numberFromPolicy(approval.required_guarantors),
    numberFromPolicy(approval.guarantor_count),
    numberFromPolicy(eligibility.required_guarantors),
    numberFromPolicy(eligibility.guarantor_count),
  );
}

function requiredDocumentTypes(
  productSnapshot: Record<string, unknown>,
  requestedAmount?: string | null,
) {
  const raw =
    productSnapshot.requiredDocumentTypes ??
    productSnapshot.required_document_types;
  const base = Array.isArray(raw)
    ? raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const policy = recordValue(
    productSnapshot.policyConfiguration ?? productSnapshot.policy_configuration,
  );
  const collateralThreshold = moneyStringFromPolicy(
    policy.collateral_required_above,
  );
  if (
    requestedAmount &&
    EmployeeFinanceMoney.toCents(collateralThreshold) > 0n &&
    EmployeeFinanceMoney.toCents(requestedAmount) >
      EmployeeFinanceMoney.toCents(collateralThreshold)
  ) {
    base.push('COLLATERAL');
  }
  const byAmount = Array.isArray(policy.required_documents_by_amount)
    ? policy.required_documents_by_amount
    : [];
  for (const item of byAmount) {
    const rule = recordValue(item);
    const minimumAmount = moneyStringFromPolicy(rule.minimum_amount);
    const documents = Array.isArray(rule.documents) ? rule.documents : [];
    if (
      !requestedAmount ||
      EmployeeFinanceMoney.toCents(requestedAmount) <
        EmployeeFinanceMoney.toCents(minimumAmount)
    )
      continue;
    for (const document of documents) {
      if (typeof document === 'string' && document.trim()) {
        base.push(document.trim().toUpperCase());
      }
    }
  }
  return Array.from(new Set(base));
}

function guarantorEmployeeIdFromDocument(
  document: EmployeeFinanceApplicationDocument,
) {
  if (document.documentType.trim().toUpperCase() !== 'GUARANTOR_FORM') {
    return null;
  }
  const metadata = recordValue(document.metadata);
  const employeeId = Number(
    metadata.guarantor_employee_id ?? metadata.guarantorEmployeeId,
  );
  return Number.isSafeInteger(employeeId) && employeeId > 0 ? employeeId : null;
}

function financePolicyConfiguration(product: EmployeeFinanceProduct) {
  return recordValue(
    (product.eligibilityConfiguration ?? {}).policy_configuration ??
      (product.eligibilityConfiguration ?? {}).policyConfiguration,
  );
}

function normalizeImportStatus(value: unknown) {
  const status =
    typeof value === 'string' || typeof value === 'number'
      ? String(value).trim().toUpperCase()
      : 'SUCCESS';
  if (
    ['PAID', 'SUCCESS', 'SUCCESSFUL', 'CONFIRMED', 'SETTLED'].includes(status)
  )
    return 'SUCCESS';
  if (['FAILED', 'REJECTED', 'RETURNED', 'REVERSAL'].includes(status))
    return 'FAILED';
  if (['PARTIAL', 'PARTIALLY_PAID', 'SHORT_PAID'].includes(status))
    return 'PARTIAL';
  return status || 'SUCCESS';
}

/** 1234567.5 -> "1,234,567.50" for letters and notifications. */
export function formatMoney(value: string | number | null | undefined) {
  const fixed = EmployeeFinanceMoney.fromCents(
    EmployeeFinanceMoney.toCents(value),
  );
  const negative = fixed.startsWith('-');
  const [whole, fraction] = (negative ? fixed.slice(1) : fixed).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${fraction}`;
}

function interestMethodLabel(method: string) {
  const value = method as EmployeeFinanceInterestMethodEnum;
  if (value === EmployeeFinanceInterestMethodEnum.FLAT_RATE) return 'flat rate';
  if (value === EmployeeFinanceInterestMethodEnum.REDUCING_BALANCE)
    return 'reducing balance';
  return 'interest free';
}

/** Monthly instalment for a request, honouring the product interest method. */
export function estimateInstallmentAmount(
  method: EmployeeFinanceInterestMethodEnum | string | null | undefined,
  annualRateValue: string | number | null | undefined,
  requestedAmount?: string | null,
  requestedTermMonths?: number | null,
) {
  if (
    !requestedAmount ||
    !requestedTermMonths ||
    requestedTermMonths <= 0 ||
    EmployeeFinanceMoney.toCents(requestedAmount) <= 0n
  ) {
    return null;
  }
  const principal = new Decimal(requestedAmount);
  const annualRate = new Decimal(annualRateValue || '0');
  if (
    annualRate.isZero() ||
    method === EmployeeFinanceInterestMethodEnum.ZERO_INTEREST
  ) {
    return EmployeeFinanceMoney.divide(requestedAmount, requestedTermMonths);
  }
  const monthlyRate = annualRate.div(100).div(12);
  if (method === EmployeeFinanceInterestMethodEnum.FLAT_RATE) {
    const interest = principal.times(monthlyRate).times(requestedTermMonths);
    return EmployeeFinanceMoney.divide(
      principal.plus(interest).toString(),
      requestedTermMonths,
    );
  }
  // Reducing balance schedules repay equal principal plus interest on the
  // outstanding balance, so the first instalment is the largest one.
  return EmployeeFinanceMoney.add(
    EmployeeFinanceMoney.divide(requestedAmount, requestedTermMonths),
    EmployeeFinanceMoney.multiply(requestedAmount, monthlyRate.toString()),
  );
}

/** One-off processing fee charged when the loan is disbursed. */
export function processingFeeFor(
  productSnapshot: Record<string, unknown>,
  principal: string,
) {
  const method = textValue(
    productSnapshot.processingFeeMethod ??
      productSnapshot.processing_fee_method,
    'NONE',
  ).toUpperCase();
  const value = textValue(
    productSnapshot.processingFeeValue ?? productSnapshot.processing_fee_value,
    '0',
  );
  if (method === 'FLAT') {
    // Database numeric columns can be returned with storage-scale zeroes
    // (for example "5000.000000"). Round stored configuration to currency
    // precision before handing it to the strict cents parser.
    return new Decimal(value)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
  }
  if (method === 'PERCENT') {
    return EmployeeFinanceMoney.multiplyPercent(principal, value);
  }
  return '0.00';
}

/**
 * Splits what is still owed on an instalment into fee, interest, and
 * principal. Payments settle fees first, then interest, then principal, so
 * the paid amount is peeled off in that order.
 */
export function installmentRemainder(installment: {
  feeDue: string;
  interestDue: string;
  principalDue: string;
  paidAmount: string;
}) {
  let paid = EmployeeFinanceMoney.toCents(installment.paidAmount);
  const take = (dueValue: string) => {
    const due = EmployeeFinanceMoney.toCents(dueValue);
    const covered = paid < due ? paid : due;
    paid -= covered;
    return due - covered;
  };
  const fee = take(installment.feeDue);
  const interest = take(installment.interestDue);
  const principal = take(installment.principalDue);
  return { fee, interest, principal, total: fee + interest + principal };
}

/**
 * Applies a credit to instalments oldest-first, fee -> interest ->
 * principal within each, and returns the per-component totals so the ledger
 * entry matches what the schedule recorded.
 */
export function allocateCreditToInstallments(
  installments: EmployeeFinanceInstallment[],
  amountCents: bigint,
) {
  let remaining = amountCents;
  const totals = { fee: 0n, interest: 0n, principal: 0n };
  const allocations: Array<{
    installment: EmployeeFinanceInstallment;
    fee: bigint;
    interest: bigint;
    principal: bigint;
  }> = [];
  for (const installment of installments) {
    if (remaining <= 0n) break;
    const owed = installmentRemainder(installment);
    if (owed.total <= 0n) continue;
    const fee = remaining < owed.fee ? remaining : owed.fee;
    remaining -= fee;
    const interest = remaining < owed.interest ? remaining : owed.interest;
    remaining -= interest;
    const principal = remaining < owed.principal ? remaining : owed.principal;
    remaining -= principal;
    const applied = fee + interest + principal;
    installment.paidAmount = EmployeeFinanceMoney.add(
      installment.paidAmount,
      EmployeeFinanceMoney.fromCents(applied),
    );
    installment.status =
      EmployeeFinanceMoney.toCents(installment.paidAmount) >=
      EmployeeFinanceMoney.toCents(installment.totalDue)
        ? EmployeeFinanceInstallmentStatusEnum.PAID
        : EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID;
    if (installment.status === EmployeeFinanceInstallmentStatusEnum.PAID) {
      installment.overdueSince = null;
    }
    totals.fee += fee;
    totals.interest += interest;
    totals.principal += principal;
    allocations.push({ installment, fee, interest, principal });
  }
  return { allocations, totals, unapplied: remaining };
}

/**
 * Interest scheduled on instalments falling due after `asOf`. Early
 * settlement, rescheduling, and exit recovery rebate it because it has not
 * been earned yet.
 */
export function unearnedInterestCents(
  installments: EmployeeFinanceInstallment[],
  asOf: string,
) {
  return installments
    .filter((installment) => installment.dueDate > asOf)
    .reduce(
      (sum, installment) => sum + installmentRemainder(installment).interest,
      0n,
    );
}

export const OPEN_INSTALLMENT_STATUSES = [
  EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
  EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
  EmployeeFinanceInstallmentStatusEnum.OVERDUE,
  EmployeeFinanceInstallmentStatusEnum.DEFERRED,
];

/** Bank statement columns holding each value (first match wins, case-insensitive). */
export type EmployeeFinanceBankColumnMap = {
  reference?: string[];
  amount?: string[];
  status?: string[];
};

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
    const code = dto.code.trim().toUpperCase();
    const existing = await this.repository.count({
      where: { companyId, code },
    });
    if (existing > 0) {
      throw new ConflictException(
        `Product code ${code} already exists; create a new version of it instead.`,
      );
    }
    const product = await this.repository.save(
      this.repository.create({
        companyId,
        ...this.attributesFromDto(dto),
        versionNumber: 1,
        parentProductId: null,
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

  /**
   * Edits a product in place while nobody has applied for it. Once an
   * application exists the terms are frozen and changes need a new version.
   */
  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: CreateEmployeeFinanceProductDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const product = await this.repository.findOne({ where: { id, companyId } });
    if (!product) throw new NotFoundException('Finance product not found.');
    const used = await this.applicationRepository.count({
      where: { companyId, productId: product.id },
    });
    if (used > 0 || product.isLocked) {
      throw new ConflictException(
        'Used finance products are immutable; create a new version.',
      );
    }
    const attributes = this.attributesFromDto(dto);
    if (attributes.code !== product.code) {
      const clash = await this.repository.count({
        where: { companyId, code: attributes.code },
      });
      if (clash > 0) {
        throw new ConflictException(
          `Product code ${attributes.code} already exists.`,
        );
      }
    }
    Object.assign(product, attributes);
    const saved = await this.repository.save(product);
    await this.auditService.log({
      actor,
      action: 'finance.product.updated',
      entityType: 'EMPLOYEE_FINANCE_PRODUCT',
      entityId: saved.id,
      summary: { code: saved.code },
    });
    return saved;
  }

  /**
   * Publishes changed terms as a new version of a product. The current
   * version stops accepting applications the day before the new one starts;
   * loans already granted keep the terms they were approved on.
   */
  async createVersion(
    actor: AuthenticatedUser,
    id: number,
    dto: CreateEmployeeFinanceProductDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const source = await this.repository.findOne({ where: { id, companyId } });
    if (!source) throw new NotFoundException('Finance product not found.');
    if (source.status === 'RETIRED') {
      throw new ConflictException('Retired products cannot be versioned.');
    }
    const attributes = this.attributesFromDto({ ...dto, code: source.code });
    if (attributes.effectiveFrom <= source.effectiveFrom) {
      throw new BadRequestException(
        'The new version must start after the current version started.',
      );
    }
    if (attributes.productType !== source.productType) {
      throw new BadRequestException(
        'A new version cannot change the product type.',
      );
    }
    const latest = await this.repository.findOne({
      where: { companyId, code: source.code },
      order: { versionNumber: 'DESC' },
    });
    if (latest && latest.id !== source.id) {
      throw new ConflictException(
        `Version ${latest.versionNumber} already supersedes this product; version that one instead.`,
      );
    }
    const version = await this.repository.save(
      this.repository.create({
        companyId,
        ...attributes,
        versionNumber: source.versionNumber + 1,
        parentProductId: source.id,
        status: 'ACTIVE',
      }),
    );
    source.effectiveTo = addDaysString(attributes.effectiveFrom, -1);
    source.isLocked = true;
    if (source.effectiveTo < todayString()) source.status = 'RETIRED';
    await this.repository.save(source);
    await this.auditService.log({
      actor,
      action: 'finance.product.versioned',
      entityType: 'EMPLOYEE_FINANCE_PRODUCT',
      entityId: version.id,
      summary: {
        code: version.code,
        version_number: version.versionNumber,
        previous_product_id: source.id,
      },
    });
    return version;
  }

  /** Stops new applications; existing loans are unaffected. */
  async retire(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const product = await this.repository.findOne({ where: { id, companyId } });
    if (!product) throw new NotFoundException('Finance product not found.');
    product.status = 'RETIRED';
    product.effectiveTo =
      product.effectiveTo && product.effectiveTo < todayString()
        ? product.effectiveTo
        : todayString();
    const saved = await this.repository.save(product);
    await this.auditService.log({
      actor,
      action: 'finance.product.retired',
      entityType: 'EMPLOYEE_FINANCE_PRODUCT',
      entityId: saved.id,
      summary: { code: saved.code },
    });
    return saved;
  }

  list(actor: AuthenticatedUser) {
    return this.repository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { productType: 'ASC', code: 'ASC', versionNumber: 'DESC' },
    });
  }

  /** Products an employee may apply for today: active and in effect. */
  async listAvailable(actor: AuthenticatedUser) {
    const today = todayString();
    const products = await this.repository.find({
      where: {
        companyId: this.hrAccessService.ensureActorCompanyId(actor),
        status: 'ACTIVE',
      },
      order: { productType: 'ASC', code: 'ASC' },
    });
    return products.filter(
      (product) =>
        product.effectiveFrom <= today &&
        (!product.effectiveTo || product.effectiveTo >= today),
    );
  }

  async getActive(companyId: number, productId: number) {
    const product = await this.repository.findOne({
      where: { id: productId, companyId, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundException('Finance product not found.');
    const today = todayString();
    if (
      product.effectiveFrom > today ||
      (product.effectiveTo && product.effectiveTo < today)
    ) {
      throw new ConflictException(
        'This finance product is not open for applications today.',
      );
    }
    return product;
  }

  async lockIfUsed(companyId: number, productId: number) {
    await this.repository.update(
      { id: productId, companyId, isLocked: false },
      { isLocked: true },
    );
  }

  private attributesFromDto(dto: CreateEmployeeFinanceProductDto) {
    const minAmount = EmployeeFinanceMoney.toCents(dto.minimum_amount);
    const maxAmount =
      dto.maximum_amount !== undefined && dto.maximum_amount !== ''
        ? EmployeeFinanceMoney.toCents(dto.maximum_amount)
        : null;
    if (minAmount <= 0n) {
      throw new BadRequestException('Minimum amount must be above zero.');
    }
    if (maxAmount !== null && minAmount > maxAmount) {
      throw new BadRequestException(
        'Minimum amount cannot exceed maximum amount.',
      );
    }
    if (!dto.maximum_term_months || dto.maximum_term_months < 1) {
      throw new BadRequestException('Maximum term must be at least 1 month.');
    }
    if ((dto.minimum_term_months ?? 1) > dto.maximum_term_months) {
      throw new BadRequestException('Minimum term cannot exceed maximum term.');
    }
    if (new Decimal(dto.annual_interest_rate || '0').lt(0)) {
      throw new BadRequestException('Interest rate cannot be negative.');
    }
    const feeMethod = (dto.processing_fee_method ?? 'NONE').toUpperCase();
    if (!['NONE', 'FLAT', 'PERCENT'].includes(feeMethod)) {
      throw new BadRequestException(
        'Processing fee method must be NONE, FLAT, or PERCENT.',
      );
    }
    const feeValue = dto.processing_fee_value || '0';
    if (new Decimal(feeValue).lt(0)) {
      throw new BadRequestException('Processing fee cannot be negative.');
    }
    if (feeMethod === 'PERCENT' && new Decimal(feeValue).gt(100)) {
      throw new BadRequestException(
        'Processing fee percent cannot exceed 100.',
      );
    }
    if (dto.effective_to && dto.effective_to < dto.effective_from) {
      throw new BadRequestException('Effective to is before effective from.');
    }
    const approvalConfiguration = { ...(dto.approval_configuration ?? {}) };
    if ('approval_tiers' in approvalConfiguration) {
      approvalConfiguration.approval_tiers = normalizeApprovalTiers(
        approvalConfiguration.approval_tiers,
      );
    }
    return {
      productType: dto.product_type,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      interestMethod:
        dto.interest_method ?? EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
      annualInterestRate: dto.annual_interest_rate || '0',
      processingFeeMethod: feeMethod,
      processingFeeValue: feeValue,
      minimumAmount: dto.minimum_amount,
      maximumAmount:
        dto.maximum_amount !== undefined && dto.maximum_amount !== ''
          ? dto.maximum_amount
          : null,
      maximumSalaryMultiple: dto.maximum_salary_multiple || null,
      minimumTermMonths: dto.minimum_term_months ?? 1,
      maximumTermMonths: dto.maximum_term_months,
      minimumServiceMonths: dto.minimum_service_months ?? 0,
      maximumInstallmentPercentage:
        dto.maximum_installment_percentage ||
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
      approvalConfiguration,
      effectiveFrom: dto.effective_from,
      effectiveTo: dto.effective_to ?? null,
    };
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

  async evaluate(
    actor: AuthenticatedUser,
    dto: EvaluateEmployeeFinanceEligibilityDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const product = await this.productService.getActive(
      companyId,
      dto.product_id,
    );
    return this.evaluateEligibility(
      companyId,
      dto.employee_id,
      product,
      dto.requested_amount,
      dto.requested_term_months,
    );
  }

  async evaluateMine(
    actor: AuthenticatedUser,
    dto: EvaluateMyEmployeeFinanceEligibilityDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee profile required.');
    }
    const product = await this.productService.getActive(
      companyId,
      dto.product_id,
    );
    return this.evaluateEligibility(
      companyId,
      actor.employeeId,
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
      where: {
        companyId,
        employeeId,
        status: EmployeePayrollResultStatusEnum.LOCKED,
      },
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
    const maximumAffordableInstallment = EmployeeFinanceMoney.multiplyPercent(
      netPay,
      product.maximumInstallmentPercentage,
    );
    const existingInstallments = activeAccounts.reduce(
      (sum, account) =>
        EmployeeFinanceMoney.add(sum, account.scheduledMonthlyInstallment),
      '0.00',
    );
    const availableInstallment = EmployeeFinanceMoney.subtract(
      maximumAffordableInstallment,
      existingInstallments,
    );
    const estimatedInstallment = this.estimateInstallment(
      product,
      requestedAmount,
      requestedTermMonths,
    );
    const estimatedNetPayAfterDeduction = estimatedInstallment
      ? EmployeeFinanceMoney.subtract(netPay, estimatedInstallment)
      : null;
    const installmentCapacityAfterRequest = estimatedInstallment
      ? EmployeeFinanceMoney.subtract(
          availableInstallment,
          estimatedInstallment,
        )
      : availableInstallment;
    const salaryMultipleLimit = product.maximumSalaryMultiple
      ? EmployeeFinanceMoney.multiply(baseSalary, product.maximumSalaryMultiple)
      : null;
    const configuredMaximum = product.maximumAmount;
    const maximumEligibleAmount =
      [salaryMultipleLimit, configuredMaximum]
        .filter((value): value is string => Boolean(value))
        .reduce(
          (current, value) =>
            current === null ? value : EmployeeFinanceMoney.min(current, value),
          null as string | null,
        ) ?? '0.00';
    const allowedGradeIds = product.eligibilityConfiguration
      .allowed_grade_ids as number[] | undefined;
    const policy = financePolicyConfiguration(product);
    const blockedEmployeeIds = Array.isArray(policy.blocked_employee_ids)
      ? policy.blocked_employee_ids.map((item) => Number(item))
      : [];
    const minimumNetPayAfterDeduction = moneyStringFromPolicy(
      policy.minimum_net_pay_after_deduction,
    );
    const applicable = await this.isProductApplicable(
      companyId,
      employee,
      product,
    );
    const serviceMonths = monthsBetween(employee.hire_date);
    const confirmationStatus = employee.confirmation_status ?? '';
    const onProbation = [
      EmployeeConfirmationStatusEnum.PROBATION,
      EmployeeConfirmationStatusEnum.CONFIRMATION_DUE,
      EmployeeConfirmationStatusEnum.PROBATION_EXTENDED,
    ].includes(confirmationStatus);
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
        passed:
          !allowedGradeIds?.length ||
          allowedGradeIds.includes(employee.grade_id ?? 0),
        value: employee.grade_id,
        required: allowedGradeIds ?? null,
        message: 'Employee grade must be eligible.',
      },
      {
        code: 'PROBATION_ALLOWED',
        passed: product.allowDuringProbation || !onProbation,
        value: confirmationStatus || null,
        required: product.allowDuringProbation ? 'any' : 'not on probation',
        message: 'This product is not available to employees on probation.',
      },
      {
        code: 'CONFIRMATION_REQUIRED',
        passed:
          !product.requiresConfirmation ||
          confirmationStatus === EmployeeConfirmationStatusEnum.CONFIRMED ||
          confirmationStatus === EmployeeConfirmationStatusEnum.NOT_APPLICABLE,
        value: confirmationStatus || null,
        required: product.requiresConfirmation ? 'CONFIRMED' : null,
        message: 'Employee must be confirmed in employment for this product.',
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
        required: {
          minimum: product.minimumAmount,
          maximum: maximumEligibleAmount,
        },
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
        passed:
          EmployeeFinanceMoney.toCents(installmentCapacityAfterRequest) >= 0n &&
          EmployeeFinanceMoney.toCents(availableInstallment) > 0n,
        value: {
          available_installment: availableInstallment,
          estimated_installment: estimatedInstallment,
          capacity_after_request: installmentCapacityAfterRequest,
        },
        required: '> 0',
        message:
          'Employee must have available payroll deduction capacity for the request.',
      },
      {
        code: 'POLICY_NOT_BLOCKED',
        passed: !blockedEmployeeIds.includes(employee.id),
        value: employee.id,
        required: 'not in blocked_employee_ids',
        message: 'Employee must not be blocked by loan policy.',
      },
      {
        code: 'MINIMUM_NET_PAY_AFTER_DEDUCTION',
        passed:
          EmployeeFinanceMoney.toCents(minimumNetPayAfterDeduction) <= 0n ||
          !estimatedNetPayAfterDeduction ||
          EmployeeFinanceMoney.toCents(estimatedNetPayAfterDeduction) >=
            EmployeeFinanceMoney.toCents(minimumNetPayAfterDeduction),
        value: estimatedNetPayAfterDeduction,
        required:
          EmployeeFinanceMoney.toCents(minimumNetPayAfterDeduction) > 0n
            ? minimumNetPayAfterDeduction
            : null,
        message:
          'Employee must retain the minimum configured net pay after deduction.',
      },
    ];
    const snapshot = {
      employee_id: employee.id,
      product_id: product.id,
      base_salary: baseSalary,
      latest_net_pay: latestPayroll?.netPay ?? null,
      existing_finance_installments: existingInstallments,
      maximum_affordable_installment: maximumAffordableInstallment,
      available_installment: availableInstallment,
      estimated_installment: estimatedInstallment,
      estimated_net_pay_after_deduction: estimatedNetPayAfterDeduction,
      active_account_ids: activeAccounts.map((account) => account.id),
      service_months: serviceMonths,
      evaluated_at: new Date().toISOString(),
    };
    return {
      eligible: checks.every((check) => check.passed),
      maximumEligibleAmount,
      maximumAffordableInstallment,
      maximumTermMonths: product.maximumTermMonths,
      minimumAmount: product.minimumAmount,
      maximumAmount: product.maximumAmount,
      minimumTermMonths: product.minimumTermMonths,
      minimumServiceMonths: product.minimumServiceMonths,
      requiredDocumentTypes: requiredDocumentTypes(
        {
          requiredDocumentTypes: product.requiredDocumentTypes ?? [],
          policyConfiguration: policy,
        },
        requestedAmount,
      ),
      requiredGuarantorCount: requiredGuarantorCount(product),
      interestMethod: product.interestMethod,
      annualInterestRate: product.annualInterestRate,
      estimatedInstallment,
      estimatedNetPayAfterDeduction,
      availableInstallment,
      existingInstallments,
      currentExposure: activeAccounts.reduce(
        (sum, account) =>
          EmployeeFinanceMoney.add(sum, account.outstandingTotal),
        '0.00',
      ),
      availableExposure: maximumEligibleAmount,
      checks,
      snapshot,
      snapshotHash: hash(snapshot),
    };
  }

  private estimateInstallment(
    product: EmployeeFinanceProduct,
    requestedAmount?: string,
    requestedTermMonths?: number,
  ) {
    return estimateInstallmentAmount(
      product.interestMethod,
      product.annualInterestRate,
      requestedAmount,
      requestedTermMonths,
    );
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
        (!rule.positionId ||
          rule.positionId === employee.primary_position_id) &&
        (!rule.gradeId || rule.gradeId === employee.grade_id) &&
        (!rule.departmentId ||
          rule.departmentId === employee.primary_department_id) &&
        (!rule.branchId || rule.branchId === employee.primary_branch_id) &&
        (!rule.employmentType ||
          String(rule.employmentType) === String(employee.employment_type)),
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
    const annualRate = new Decimal(args.annualInterestRate || '0');
    if (
      args.method === EmployeeFinanceInterestMethodEnum.ZERO_INTEREST ||
      annualRate.isZero()
    ) {
      return this.equalPrincipalSchedule(principalCents, 0n, term, args);
    }

    const monthlyRate = annualRate.div(100).div(12);

    if (args.method === EmployeeFinanceInterestMethodEnum.FLAT_RATE) {
      const interest = EmployeeFinanceMoney.toCents(
        EmployeeFinanceMoney.multiply(
          args.principal,
          monthlyRate.times(term).toString(),
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
          monthlyRate.toString(),
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
  private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>;

  constructor(
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
  ) {
    this.ledgerRepository = ledgerRepository;
  }

  findByIdempotencyKey(companyId: number, idempotencyKey: string) {
    return this.ledgerRepository.findOne({
      where: { companyId, idempotencyKey },
    });
  }

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
    reversesEntryId?: number | null;
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
    const nextTotal = EmployeeFinanceMoney.add(
      nextPrincipal,
      nextInterest,
      nextFees,
    );
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
        reversesEntryId: args.reversesEntryId ?? null,
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

  /**
   * Loans disbursed before interest accrual was introduced never had their
   * contractual interest booked, so interest repayments drove the interest
   * balance negative. Books the original schedule's interest once; returns
   * the entry when one was posted.
   */
  async ensureInterestAccrued(companyId: number, accountId: number) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId },
    });
    if (
      !account ||
      EmployeeFinanceMoney.toCents(account.interestAmount) <= 0n
    ) {
      return null;
    }
    const entries = await this.ledgerRepository.find({
      where: { companyId, accountId },
      order: { id: 'ASC' },
    });
    const disbursement = entries.find(
      (entry) =>
        entry.entryType ===
        EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_DISBURSEMENT,
    );
    if (
      !disbursement ||
      entries.some(
        (entry) =>
          entry.entryType ===
          EmployeeFinanceLedgerEntryTypeEnum.INTEREST_ACCRUAL,
      )
    ) {
      return null;
    }
    return this.post({
      companyId,
      accountId,
      entryType: EmployeeFinanceLedgerEntryTypeEnum.INTEREST_ACCRUAL,
      direction: 'DEBIT',
      interestAmount: account.interestAmount,
      effectiveDate: disbursement.effectiveDate,
      sourceType: 'BACKFILL',
      sourceId: String(account.id),
      idempotencyKey: `interest-accrual:${account.id}:v1`,
      description: 'Backfilled contractual interest not booked at disbursement',
    });
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
    @InjectRepository(EmployeeFinanceDisbursement)
    private readonly disbursementRepository: Repository<EmployeeFinanceDisbursement>,
    @InjectRepository(EmployeeFinanceRepayment)
    private readonly repaymentRepository: Repository<EmployeeFinanceRepayment>,
    @InjectRepository(EmployeeFinanceDefermentRequest)
    private readonly defermentRepository: Repository<EmployeeFinanceDefermentRequest>,
    @InjectRepository(EmployeeFinanceReschedule)
    private readonly rescheduleRepository: Repository<EmployeeFinanceReschedule>,
    @InjectRepository(EmployeeFinanceSettlementQuote)
    private readonly settlementQuoteRepository: Repository<EmployeeFinanceSettlementQuote>,
    @Optional()
    private readonly eligibilityService?: EmployeeFinanceEligibilityService,
  ) {}

  async createFromApplication(actor: AuthenticatedUser, applicationId: number) {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId, companyId: actor.companyId! },
    });
    if (!application)
      throw new NotFoundException('Finance application not found.');
    if (
      application.status !==
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE
    ) {
      throw new ConflictException(
        'Application must be ready for employee acceptance.',
      );
    }
    const existing = await this.accountRepository.findOne({
      where: {
        applicationId: application.id,
        companyId: application.companyId,
      },
    });
    if (existing) return existing;
    const approvedAmount =
      application.approvedAmount ?? application.requestedAmount;
    const term =
      application.approvedTermMonths ?? application.requestedTermMonths;
    const product = application.productSnapshot as unknown as {
      interestMethod: EmployeeFinanceInterestMethodEnum;
      annualInterestRate: string;
    };
    if (this.eligibilityService) {
      const eligibility = await this.eligibilityService.evaluateEligibility(
        application.companyId,
        application.employeeId,
        application.productSnapshot as unknown as EmployeeFinanceProduct,
        approvedAmount,
        term,
      );
      if (!eligibility.eligible) {
        throw new BadRequestException({
          message:
            'Approved loan terms no longer meet the configured eligibility policy.',
          eligibility,
        });
      }
    }
    const repaymentDay = this.configService.get<number>(
      'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY',
      28,
    );
    const firstRepaymentDate = addMonths(todayString(), 1, repaymentDay);
    const schedule = this.interestService.calculateSchedule({
      principal: approvedAmount,
      annualInterestRate:
        application.approvedInterestRate ?? product.annualInterestRate ?? '0',
      termMonths: term,
      method:
        product.interestMethod ??
        EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
      firstRepaymentDate,
      repaymentDay,
    });
    const interestTotal = schedule.reduce(
      (sum, item) => EmployeeFinanceMoney.add(sum, item.interest_due),
      '0.00',
    );
    // The processing fee is collected with the first instalment through
    // payroll rather than netted off the disbursement.
    const processingFee = processingFeeFor(
      recordValue(application.productSnapshot),
      approvedAmount,
    );
    if (schedule[0] && EmployeeFinanceMoney.toCents(processingFee) > 0n) {
      schedule[0].fee_due = processingFee;
      schedule[0].total_due = EmployeeFinanceMoney.add(
        schedule[0].total_due,
        processingFee,
      );
    }
    const totalPayable = EmployeeFinanceMoney.add(
      approvedAmount,
      interestTotal,
      processingFee,
    );
    const regularInstallment =
      schedule[schedule.length > 1 ? 1 : 0]?.total_due ?? totalPayable;
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
        feeAmount: processingFee,
        totalPayable,
        outstandingPrincipal: '0.00',
        outstandingInterest: '0.00',
        outstandingFees: '0.00',
        outstandingTotal: '0.00',
        scheduledMonthlyInstallment: regularInstallment,
        termMonths: term,
        interestRate:
          application.approvedInterestRate ?? product.annualInterestRate ?? '0',
        firstRepaymentDate,
        maturityDate:
          schedule[schedule.length - 1]?.due_date ?? firstRepaymentDate,
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
          originalDueDate: item.due_date,
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

  listMine(actor: AuthenticatedUser) {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
    return this.accountRepository.find({
      where: { companyId: actor.companyId!, employeeId: actor.employeeId },
      order: { id: 'DESC' },
    });
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
    const [
      installments,
      ledger,
      disbursements,
      repayments,
      deferments,
      reschedules,
      settlementQuotes,
    ] = await Promise.all([
      this.installmentRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { installmentNumber: 'ASC' },
      }),
      this.ledgerRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { effectiveDate: 'ASC', id: 'ASC' },
      }),
      this.disbursementRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { id: 'DESC' },
      }),
      this.repaymentRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { paymentDate: 'DESC', id: 'DESC' },
      }),
      this.defermentRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { id: 'DESC' },
      }),
      this.rescheduleRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { id: 'DESC' },
      }),
      this.settlementQuoteRepository.find({
        where: { companyId: account.companyId, accountId: account.id },
        order: { id: 'DESC' },
      }),
    ]);
    return {
      account,
      installments,
      ledger,
      disbursements,
      repayments,
      deferments,
      reschedules,
      settlementQuotes,
    };
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
    @InjectRepository(EmployeeFinanceApplicationGuarantor)
    private readonly guarantorRepository: Repository<EmployeeFinanceApplicationGuarantor>,
    @InjectRepository(EmployeeFinanceSanctionLetter)
    private readonly sanctionLetterRepository: Repository<EmployeeFinanceSanctionLetter>,
    private readonly filesService: FilesService,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
    @Optional()
    private readonly letterTemplateService?: EmployeeFinanceLetterTemplateService,
  ) {}

  async createMine(
    actor: AuthenticatedUser,
    dto: CreateEmployeeFinanceApplicationDto,
  ) {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
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
    const product = await this.productService.getActive(
      companyId,
      dto.product_id,
    );
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
          EmployeeFinanceApplicationStatusEnum.PENDING_MANAGEMENT_APPROVAL,
          EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
          EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
        ]),
      },
    });
    if (
      activeApplications >=
      this.configService.get<number>(
        'EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS',
        1,
      )
    ) {
      throw new ConflictException(
        'Employee already has active finance applications.',
      );
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
    const count = await this.applicationRepository.count({
      where: { companyId },
    });
    const productSnapshot = {
      ...product,
      requiredDocumentTypes: requiredDocumentTypes(
        {
          requiredDocumentTypes: product.requiredDocumentTypes ?? [],
          policyConfiguration: financePolicyConfiguration(product),
        },
        dto.requested_amount,
      ),
      policyConfiguration: financePolicyConfiguration(product),
    };
    const employeeSnapshot = {
      id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      grade_id: employee.grade_id,
      hire_date: employee.hire_date,
    };
    const estimatedInstallment =
      eligibility.estimatedInstallment ??
      EmployeeFinanceMoney.divide(
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
    await this.productService.lockIfUsed(companyId, product.id);
    await this.auditService.log({
      actor,
      action: 'finance.application.created',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: { employee_id: employeeId, product_type: product.productType },
    });
    return application;
  }

  async addDocument(
    actor: AuthenticatedUser,
    id: number,
    dto: CreateEmployeeFinanceApplicationDocumentDto,
  ) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      ![
        EmployeeFinanceApplicationStatusEnum.DRAFT,
        EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(application.status)
    ) {
      throw new ConflictException(
        'Documents can be added only before submission.',
      );
    }
    const document = await this.documentRepository.save(
      this.documentRepository.create({
        companyId: application.companyId,
        applicationId: application.id,
        documentType: dto.document_type.trim().toUpperCase(),
        documentId: dto.document_id ?? null,
        fileUrl: dto.file_url?.trim() ?? null,
        uploadedByCompanyUserId: actor.companyMembershipId ?? actor.id,
        status: 'UPLOADED',
        metadata: dto.metadata ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'finance.application.document_added',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION_DOCUMENT',
      entityId: document.id,
      summary: { application_id: application.id },
    });
    return document;
  }

  async uploadDocument(
    actor: AuthenticatedUser,
    id: number,
    dto: UploadEmployeeFinanceApplicationDocumentDto,
  ) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      ![
        EmployeeFinanceApplicationStatusEnum.DRAFT,
        EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(application.status)
    ) {
      throw new ConflictException(
        'Documents can be uploaded only before submission.',
      );
    }
    const storedFile = await this.filesService.savePrivateBase64File(dto.file, {
      directorySegments: [
        'documents',
        'employee-finance',
        `company-${application.companyId}`,
        `application-${application.id}`,
      ],
      fileNamePrefix: `finance-${application.id}-${dto.document_type.trim().toLowerCase()}`,
      allowedMimeTypes: EMPLOYEE_FINANCE_DOCUMENT_MIME_TYPES,
      maxFileSizeBytes: EMPLOYEE_FINANCE_DOCUMENT_MAX_BYTES,
      validateFileSignature: true,
    });
    const document = await this.addDocument(actor, id, {
      document_type: dto.document_type,
      file_url: storedFile.publicPath,
      metadata: {
        ...(dto.metadata ?? {}),
        file_name: storedFile.originalFileName,
        file_type: storedFile.mimeType,
        file_size: storedFile.fileSize,
        expires_on: dto.expires_on ?? null,
        storage: 'managed-private',
      },
    });
    return {
      ...document,
      fileUrl: this.documentDownloadUrl(application.id, document.id),
      file_url: this.documentDownloadUrl(application.id, document.id),
    };
  }

  async downloadDocument(
    actor: AuthenticatedUser,
    applicationId: number,
    documentId: number,
  ) {
    const application = await this.getAccessibleApplication(
      actor,
      applicationId,
    );
    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        companyId: application.companyId,
        applicationId: application.id,
      },
    });
    if (!document) throw new NotFoundException('Finance document not found.');
    const buffer = await this.filesService.readManagedFile(document.fileUrl);
    if (!buffer) {
      throw new NotFoundException('Finance document file was not found.');
    }
    const metadata = recordValue(document.metadata);
    await this.auditService.log({
      actor,
      action: 'finance.application.document_downloaded',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION_DOCUMENT',
      entityId: document.id,
      summary: { application_id: application.id },
    });
    return {
      buffer,
      fileName:
        typeof metadata.file_name === 'string' && metadata.file_name.trim()
          ? metadata.file_name
          : document.fileUrl
            ? basename(document.fileUrl)
            : `finance-document-${document.id}`,
      mimeType:
        typeof metadata.file_type === 'string' && metadata.file_type.trim()
          ? metadata.file_type
          : 'application/octet-stream',
    };
  }

  async listDocuments(actor: AuthenticatedUser, id: number) {
    const application = await this.getAccessibleApplication(actor, id);
    const documents = await this.documentRepository.find({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
      },
      order: { id: 'ASC' },
    });
    return documents.map((document) => ({
      ...document,
      fileUrl: document.fileUrl
        ? this.documentDownloadUrl(application.id, document.id)
        : null,
      file_url: document.fileUrl
        ? this.documentDownloadUrl(application.id, document.id)
        : null,
    }));
  }

  async verifyDocument(
    actor: AuthenticatedUser,
    applicationId: number,
    documentId: number,
    dto: VerifyEmployeeFinanceApplicationDocumentDto,
  ) {
    const application = await this.getAccessibleApplication(
      actor,
      applicationId,
    );
    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        companyId: application.companyId,
        applicationId: application.id,
      },
    });
    if (!document) throw new NotFoundException('Finance document not found.');
    const status = (dto.status ?? 'VERIFIED').trim().toUpperCase();
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      throw new BadRequestException(
        'Document status must be VERIFIED or REJECTED.',
      );
    }
    document.status = status;
    document.verifiedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    document.verifiedAt = new Date();
    document.metadata = {
      ...(document.metadata ?? {}),
      ...(dto.metadata ?? {}),
    };
    await this.auditService.log({
      actor,
      action: 'finance.application.document_verified',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION_DOCUMENT',
      entityId: document.id,
      summary: { status, application_id: application.id },
    });
    return this.documentRepository.save(document);
  }

  async addGuarantor(
    actor: AuthenticatedUser,
    id: number,
    dto: CreateEmployeeFinanceGuarantorDto,
  ) {
    const application = await this.getOwnedApplication(actor, id);
    if (dto.guarantor_employee_id === application.employeeId) {
      throw new BadRequestException(
        'Applicant cannot guarantee their own loan.',
      );
    }
    if (
      ![
        EmployeeFinanceApplicationStatusEnum.DRAFT,
        EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(application.status)
    ) {
      throw new ConflictException(
        'Guarantors can be added only before submission.',
      );
    }
    const guarantor = await this.employeeRepository.findOne({
      where: {
        id: dto.guarantor_employee_id,
        company_id: application.companyId,
      },
    });
    if (!guarantor)
      throw new NotFoundException('Guarantor employee not found.');
    if (guarantor.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can guarantee a staff loan.',
      );
    }
    const existing = await this.guarantorRepository.findOne({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
        guarantorEmployeeId: guarantor.id,
      },
    });
    if (existing) {
      throw new ConflictException(
        'This employee has already been invited as a guarantor.',
      );
    }
    const record = await this.guarantorRepository.save(
      this.guarantorRepository.create({
        companyId: application.companyId,
        applicationId: application.id,
        employeeId: application.employeeId,
        guarantorEmployeeId: guarantor.id,
        status: 'PENDING',
        snapshot: {
          employee_no: guarantor.employee_no,
          full_name: [
            guarantor.first_name,
            guarantor.middle_name,
            guarantor.last_name,
          ]
            .filter(Boolean)
            .join(' '),
        },
      }),
    );
    await this.auditService.log({
      actor,
      action: 'finance.application.guarantor_added',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION_GUARANTOR',
      entityId: record.id,
      summary: { application_id: application.id },
    });
    await this.notifier?.notifyEmployee(application.companyId, guarantor.id, {
      title: 'Guarantor request',
      message: `${textValue(recordValue(application.employeeSnapshot).full_name, 'A colleague')} asked you to guarantee a ${formatMoney(application.requestedAmount)} loan (${application.applicationNo}).`,
      entityType: 'EMPLOYEE_FINANCE_APPLICATION_GUARANTOR',
      entityId: record.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-guarantor:${record.id}`,
    });
    return record;
  }

  async searchGuarantorCandidates(actor: AuthenticatedUser, search: string) {
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee profile is required.');
    }
    const term = search.trim();
    if (term.length < 2) {
      throw new BadRequestException('Search with at least two characters.');
    }
    return this.employeeRepository
      .createQueryBuilder('employee')
      .select([
        'employee.id',
        'employee.employee_no',
        'employee.first_name',
        'employee.middle_name',
        'employee.last_name',
      ])
      .where('employee.company_id = :companyId', {
        companyId: actor.companyId,
      })
      .andWhere('employee.employment_status = :status', {
        status: EmploymentStatusEnum.ACTIVE,
      })
      .andWhere('employee.id <> :employeeId', {
        employeeId: actor.employeeId,
      })
      .andWhere(
        "(employee.employee_no ILIKE :term OR CONCAT_WS(' ', employee.first_name, employee.middle_name, employee.last_name) ILIKE :term)",
        { term: `%${term}%` },
      )
      .orderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.first_name', 'ASC')
      .limit(20)
      .getMany();
  }

  async listGuarantors(actor: AuthenticatedUser, id: number) {
    const application = await this.getAccessibleApplication(actor, id);
    return this.guarantorRepository.find({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
      },
      order: { id: 'ASC' },
    });
  }

  async listMyGuarantorRequests(actor: AuthenticatedUser) {
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee profile is required.');
    }
    const requests = await this.guarantorRepository.find({
      where: {
        companyId: actor.companyId!,
        guarantorEmployeeId: actor.employeeId,
      },
      order: { id: 'DESC' },
    });
    if (requests.length === 0) return requests;
    const applications = await this.applicationRepository.find({
      where: {
        companyId: actor.companyId!,
        id: In(requests.map((request) => request.applicationId)),
      },
      select: ['id', 'applicationNo', 'requestedAmount', 'employeeSnapshot'],
    });
    const applicationById = new Map(
      applications.map((application) => [application.id, application]),
    );
    return requests.map((request) => {
      const application = applicationById.get(request.applicationId);
      const employee = recordValue(application?.employeeSnapshot);
      return {
        ...request,
        applicationNo: application?.applicationNo ?? null,
        requestedAmount: application?.requestedAmount ?? null,
        applicantName: textValue(employee.full_name, 'Employee'),
      };
    });
  }

  async decideGuarantor(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideEmployeeFinanceGuarantorDto,
  ) {
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee profile is required.');
    }
    const guarantor = await this.guarantorRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!guarantor) throw new NotFoundException('Guarantor request not found.');
    if (actor.employeeId !== guarantor.guarantorEmployeeId) {
      throw new ForbiddenException(
        'Only the guarantor can decide this request.',
      );
    }
    const decision = dto.decision.trim().toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED.');
    }
    guarantor.status = decision;
    guarantor.comments = dto.comments?.trim() ?? null;
    guarantor.decidedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    guarantor.decidedAt = new Date();
    await this.auditService.log({
      actor,
      action: 'finance.application.guarantor_decided',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION_GUARANTOR',
      entityId: guarantor.id,
      summary: { decision, application_id: guarantor.applicationId },
    });
    return this.guarantorRepository.save(guarantor);
  }

  async getSanctionLetter(actor: AuthenticatedUser, id: number) {
    const application = await this.getAccessibleApplication(actor, id);
    return this.sanctionLetterRepository.findOne({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
      },
    });
  }

  async getSanctionLetterPdf(actor: AuthenticatedUser, id: number) {
    const letter = await this.getSanctionLetter(actor, id);
    if (!letter) {
      throw new NotFoundException(
        'The sanction letter is issued after final approval.',
      );
    }
    if (!this.letterTemplateService) {
      throw new ConflictException('Letter rendering is not available.');
    }
    const buffer = await this.letterTemplateService.renderSanctionPdf(letter);
    await this.auditService.log({
      actor,
      action: 'finance.application.sanction_letter_downloaded',
      entityType: 'EMPLOYEE_FINANCE_SANCTION_LETTER',
      entityId: letter.id,
      summary: { application_id: letter.applicationId },
    });
    return { buffer, fileName: `${letter.letterNo}.pdf` };
  }

  /** Lets the employee correct a draft or a returned application. */
  async updateMine(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateEmployeeFinanceApplicationDto,
  ) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      ![
        EmployeeFinanceApplicationStatusEnum.DRAFT,
        EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(application.status)
    ) {
      throw new ConflictException(
        'Only draft or returned applications can be changed.',
      );
    }
    const amount = dto.requested_amount ?? application.requestedAmount;
    const term = dto.requested_term_months ?? application.requestedTermMonths;
    const product = await this.productService.getActive(
      application.companyId,
      application.productId,
    );
    const eligibility = await this.eligibilityService.evaluateEligibility(
      application.companyId,
      application.employeeId,
      product,
      amount,
      term,
    );
    if (!eligibility.eligible) {
      throw new BadRequestException({
        message: 'Employee is not eligible for these terms.',
        eligibility,
      });
    }
    const productSnapshot = {
      ...product,
      requiredDocumentTypes: requiredDocumentTypes(
        {
          requiredDocumentTypes: product.requiredDocumentTypes ?? [],
          policyConfiguration: financePolicyConfiguration(product),
        },
        amount,
      ),
      policyConfiguration: financePolicyConfiguration(product),
    };
    application.requestedAmount = amount;
    application.requestedTermMonths = term;
    if (dto.purpose?.trim()) application.purpose = dto.purpose.trim();
    application.eligibilitySnapshot = eligibility;
    application.eligibilitySnapshotHash = eligibility.snapshotHash;
    application.productSnapshot = productSnapshot;
    application.productSnapshotHash = hash(productSnapshot);
    application.estimatedInstallment =
      eligibility.estimatedInstallment ??
      EmployeeFinanceMoney.divide(amount, term);
    application.approvedAmount = null;
    application.approvedTermMonths = null;
    await this.auditService.log({
      actor,
      action: 'finance.application.updated',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: { requested_amount: amount, requested_term_months: term },
    });
    return this.applicationRepository.save(application);
  }

  async submitMine(actor: AuthenticatedUser, id: number) {
    const application = await this.getOwnedApplication(actor, id);
    const resubmission =
      application.status ===
      EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION;
    if (
      application.status !== EmployeeFinanceApplicationStatusEnum.DRAFT &&
      !resubmission
    ) {
      throw new ConflictException(
        'Only draft or returned applications can be submitted.',
      );
    }
    await this.assertApplicationReadyForSubmit(application);
    const route = resolveApprovalRoute(
      recordValue(application.productSnapshot),
      application.requestedAmount,
      {
        manager: this.configService.get<boolean>(
          'EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION',
          true,
        ),
        hr: this.configService.get<boolean>(
          'EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL',
          true,
        ),
        finance: this.configService.get<boolean>(
          'EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL',
          true,
        ),
      },
    );
    application.approvalRoute = route;
    if (resubmission) {
      // A new cycle keeps earlier decisions as history and lets every
      // stage decide again on the corrected application.
      application.approvalCycle = (application.approvalCycle ?? 1) + 1;
    }
    application.status = EMPLOYEE_FINANCE_STAGE_STATUS[route[0]];
    application.submittedAt = new Date();
    application.stageEnteredAt = new Date();
    application.lastRemindedAt = null;
    application.escalationLevel = 0;
    application.decisionComments = null;
    await this.auditService.log({
      actor,
      action: resubmission
        ? 'finance.application.resubmitted'
        : 'finance.application.submitted',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: {
        approval_route: route,
        approval_cycle: application.approvalCycle,
      },
    });
    const saved = await this.applicationRepository.save(application);
    await this.notifier?.notifyStageApprovers(saved, route[0], {
      title: 'Loan application awaiting your decision',
      message: `${textValue(recordValue(saved.employeeSnapshot).full_name, 'An employee')} applied for ${saved.requestedAmount} (${saved.applicationNo}).`,
      dedupeKey: `ef-stage:${saved.id}:${saved.approvalCycle}:${route[0]}`,
    });
    await this.notifier?.notifyEmployee(saved.companyId, saved.employeeId, {
      title: resubmission
        ? 'Loan application resubmitted'
        : 'Loan application received',
      message: `${saved.applicationNo} for ${formatMoney(saved.requestedAmount)} is with ${route[0].toLowerCase()} review. Approval route: ${route.map((stage) => stage.toLowerCase()).join(' → ')}.`,
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: saved.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-submitted:${saved.id}:${saved.approvalCycle}`,
    });
    return saved;
  }

  async acceptMine(actor: AuthenticatedUser, id: number) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      application.status !==
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE
    ) {
      throw new ConflictException(
        'Application is not awaiting employee acceptance.',
      );
    }
    const account = await this.accountService.createFromApplication(
      actor,
      application.id,
    );
    const letter = await this.sanctionLetterRepository.findOne({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
      },
    });
    if (letter && !letter.acceptedAt) {
      letter.acceptedAt = new Date();
      letter.acceptedByCompanyUserId = actor.companyMembershipId ?? actor.id;
      letter.accountId = account.id;
      await this.sanctionLetterRepository.save(letter);
    }
    await this.auditService.log({
      actor,
      action: 'finance.application.accepted',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: {
        account_id: account.id,
        sanction_letter_id: letter?.id ?? null,
      },
    });
    return account;
  }

  async withdrawMine(actor: AuthenticatedUser, id: number) {
    const application = await this.getOwnedApplication(actor, id);
    if (
      ![
        EmployeeFinanceApplicationStatusEnum.DRAFT,
        EmployeeFinanceApplicationStatusEnum.SUBMITTED,
        EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
        EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
        EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
        EmployeeFinanceApplicationStatusEnum.PENDING_MANAGEMENT_APPROVAL,
        EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
        EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION,
      ].includes(application.status)
    ) {
      throw new ConflictException(
        'Only applications that are still in progress can be withdrawn.',
      );
    }
    application.status = EmployeeFinanceApplicationStatusEnum.WITHDRAWN;
    await this.auditService.log({
      actor,
      action: 'finance.application.withdrawn',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
    });
    return this.applicationRepository.save(application);
  }

  listMine(actor: AuthenticatedUser) {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
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
    return this.getAccessibleApplication(actor, id);
  }

  private async getAccessibleApplication(actor: AuthenticatedUser, id: number) {
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!application)
      throw new NotFoundException('Finance application not found.');
    if (actor.employeeId && actor.employeeId !== application.employeeId) {
      await this.hrAccessService.assertCanAccessEmployee(actor, {
        id: application.employeeId,
        company_id: application.companyId,
      } as Employee);
    }
    return application;
  }

  private async getOwnedApplication(actor: AuthenticatedUser, id: number) {
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId!, employeeId: actor.employeeId },
    });
    if (!application)
      throw new NotFoundException('Finance application not found.');
    return application;
  }

  private async assertApplicationReadyForSubmit(
    application: EmployeeFinanceApplication,
  ) {
    const productSnapshot = recordValue(application.productSnapshot);
    const requiredDocuments = requiredDocumentTypes(
      productSnapshot,
      application.requestedAmount,
    );
    const requiredGuarantors = requiredGuarantorCount(productSnapshot);
    const [documents, guarantors] = await Promise.all([
      this.documentRepository.find({
        where: {
          companyId: application.companyId,
          applicationId: application.id,
        },
      }),
      this.guarantorRepository.find({
        where: {
          companyId: application.companyId,
          applicationId: application.id,
        },
      }),
    ]);
    const uploadedTypes = new Set(
      documents
        .filter((document) => document.status !== 'REJECTED')
        .map((document) => document.documentType.trim().toUpperCase()),
    );
    const missingDocuments = requiredDocuments.filter(
      (documentType) => !uploadedTypes.has(documentType),
    );
    const activeGuarantors = guarantors.filter(
      (guarantor) => guarantor.status !== 'REJECTED',
    );
    const uploadedGuarantorFormIds = new Set(
      documents
        .filter((document) => document.status !== 'REJECTED')
        .map(guarantorEmployeeIdFromDocument)
        .filter((employeeId): employeeId is number => employeeId !== null),
    );
    const missingGuarantorForms = requiredDocuments.includes('GUARANTOR_FORM')
      ? activeGuarantors
          .map((guarantor) => guarantor.guarantorEmployeeId)
          .filter((employeeId) => !uploadedGuarantorFormIds.has(employeeId))
      : [];
    const missingGuarantors = Math.max(
      0,
      requiredGuarantors - activeGuarantors.length,
    );
    if (
      missingDocuments.length > 0 ||
      missingGuarantors > 0 ||
      missingGuarantorForms.length > 0
    ) {
      throw new BadRequestException({
        message: 'Finance application is missing required supporting records.',
        missing_documents: missingDocuments,
        missing_guarantors: missingGuarantors,
        missing_guarantor_forms_for_employee_ids: missingGuarantorForms,
      });
    }
  }

  private documentDownloadUrl(applicationId: number, documentId: number) {
    return `/api/employee-finance/applications/${applicationId}/documents/${documentId}/download`;
  }
}

@Injectable()
export class EmployeeFinanceApprovalService {
  private readonly logger = new Logger(EmployeeFinanceApprovalService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: EmployeeFinanceAuditService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
    private readonly notificationQueueService: NotificationQueueService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceApplicationApproval)
    private readonly approvalRepository: Repository<EmployeeFinanceApplicationApproval>,
    @InjectRepository(EmployeeFinanceApplicationDocument)
    private readonly documentRepository: Repository<EmployeeFinanceApplicationDocument>,
    @InjectRepository(EmployeeFinanceApplicationGuarantor)
    private readonly guarantorRepository: Repository<EmployeeFinanceApplicationGuarantor>,
    @InjectRepository(EmployeeFinanceSanctionLetter)
    private readonly sanctionLetterRepository: Repository<EmployeeFinanceSanctionLetter>,
    @Optional()
    private readonly interestService?: EmployeeFinanceInterestService,
    @Optional()
    private readonly letterTemplateService?: EmployeeFinanceLetterTemplateService,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
    @Optional()
    private readonly delegationService?: EmployeeFinanceDelegationService,
    @Optional()
    private readonly directory?: EmployeeFinancePermissionDirectoryService,
    @Optional()
    private readonly eligibilityService?: EmployeeFinanceEligibilityService,
  ) {}

  approve(
    actor: AuthenticatedUser,
    id: number,
    dto: ApproveEmployeeFinanceApplicationDto,
  ) {
    return this.approveAs(actor, actor, id, dto, false);
  }

  /** Rejects the application or returns it to the employee for correction. */
  async decide(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideEmployeeFinanceApplicationDto,
  ) {
    if (
      !isRoutableStage(dto.stage) ||
      !hasPermission(
        actor.permissions,
        EMPLOYEE_FINANCE_STAGE_PERMISSION[dto.stage],
      )
    ) {
      throw new ForbiddenException(
        'You do not have permission to decide this approval stage.',
      );
    }
    return this.decideAs(actor, actor, id, dto, false);
  }

  /** Every decision on the application across all approval cycles. */
  async listApprovals(actor: AuthenticatedUser, id: number) {
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!application)
      throw new NotFoundException('Finance application not found.');
    if (actor.employeeId && actor.employeeId !== application.employeeId) {
      await this.hrAccessService.assertCanAccessEmployee(actor, {
        id: application.employeeId,
        company_id: application.companyId,
      } as Employee);
    }
    const approvals = await this.approvalRepository.find({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
      },
      order: { id: 'ASC' },
    });
    return {
      approval_route: this.routeFor(application),
      approval_cycle: application.approvalCycle ?? 1,
      current_stage: stageForStatus(application.status),
      stage_entered_at: application.stageEnteredAt,
      escalation_level: application.escalationLevel ?? 0,
      decision_comments: application.decisionComments,
      approvals,
    };
  }

  /**
   * Lets a delegate decide a stage for an absent approver. The decision is
   * checked against the delegator's permissions and data scope, and the
   * approval record names both people.
   */
  async delegatedDecision(
    actor: AuthenticatedUser,
    id: number,
    dto: DelegatedEmployeeFinanceDecisionDto,
  ) {
    if (!this.delegationService || !this.directory) {
      throw new ConflictException('Approval delegation is not available.');
    }
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!application)
      throw new NotFoundException('Finance application not found.');
    const stage = stageForStatus(application.status);
    if (!stage || stage !== dto.stage) {
      throw new ConflictException(
        'Application is not waiting for this approval stage.',
      );
    }
    const delegations = (
      await this.delegationService.findActive(
        application.companyId,
        actor.companyMembershipId ?? actor.id,
        stage,
      )
    ).filter((item) => !dto.delegation_id || item.id === dto.delegation_id);
    let authority: AuthenticatedUser | null = null;
    for (const delegation of delegations) {
      const candidate = await this.directory.actorForMembership(
        application.companyId,
        delegation.delegatorCompanyUserId,
      );
      if (
        !candidate ||
        !hasPermission(
          candidate.permissions,
          EMPLOYEE_FINANCE_STAGE_PERMISSION[stage],
        )
      ) {
        continue;
      }
      if (stage === EmployeeFinanceApprovalStageEnum.MANAGER) {
        const employee = await this.employeeRepository.findOne({
          where: {
            id: application.employeeId,
            company_id: application.companyId,
          },
        });
        if (!employee) continue;
        try {
          await this.hrAccessService.assertCanAccessEmployee(
            candidate,
            employee,
          );
        } catch {
          continue;
        }
      }
      authority = candidate;
      break;
    }
    if (!authority) {
      throw new ForbiddenException(
        'No active delegation lets you decide this stage for this application.',
      );
    }
    if (dto.decision === EmployeeFinanceDecisionEnum.APPROVED) {
      if (!dto.snapshot_hash) {
        throw new BadRequestException('snapshot_hash is required to approve.');
      }
      return this.approveAs(
        authority,
        actor,
        id,
        {
          stage,
          snapshot_hash: dto.snapshot_hash,
          approved_amount: dto.approved_amount,
          approved_term_months: dto.approved_term_months,
          comments: dto.comments,
        },
        true,
      );
    }
    return this.decideAs(
      authority,
      actor,
      id,
      {
        stage,
        decision: dto.decision,
        comments: dto.comments ?? '',
      },
      true,
    );
  }

  /** The application's approval stages, falling back to the legacy flags. */
  private routeFor(application: EmployeeFinanceApplication) {
    const stored = Array.isArray(application.approvalRoute)
      ? application.approvalRoute.filter(isRoutableStage)
      : [];
    if (stored.length) return stored;
    return resolveApprovalRoute({}, application.requestedAmount, {
      manager: this.configService.get<boolean>(
        'EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION',
        true,
      ),
      hr: this.configService.get<boolean>(
        'EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL',
        true,
      ),
      finance: this.configService.get<boolean>(
        'EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL',
        true,
      ),
    });
  }

  private async loadPending(
    actor: AuthenticatedUser,
    id: number,
    stage: EmployeeFinanceApprovalStageEnum,
  ) {
    const application = await this.applicationRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!application)
      throw new NotFoundException('Finance application not found.');
    const expected = stageForStatus(application.status);
    const route = this.routeFor(application);
    if (!expected || expected !== stage || !route.includes(expected)) {
      throw new ConflictException(
        'Application is not waiting for this approval stage.',
      );
    }
    return { application, route, stage: expected };
  }

  private async assertAuthority(
    authority: AuthenticatedUser,
    performer: AuthenticatedUser,
    application: EmployeeFinanceApplication,
    stage: EmployeeFinanceRoutableStage,
    delegated: boolean,
  ) {
    if (
      performer.employeeId === application.employeeId ||
      authority.employeeId === application.employeeId
    ) {
      throw new ForbiddenException(
        'Employee cannot approve their own finance application.',
      );
    }
    if (
      delegated &&
      !hasPermission(
        authority.permissions,
        EMPLOYEE_FINANCE_STAGE_PERMISSION[stage],
      )
    ) {
      throw new ForbiddenException(
        'The delegating approver no longer holds this approval permission.',
      );
    }
    if (stage === EmployeeFinanceApprovalStageEnum.MANAGER) {
      const employee = await this.employeeRepository.findOne({
        where: {
          id: application.employeeId,
          company_id: application.companyId,
        },
      });
      if (!employee) throw new NotFoundException('Employee not found.');
      await this.hrAccessService.assertCanAccessEmployee(authority, employee);
    }
    if (
      this.configService.get<boolean>(
        'EMPLOYEE_FINANCE_REQUIRE_DISTINCT_APPROVERS',
        true,
      )
    ) {
      const people = Array.from(
        new Set([
          performer.companyMembershipId ?? performer.id,
          authority.companyMembershipId ?? authority.id,
        ]),
      );
      const cycle = application.approvalCycle ?? 1;
      const priorApprovals = await this.approvalRepository.find({
        where: [
          {
            companyId: application.companyId,
            applicationId: application.id,
            approvalCycle: cycle,
            createdByCompanyUserId: In(people),
          },
          {
            companyId: application.companyId,
            applicationId: application.id,
            approvalCycle: cycle,
            onBehalfOfCompanyUserId: In(people),
          },
        ],
      });
      if (priorApprovals.length) {
        throw new ForbiddenException(
          'Finance approver cannot approve multiple stages for the same application.',
        );
      }
    }
  }

  private async approveAs(
    authority: AuthenticatedUser,
    performer: AuthenticatedUser,
    id: number,
    dto: ApproveEmployeeFinanceApplicationDto,
    delegated: boolean,
  ) {
    const { application, route, stage } = await this.loadPending(
      performer,
      id,
      dto.stage,
    );
    const currentHash = hash({
      requested_amount: application.requestedAmount,
      requested_term_months: application.requestedTermMonths,
      eligibility_hash: application.eligibilitySnapshotHash,
      product_hash: application.productSnapshotHash,
    });
    if (
      dto.snapshot_hash !== currentHash &&
      dto.snapshot_hash !== application.eligibilitySnapshotHash
    ) {
      throw new ConflictException(
        'Approval hash must match the current application snapshot.',
      );
    }
    await this.assertAuthority(
      authority,
      performer,
      application,
      stage,
      delegated,
    );
    const product = recordValue(application.productSnapshot);
    if (dto.approved_amount) {
      const approvedCents = EmployeeFinanceMoney.toCents(dto.approved_amount);
      if (
        approvedCents <= 0n ||
        approvedCents >
          EmployeeFinanceMoney.toCents(application.requestedAmount)
      ) {
        throw new BadRequestException(
          'Approved amount must be above zero and no more than the requested amount.',
        );
      }
      application.approvedAmount = dto.approved_amount;
    }
    if (dto.approved_term_months) {
      const minimumTerm = numberFromPolicy(product.minimumTermMonths) || 1;
      const maximumTerm =
        numberFromPolicy(product.maximumTermMonths) || dto.approved_term_months;
      if (
        dto.approved_term_months < minimumTerm ||
        dto.approved_term_months > maximumTerm
      ) {
        throw new BadRequestException(
          `Approved term must be between ${minimumTerm} and ${maximumTerm} months.`,
        );
      }
      application.approvedTermMonths = dto.approved_term_months;
    }
    const stageIndex = route.indexOf(stage);
    const isFinal = stageIndex === route.length - 1;
    if (isFinal) {
      await this.assertFinalApprovalSupportReady(application);
    }
    const annualInterestRate = product.annualInterestRate ?? '0';
    application.approvedInterestRate =
      application.approvedInterestRate ??
      (typeof annualInterestRate === 'string' ||
      typeof annualInterestRate === 'number'
        ? String(annualInterestRate)
        : '0');
    const amount = application.approvedAmount ?? application.requestedAmount;
    const term =
      application.approvedTermMonths ?? application.requestedTermMonths;
    application.estimatedInstallment =
      estimateInstallmentAmount(
        product.interestMethod as string,
        application.approvedInterestRate,
        amount,
        term,
      ) ?? EmployeeFinanceMoney.divide(amount, term);
    let finalEligibility: unknown;
    if (isFinal && this.eligibilityService) {
      const result = await this.eligibilityService.evaluateEligibility(
        application.companyId,
        application.employeeId,
        application.productSnapshot as unknown as EmployeeFinanceProduct,
        amount,
        term,
      );
      if (!result.eligible) {
        throw new BadRequestException({
          message:
            'Final approved loan terms do not meet the configured eligibility policy.',
          eligibility: result,
        });
      }
      finalEligibility = result;
    }
    const performerId = performer.companyMembershipId ?? performer.id;
    const authorityId = authority.companyMembershipId ?? authority.id;
    await this.approvalRepository.save(
      this.approvalRepository.create({
        companyId: application.companyId,
        applicationId: application.id,
        stage,
        decision:
          stage === EmployeeFinanceApprovalStageEnum.MANAGER
            ? EmployeeFinanceDecisionEnum.RECOMMENDED
            : EmployeeFinanceDecisionEnum.APPROVED,
        snapshotHash: dto.snapshot_hash,
        approvedAmount: application.approvedAmount,
        approvedTermMonths: application.approvedTermMonths,
        createdByCompanyUserId: performerId,
        onBehalfOfCompanyUserId:
          authorityId !== performerId ? authorityId : null,
        approvalCycle: application.approvalCycle ?? 1,
        comments: dto.comments ?? null,
      }),
    );
    const nextStage = isFinal ? null : route[stageIndex + 1];
    application.status = nextStage
      ? EMPLOYEE_FINANCE_STAGE_STATUS[nextStage]
      : EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE;
    application.stageEnteredAt = new Date();
    application.lastRemindedAt = null;
    application.escalationLevel = 0;
    if (isFinal) application.approvedAt = new Date();
    await this.auditService.log({
      actor: performer,
      action:
        stage === EmployeeFinanceApprovalStageEnum.MANAGER
          ? 'finance.application.recommended'
          : stage === EmployeeFinanceApprovalStageEnum.HR
            ? 'finance.application.hr_approved'
            : stage === EmployeeFinanceApprovalStageEnum.MANAGEMENT
              ? 'finance.application.management_approved'
              : 'finance.application.finance_approved',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: {
        stage,
        approval_cycle: application.approvalCycle ?? 1,
        on_behalf_of: authorityId !== performerId ? authorityId : null,
        ...(finalEligibility ? { final_eligibility: finalEligibility } : {}),
      },
    });
    const saved = await this.applicationRepository.save(application);

    if (
      saved.status ===
      EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE
    ) {
      await this.generateSanctionLetter(performer, saved);
      void this.notificationQueueService.enqueueSmsConfiguredNotification({
        code: 'employee_finance.application.approved',
        module: 'employee-finance',
        recipientEmployeeId: saved.employeeId,
        relatedEntityType: 'EMPLOYEE_FINANCE_APPLICATION',
        relatedEntityId: saved.id,
        actor: performer,
        variables: {
          application_no: saved.applicationNo,
          product_type: saved.productType,
        },
      });
      await this.notifier?.notifyEmployee(saved.companyId, saved.employeeId, {
        title: 'Loan approved: please review and accept',
        message: `Your application ${saved.applicationNo} was approved for ${amount}. Open the sanction letter and accept it to proceed.`,
        entityType: 'EMPLOYEE_FINANCE_APPLICATION',
        entityId: saved.id,
        actionUrl: '/dashboard/me/finance',
        dedupeKey: `ef-approved:${saved.id}:${saved.approvalCycle}`,
      });
    } else if (nextStage) {
      await this.notifier?.notifyStageApprovers(saved, nextStage, {
        title: 'Loan application awaiting your decision',
        message: `${saved.applicationNo} for ${amount} passed ${stage.toLowerCase()} review and needs your decision.`,
        dedupeKey: `ef-stage:${saved.id}:${saved.approvalCycle}:${nextStage}`,
      });
    }

    return saved;
  }

  private async decideAs(
    authority: AuthenticatedUser,
    performer: AuthenticatedUser,
    id: number,
    dto: DecideEmployeeFinanceApplicationDto,
    delegated: boolean,
  ) {
    if (
      ![
        EmployeeFinanceDecisionEnum.REJECTED,
        EmployeeFinanceDecisionEnum.RETURNED,
      ].includes(dto.decision)
    ) {
      throw new BadRequestException('Decision must be REJECTED or RETURNED.');
    }
    const comments = dto.comments?.trim() ?? '';
    if (comments.length < 3) {
      throw new BadRequestException(
        'Give the employee a reason for this decision.',
      );
    }
    const { application, stage } = await this.loadPending(
      performer,
      id,
      dto.stage,
    );
    await this.assertAuthority(
      authority,
      performer,
      application,
      stage,
      delegated,
    );
    const performerId = performer.companyMembershipId ?? performer.id;
    const authorityId = authority.companyMembershipId ?? authority.id;
    await this.approvalRepository.save(
      this.approvalRepository.create({
        companyId: application.companyId,
        applicationId: application.id,
        stage,
        decision: dto.decision,
        snapshotHash: application.eligibilitySnapshotHash,
        approvedAmount: null,
        approvedTermMonths: null,
        createdByCompanyUserId: performerId,
        onBehalfOfCompanyUserId:
          authorityId !== performerId ? authorityId : null,
        approvalCycle: application.approvalCycle ?? 1,
        comments,
      }),
    );
    const returned = dto.decision === EmployeeFinanceDecisionEnum.RETURNED;
    application.status = returned
      ? EmployeeFinanceApplicationStatusEnum.RETURNED_FOR_CORRECTION
      : EmployeeFinanceApplicationStatusEnum.REJECTED;
    application.decisionComments = comments;
    application.approvedAmount = null;
    application.approvedTermMonths = null;
    application.stageEnteredAt = new Date();
    await this.auditService.log({
      actor: performer,
      action: returned
        ? 'finance.application.returned'
        : 'finance.application.rejected',
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: application.id,
      summary: {
        stage,
        comments,
        approval_cycle: application.approvalCycle ?? 1,
        on_behalf_of: authorityId !== performerId ? authorityId : null,
      },
    });
    const saved = await this.applicationRepository.save(application);
    await this.notifier?.notifyEmployee(saved.companyId, saved.employeeId, {
      title: returned
        ? 'Loan application returned for correction'
        : 'Loan application declined',
      message: returned
        ? `${saved.applicationNo} needs changes before it can continue: ${comments}`
        : `${saved.applicationNo} was declined at ${stage.toLowerCase()} review: ${comments}`,
      entityType: 'EMPLOYEE_FINANCE_APPLICATION',
      entityId: saved.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-decision:${saved.id}:${saved.approvalCycle}:${dto.decision}`,
    });
    return saved;
  }

  private async assertFinalApprovalSupportReady(
    application: EmployeeFinanceApplication,
  ) {
    const productSnapshot = recordValue(application.productSnapshot);
    const requiredDocuments = requiredDocumentTypes(
      productSnapshot,
      application.requestedAmount,
    );
    const requiredGuarantors = requiredGuarantorCount(productSnapshot);
    const [documents, guarantors] = await Promise.all([
      this.documentRepository.find({
        where: {
          companyId: application.companyId,
          applicationId: application.id,
        },
      }),
      this.guarantorRepository.find({
        where: {
          companyId: application.companyId,
          applicationId: application.id,
        },
      }),
    ]);
    const verifiedTypes = new Set(
      documents
        .filter((document) => document.status === 'VERIFIED')
        .map((document) => document.documentType.trim().toUpperCase()),
    );
    const missingVerifiedDocuments = requiredDocuments.filter(
      (documentType) => !verifiedTypes.has(documentType),
    );
    const approvedGuarantors = guarantors.filter(
      (guarantor) => guarantor.status === 'APPROVED',
    );
    const verifiedGuarantorFormIds = new Set(
      documents
        .filter((document) => document.status === 'VERIFIED')
        .map(guarantorEmployeeIdFromDocument)
        .filter((employeeId): employeeId is number => employeeId !== null),
    );
    const missingVerifiedGuarantorForms = requiredDocuments.includes(
      'GUARANTOR_FORM',
    )
      ? guarantors
          .filter((guarantor) => guarantor.status !== 'REJECTED')
          .map((guarantor) => guarantor.guarantorEmployeeId)
          .filter((employeeId) => !verifiedGuarantorFormIds.has(employeeId))
      : [];
    const missingApprovedGuarantors = Math.max(
      0,
      requiredGuarantors - approvedGuarantors.length,
    );
    if (
      missingVerifiedDocuments.length > 0 ||
      missingApprovedGuarantors > 0 ||
      missingVerifiedGuarantorForms.length > 0
    ) {
      throw new BadRequestException({
        message: 'Required loan documents or guarantors are not complete.',
        missing_verified_documents: missingVerifiedDocuments,
        missing_approved_guarantors: missingApprovedGuarantors,
        missing_verified_guarantor_forms_for_employee_ids:
          missingVerifiedGuarantorForms,
      });
    }
  }

  private async generateSanctionLetter(
    actor: AuthenticatedUser,
    application: EmployeeFinanceApplication,
  ) {
    const existing = await this.sanctionLetterRepository.findOne({
      where: {
        companyId: application.companyId,
        applicationId: application.id,
      },
    });
    if (existing) {
      application.sanctionDocumentId = existing.id;
      await this.applicationRepository.save(application);
      return existing;
    }
    const amount = application.approvedAmount ?? application.requestedAmount;
    const term =
      application.approvedTermMonths ?? application.requestedTermMonths;
    const rate = application.approvedInterestRate ?? '0';
    const product = recordValue(application.productSnapshot);
    const employee = recordValue(application.employeeSnapshot);
    const employeeName =
      typeof employee.full_name === 'string' && employee.full_name.trim()
        ? employee.full_name
        : String(application.employeeId);
    const employeeNo =
      typeof employee.employee_no === 'string' && employee.employee_no.trim()
        ? employee.employee_no
        : String(application.employeeId);
    const productName =
      typeof product.name === 'string' && product.name.trim()
        ? product.name
        : application.productType;
    const method =
      (product.interestMethod as EmployeeFinanceInterestMethodEnum) ??
      EmployeeFinanceInterestMethodEnum.ZERO_INTEREST;
    const fee = processingFeeFor(product, amount);
    let monthlyInstallment = application.estimatedInstallment ?? '0.00';
    let totalPayable = EmployeeFinanceMoney.add(amount, fee);
    if (this.interestService) {
      const repaymentDay = this.configService.get<number>(
        'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY',
        28,
      );
      const schedule = this.interestService.calculateSchedule({
        principal: amount,
        annualInterestRate: rate,
        termMonths: term,
        method,
        firstRepaymentDate: addMonths(todayString(), 1, repaymentDay),
        repaymentDay,
      });
      monthlyInstallment = schedule[0]?.total_due ?? monthlyInstallment;
      totalPayable = EmployeeFinanceMoney.add(
        amount,
        fee,
        ...schedule.map((item) => item.interest_due),
      );
    }
    const template = await this.letterTemplateService?.getSanctionTemplate(
      application.companyId,
    );
    const letterNo = `EFS-${application.companyId}-${String(application.id).padStart(6, '0')}`;
    const issueDate = todayString();
    const values: Record<string, string> = {
      company_name: actor.companyName ?? 'the company',
      employee_name: employeeName,
      employee_no: employeeNo,
      application_no: application.applicationNo,
      letter_no: letterNo,
      product_name: productName,
      product_type: application.productType,
      approved_amount: formatMoney(amount),
      term_months: String(term),
      interest_rate: String(rate),
      interest_method: interestMethodLabel(method),
      monthly_installment: formatMoney(monthlyInstallment),
      total_payable: formatMoney(totalPayable),
      issue_date: issueDate,
    };
    const content = fillTemplate(
      template?.body ?? DEFAULT_SANCTION_LETTER_BODY,
      values,
    );
    const snapshot = {
      application_id: application.id,
      application_no: application.applicationNo,
      employee,
      product_type: application.productType,
      product_name: productName,
      approved_amount: amount,
      approved_term_months: term,
      approved_interest_rate: rate,
      processing_fee: fee,
      estimated_installment: monthlyInstallment,
      total_payable: totalPayable,
      company_name: values.company_name,
      issue_date: issueDate,
      template: template
        ? {
            id: template.id,
            version: template.version,
            letterhead: template.letterhead,
            signatory_name: template.signatoryName,
            signatory_title: template.signatoryTitle,
          }
        : null,
      generated_at: new Date().toISOString(),
    };
    const letter = await this.sanctionLetterRepository.save(
      this.sanctionLetterRepository.create({
        companyId: application.companyId,
        applicationId: application.id,
        accountId: null,
        letterNo,
        content,
        snapshot,
        snapshotHash: hash(snapshot),
        templateId: template?.id ?? null,
        generatedByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    application.sanctionDocumentId = letter.id;
    await this.applicationRepository.save(application);
    await this.auditService.log({
      actor,
      action: 'finance.application.sanction_letter_generated',
      entityType: 'EMPLOYEE_FINANCE_SANCTION_LETTER',
      entityId: letter.id,
      summary: {
        application_id: application.id,
        template_id: template?.id ?? null,
      },
    });
    return letter;
  }
}

@Injectable()
export class EmployeeFinanceDisbursementService {
  private readonly logger = new Logger(EmployeeFinanceDisbursementService.name);

  constructor(
    private readonly ledgerService: EmployeeFinanceLedgerService,
    private readonly auditService: EmployeeFinanceAuditService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
    private readonly notificationQueueService: NotificationQueueService,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceDisbursement)
    private readonly repository: Repository<EmployeeFinanceDisbursement>,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreateEmployeeFinanceDisbursementDto,
  ) {
    const account = await this.accountRepository.findOne({
      where: { id: dto.account_id, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (
      account.status !== EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT
    ) {
      throw new ConflictException('Account is not pending disbursement.');
    }
    if (
      EmployeeFinanceMoney.toCents(dto.amount) !==
      EmployeeFinanceMoney.toCents(account.principalAmount)
    ) {
      throw new BadRequestException(
        `Disburse the full approved principal of ${account.principalAmount}.`,
      );
    }
    if (!dto.payment_reference?.trim()) {
      throw new BadRequestException('A bank payment reference is required.');
    }
    const open = await this.repository.count({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: In([
          EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL,
          EmployeeFinanceDisbursementStatusEnum.APPROVED,
          EmployeeFinanceDisbursementStatusEnum.CONFIRMED,
        ]),
      },
    });
    if (open > 0) {
      throw new ConflictException(
        'This account already has a disbursement in progress.',
      );
    }
    return this.repository.save(
      this.repository.create({
        companyId: account.companyId,
        accountId: account.id,
        amount: dto.amount,
        paymentReference: dto.payment_reference.trim(),
        paymentDate: dto.payment_date,
        status: EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const item = await this.repository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!item) throw new NotFoundException('Disbursement not found.');
    if (
      item.status !== EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL
    ) {
      throw new ConflictException(
        'Only disbursements awaiting approval can be approved.',
      );
    }
    if (
      item.createdByCompanyUserId === (actor.companyMembershipId ?? actor.id)
    ) {
      throw new ForbiddenException('Disbursement maker cannot approve it.');
    }
    item.status = EmployeeFinanceDisbursementStatusEnum.APPROVED;
    item.approvedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    await this.auditService.log({
      actor,
      action: 'finance.disbursement.approved',
      entityType: 'EMPLOYEE_FINANCE_DISBURSEMENT',
      entityId: item.id,
    });
    return this.repository.save(item);
  }

  /** Cancels a disbursement that has not been confirmed as paid. */
  async cancel(actor: AuthenticatedUser, id: number, reason?: string) {
    const item = await this.repository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!item) throw new NotFoundException('Disbursement not found.');
    if (
      ![
        EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL,
        EmployeeFinanceDisbursementStatusEnum.APPROVED,
      ].includes(item.status)
    ) {
      throw new ConflictException(
        'Only unconfirmed disbursements can be cancelled.',
      );
    }
    item.status = EmployeeFinanceDisbursementStatusEnum.CANCELLED;
    await this.auditService.log({
      actor,
      action: 'finance.disbursement.cancelled',
      entityType: 'EMPLOYEE_FINANCE_DISBURSEMENT',
      entityId: item.id,
      summary: { reason: reason?.trim() || null },
    });
    return this.repository.save(item);
  }

  async confirm(actor: AuthenticatedUser, id: number) {
    const item = await this.repository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!item) throw new NotFoundException('Disbursement not found.');
    if (item.status === EmployeeFinanceDisbursementStatusEnum.CONFIRMED)
      return item;
    if (item.status !== EmployeeFinanceDisbursementStatusEnum.APPROVED) {
      throw new ConflictException(
        'Only approved disbursements can be confirmed.',
      );
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
    // Contractual interest and the processing fee become receivable once
    // the money is paid out; repayments then reduce these balances.
    if (EmployeeFinanceMoney.toCents(account.interestAmount) > 0n) {
      await this.ledgerService.post({
        companyId: item.companyId,
        accountId: item.accountId,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.INTEREST_ACCRUAL,
        direction: 'DEBIT',
        interestAmount: account.interestAmount,
        effectiveDate: item.paymentDate,
        sourceType: 'DISBURSEMENT',
        sourceId: String(item.id),
        idempotencyKey: `interest-accrual:${account.id}:v${account.scheduleVersion}`,
        postedByCompanyUserId: actor.companyMembershipId ?? actor.id,
        description: 'Contractual interest for the repayment schedule',
      });
    }
    if (EmployeeFinanceMoney.toCents(account.feeAmount) > 0n) {
      await this.ledgerService.post({
        companyId: item.companyId,
        accountId: item.accountId,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.PROCESSING_FEE,
        direction: 'DEBIT',
        feeAmount: account.feeAmount,
        effectiveDate: item.paymentDate,
        sourceType: 'DISBURSEMENT',
        sourceId: String(item.id),
        idempotencyKey: `processing-fee:${account.id}`,
        postedByCompanyUserId: actor.companyMembershipId ?? actor.id,
        description: 'Loan processing fee',
      });
    }
    item.status = EmployeeFinanceDisbursementStatusEnum.CONFIRMED;
    item.confirmedAt = new Date();
    await this.accountRepository.update(
      { id: account.id, companyId: account.companyId },
      {
        status: EmployeeFinanceAccountStatusEnum.ACTIVE,
        disbursedAt: new Date(),
      },
    );
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
    const saved = await this.repository.save(item);
    const application = await this.applicationRepository.findOne({
      where: { id: account.applicationId, companyId: account.companyId },
    });

    void this.notificationQueueService.enqueueSmsConfiguredNotification({
      code: 'employee_finance.disbursement.confirmed',
      module: 'employee-finance',
      recipientEmployeeId: account.employeeId,
      relatedEntityType: 'EMPLOYEE_FINANCE_DISBURSEMENT',
      relatedEntityId: saved.id,
      actor,
      variables: {
        application_no: application?.applicationNo ?? account.accountNo,
        product_type: account.productType,
      },
    });
    await this.notifier?.notifyEmployee(account.companyId, account.employeeId, {
      title: 'Loan disbursed',
      message: `${item.amount} for ${account.accountNo} was paid on ${item.paymentDate} (reference ${item.paymentReference}). Repayments start ${account.firstRepaymentDate} through payroll.`,
      entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
      entityId: account.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-disbursed:${item.id}`,
    });

    return saved;
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
    @Optional()
    private readonly accountStatusService?: EmployeeFinanceAccountStatusService,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
  ) {}

  async generateForPeriod(companyId: number, payrollPeriodId: number) {
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
      // An instruction from an earlier period that payroll never picked up
      // is superseded by this one, so the instalment is collected once.
      await this.instructionRepository.update(
        {
          companyId,
          installmentId: installment.id,
          status: EmployeeFinancePayrollInstructionStatusEnum.OPEN,
          payrollRunId: IsNull(),
        },
        {
          status: EmployeeFinancePayrollInstructionStatusEnum.CANCELLED,
          resolution: 'SUPERSEDED',
        },
      );
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
              account.productType ===
              EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
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

  async reserveForPayrollRun(
    companyId: number,
    payrollPeriodId: number,
    payrollRunId: number,
    employeeId: number,
  ) {
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
      if (
        instruction.payrollRunId &&
        instruction.payrollRunId !== payrollRunId
      ) {
        throw new ConflictException(
          'Payroll instruction is already reserved by another run.',
        );
      }
      instruction.payrollRunId = payrollRunId;
      instruction.reservedAmount = instruction.amount;
      instruction.status = EmployeeFinancePayrollInstructionStatusEnum.RESERVED;
      await this.instructionRepository.save(instruction);
    }
    return instructions;
  }

  async setReservedAmount(
    instruction: EmployeeFinancePayrollInstruction,
    reservedAmount: string,
  ) {
    const deferredAmount = EmployeeFinanceMoney.subtract(
      instruction.amount,
      reservedAmount,
    );
    instruction.reservedAmount = reservedAmount;
    instruction.status = EmployeeFinancePayrollInstructionStatusEnum.RESERVED;
    instruction.snapshot = {
      ...(instruction.snapshot ?? {}),
      requested_amount: instruction.amount,
      reserved_amount: reservedAmount,
      deferred_amount: deferredAmount,
      deduction_shortfall: EmployeeFinanceMoney.toCents(deferredAmount) > 0n,
    };
    return this.instructionRepository.save(instruction);
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
      if (EmployeeFinanceMoney.toCents(instruction.reservedAmount) <= 0n) {
        instruction.status =
          EmployeeFinancePayrollInstructionStatusEnum.SHORTFALL;
        await this.instructionRepository.save(instruction);
        continue;
      }
      await this.postPayrollInstruction(instruction);
    }
  }

  /** Reverses posted loan deductions when Finance reverses a payroll run. */
  async reversePayrollRun(companyId: number, payrollRunId: number) {
    const instructions = await this.instructionRepository.find({
      where: {
        companyId,
        payrollRunId,
        status: EmployeeFinancePayrollInstructionStatusEnum.POSTED,
      },
      order: { id: 'ASC' },
    });
    const today = todayString();
    for (const instruction of instructions) {
      const original = await this.ledgerService.findByIdempotencyKey(
        companyId,
        `payroll:${payrollRunId}:${instruction.id}`,
      );
      if (!original) continue;
      const reversalKey = `payroll-reversal:${payrollRunId}:${instruction.id}`;
      const reversed = await this.ledgerService.findByIdempotencyKey(
        companyId,
        reversalKey,
      );
      if (reversed) continue;
      const balance = await this.ledgerService.calculateBalance(
        companyId,
        instruction.accountId,
      );
      const principal = EmployeeFinanceMoney.toCents(original.principalAmount);
      const interest = EmployeeFinanceMoney.toCents(original.interestAmount);
      const fees = EmployeeFinanceMoney.toCents(original.feeAmount);
      if (
        EmployeeFinanceMoney.toCents(balance.principal) < principal ||
        EmployeeFinanceMoney.toCents(balance.interest) < interest ||
        EmployeeFinanceMoney.toCents(balance.fees) < fees
      ) {
        throw new ConflictException(
          'Payroll deduction cannot be reversed because later repayments or adjustments have used the balance. Reconcile the loan manually.',
        );
      }
      await this.ledgerService.post({
        companyId,
        accountId: instruction.accountId,
        installmentId: original.installmentId,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.REVERSAL,
        direction: 'DEBIT',
        principalAmount: original.principalAmount,
        interestAmount: original.interestAmount,
        feeAmount: original.feeAmount,
        effectiveDate: today,
        sourceType: 'PAYROLL_REVERSAL',
        sourceId: String(payrollRunId),
        idempotencyKey: reversalKey,
        reversesEntryId: original.id,
        description: `Reversal of payroll deduction ledger entry ${original.id}`,
      });
      if (original.installmentId) {
        const installment = await this.installmentRepository.findOne({
          where: {
            id: original.installmentId,
            companyId,
            accountId: instruction.accountId,
          },
        });
        if (installment) {
          installment.paidAmount = EmployeeFinanceMoney.subtract(
            installment.paidAmount,
            original.totalAmount,
          );
          installment.status =
            EmployeeFinanceMoney.toCents(installment.paidAmount) <= 0n
              ? EmployeeFinanceInstallmentStatusEnum.SCHEDULED
              : EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID;
          await this.installmentRepository.save(installment);
        }
      }
      instruction.status =
        EmployeeFinancePayrollInstructionStatusEnum.CANCELLED;
      instruction.resolution = 'PAYROLL_REVERSED';
      await this.instructionRepository.save(instruction);
      await this.accountStatusService?.refresh(
        companyId,
        instruction.accountId,
      );
    }
    return { reversed_count: instructions.length };
  }

  private async postPayrollInstruction(
    instruction: EmployeeFinancePayrollInstruction,
  ) {
    const currentInstruction = await this.instructionRepository.findOne({
      where: {
        id: instruction.id,
        companyId: instruction.companyId,
      },
    });
    if (
      currentInstruction?.status ===
      EmployeeFinancePayrollInstructionStatusEnum.POSTED
    ) {
      return currentInstruction;
    }
    const installment = await this.installmentRepository.findOne({
      where: {
        id: instruction.installmentId,
        companyId: instruction.companyId,
        accountId: instruction.accountId,
      },
    });
    if (!installment)
      throw new NotFoundException('Finance installment not found.');
    // The deduction targets this instalment first. If a direct repayment
    // already reduced it, the rest moves on to the next instalments instead
    // of being booked twice against the same fee and interest.
    const laterInstallments = (
      await this.installmentRepository.find({
        where: {
          companyId: instruction.companyId,
          accountId: instruction.accountId,
          status: In(OPEN_INSTALLMENT_STATUSES),
        },
        order: { dueDate: 'ASC', id: 'ASC' },
      })
    ).filter((item) => item.id !== installment.id);
    const allocation = allocateCreditToInstallments(
      [installment, ...laterInstallments],
      EmployeeFinanceMoney.toCents(instruction.reservedAmount),
    );
    const appliedCents =
      allocation.totals.fee +
      allocation.totals.interest +
      allocation.totals.principal;
    if (appliedCents > 0n) {
      await this.ledgerService.post({
        companyId: instruction.companyId,
        accountId: instruction.accountId,
        installmentId: instruction.installmentId,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
        direction: 'CREDIT',
        principalAmount: EmployeeFinanceMoney.fromCents(
          allocation.totals.principal,
        ),
        interestAmount: EmployeeFinanceMoney.fromCents(
          allocation.totals.interest,
        ),
        feeAmount: EmployeeFinanceMoney.fromCents(allocation.totals.fee),
        effectiveDate: todayString(),
        sourceType: 'PAYROLL',
        sourceId: String(instruction.payrollRunId),
        idempotencyKey: `payroll:${instruction.payrollRunId}:${instruction.id}`,
      });
    }
    await this.installmentRepository.save(
      allocation.allocations.map((item) => item.installment),
    );
    instruction.postedAmount = EmployeeFinanceMoney.fromCents(appliedCents);
    instruction.status = EmployeeFinancePayrollInstructionStatusEnum.POSTED;
    if (allocation.unapplied > 0n) {
      // Payroll deducted more than the loan still owed; Finance must refund.
      instruction.snapshot = {
        ...(instruction.snapshot ?? {}),
        overcollected_amount: EmployeeFinanceMoney.fromCents(
          allocation.unapplied,
        ),
      };
    }
    await this.instructionRepository.save(instruction);
    await this.accountStatusService?.refresh(
      instruction.companyId,
      instruction.accountId,
    );
    if (appliedCents > 0n) {
      const account = await this.accountRepository.findOne({
        where: { id: instruction.accountId, companyId: instruction.companyId },
      });
      await this.notifier?.notifyEmployee(
        instruction.companyId,
        instruction.employeeId,
        {
          title: 'Loan instalment deducted',
          message: `${formatMoney(EmployeeFinanceMoney.fromCents(appliedCents))} was deducted from your salary for ${account?.accountNo ?? 'your loan'}. Remaining balance: ${formatMoney(account?.outstandingTotal ?? '0')}.`,
          entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
          entityId: instruction.accountId,
          actionUrl: '/dashboard/me/finance',
          dedupeKey: `ef-deducted:${instruction.id}`,
        },
      );
    }
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
    @Optional()
    @InjectRepository(EmployeeFinanceSettlementQuote)
    private readonly quoteRepository?: Repository<EmployeeFinanceSettlementQuote>,
    @Optional()
    private readonly auditService?: EmployeeFinanceAuditService,
    @Optional()
    private readonly accountStatusService?: EmployeeFinanceAccountStatusService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreateEmployeeFinanceRepaymentDto,
  ) {
    const account = await this.accountRepository.findOne({
      where: { id: dto.account_id, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (!SERVICEABLE_ACCOUNT_STATUSES.includes(account.status)) {
      throw new ConflictException(
        `Repayments cannot be recorded on a ${account.status.toLowerCase()} account.`,
      );
    }
    const repaymentType = (dto.repayment_type ?? 'DIRECT_REPAYMENT')
      .trim()
      .toUpperCase();
    if (!['DIRECT_REPAYMENT', 'ADDITIONAL_REPAYMENT'].includes(repaymentType)) {
      throw new BadRequestException(
        'Repayment type must be DIRECT_REPAYMENT or ADDITIONAL_REPAYMENT; use a settlement quote to settle early.',
      );
    }
    if (
      repaymentType === 'ADDITIONAL_REPAYMENT' &&
      recordValue(account.productSnapshot).allowAdditionalRepayment === false
    ) {
      throw new ConflictException(
        'This product does not allow additional repayments.',
      );
    }
    const amountCents = EmployeeFinanceMoney.toCents(dto.amount);
    if (amountCents <= 0n) {
      throw new BadRequestException('Repayment amount must be above zero.');
    }
    if (amountCents > EmployeeFinanceMoney.toCents(account.outstandingTotal)) {
      throw new BadRequestException(
        `Repayment exceeds the outstanding balance of ${account.outstandingTotal}.`,
      );
    }
    const reference = dto.payment_reference?.trim() || null;
    if (reference) {
      const duplicate = await this.repaymentRepository.count({
        where: { companyId: account.companyId, paymentReference: reference },
      });
      if (duplicate > 0) {
        throw new ConflictException(
          `Payment reference ${reference} is already recorded.`,
        );
      }
    }
    const repayment = await this.repaymentRepository.save(
      this.repaymentRepository.create({
        status: EmployeeFinanceRepaymentStatusEnum.DRAFT,
        companyId: account.companyId,
        accountId: account.id,
        repaymentType,
        amount: EmployeeFinanceMoney.fromCents(amountCents),
        paymentReference: reference,
        paymentDate: dto.payment_date,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.auditService?.log({
      actor,
      action: 'finance.repayment.recorded',
      entityType: 'EMPLOYEE_FINANCE_REPAYMENT',
      entityId: repayment.id,
      summary: { account_id: account.id, amount: repayment.amount },
    });
    return repayment;
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const repayment = await this.repaymentRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!repayment) throw new NotFoundException('Repayment not found.');
    if (
      ![
        EmployeeFinanceRepaymentStatusEnum.DRAFT,
        EmployeeFinanceRepaymentStatusEnum.APPROVED,
      ].includes(repayment.status)
    ) {
      throw new ConflictException('This repayment is already posted.');
    }
    if (
      repayment.createdByCompanyUserId ===
      (actor.companyMembershipId ?? actor.id)
    ) {
      throw new ForbiddenException('Repayment maker cannot approve it.');
    }
    repayment.status = EmployeeFinanceRepaymentStatusEnum.APPROVED;
    repayment.approvedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    await this.postRepayment(repayment);
    const saved = await this.repaymentRepository.save(repayment);
    await this.auditService?.log({
      actor,
      action: 'finance.repayment.posted',
      entityType: 'EMPLOYEE_FINANCE_REPAYMENT',
      entityId: saved.id,
      summary: { account_id: saved.accountId, amount: saved.amount },
    });
    await this.accountStatusService?.refresh(saved.companyId, saved.accountId);
    return saved;
  }

  private async postRepayment(repayment: EmployeeFinanceRepayment) {
    if (repayment.status === EmployeeFinanceRepaymentStatusEnum.POSTED)
      return repayment;
    const quote =
      repayment.repaymentType === 'SETTLEMENT_REPAYMENT' && this.quoteRepository
        ? await this.quoteRepository.findOne({
            where: {
              companyId: repayment.companyId,
              repaymentId: repayment.id,
            },
          })
        : null;
    if (quote) {
      await rebateUnearnedInterest({
        ledgerService: this.ledgerService,
        installmentRepository: this.installmentRepository,
        companyId: repayment.companyId,
        accountId: repayment.accountId,
        asOf: textValue(
          recordValue(quote.snapshot).as_of,
          repayment.paymentDate,
        ),
        idempotencyKey: `settlement:${quote.id}:rebate`,
        sourceType: 'SETTLEMENT_QUOTE',
        sourceId: String(quote.id),
      });
    }
    const installments = await this.installmentRepository.find({
      where: {
        companyId: repayment.companyId,
        accountId: repayment.accountId,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    const allocation = allocateCreditToInstallments(
      installments,
      EmployeeFinanceMoney.toCents(repayment.amount),
    );
    if (allocation.unapplied > 0n) {
      throw new BadRequestException(
        `Repayment exceeds what is owed by ${EmployeeFinanceMoney.fromCents(allocation.unapplied)}.`,
      );
    }
    await this.installmentRepository.save(
      allocation.allocations.map((item) => item.installment),
    );
    await this.allocationRepository.save(
      allocation.allocations.map((item) =>
        this.allocationRepository.create({
          companyId: repayment.companyId,
          repaymentId: repayment.id,
          installmentId: item.installment.id,
          principalAmount: EmployeeFinanceMoney.fromCents(item.principal),
          interestAmount: EmployeeFinanceMoney.fromCents(item.interest),
          feeAmount: EmployeeFinanceMoney.fromCents(item.fee),
        }),
      ),
    );
    await this.ledgerService.post({
      companyId: repayment.companyId,
      accountId: repayment.accountId,
      entryType:
        repayment.repaymentType === 'ADDITIONAL_REPAYMENT'
          ? EmployeeFinanceLedgerEntryTypeEnum.ADDITIONAL_REPAYMENT
          : repayment.repaymentType === 'SETTLEMENT_REPAYMENT'
            ? EmployeeFinanceLedgerEntryTypeEnum.SETTLEMENT_REPAYMENT
            : EmployeeFinanceLedgerEntryTypeEnum.DIRECT_REPAYMENT,
      direction: 'CREDIT',
      principalAmount: EmployeeFinanceMoney.fromCents(
        allocation.totals.principal,
      ),
      interestAmount: EmployeeFinanceMoney.fromCents(
        allocation.totals.interest,
      ),
      feeAmount: EmployeeFinanceMoney.fromCents(allocation.totals.fee),
      effectiveDate: repayment.paymentDate,
      sourceType: 'REPAYMENT',
      sourceId: String(repayment.id),
      idempotencyKey: `repayment:${repayment.id}`,
      postedByCompanyUserId: repayment.approvedByCompanyUserId,
    });
    if (quote && this.quoteRepository) {
      quote.status = 'SETTLED';
      quote.settledAt = new Date();
      await this.quoteRepository.save(quote);
    }
    repayment.status = EmployeeFinanceRepaymentStatusEnum.POSTED;
    return repayment;
  }
}

/** Accounts that are being repaid and can take repayments or restructures. */
const SERVICEABLE_ACCOUNT_STATUSES = [
  EmployeeFinanceAccountStatusEnum.ACTIVE,
  EmployeeFinanceAccountStatusEnum.IN_ARREARS,
  EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
  EmployeeFinanceAccountStatusEnum.DEFERRED,
  EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY,
];

/**
 * Removes interest scheduled after `asOf` from the schedule and books an
 * INTEREST_WAIVER for it, so an early payoff only pays interest earned to
 * date. Idempotent through the ledger key.
 */
async function rebateUnearnedInterest(args: {
  ledgerService: EmployeeFinanceLedgerService;
  installmentRepository: Repository<EmployeeFinanceInstallment>;
  companyId: number;
  accountId: number;
  asOf: string;
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
}) {
  const balance = await args.ledgerService.calculateBalance(
    args.companyId,
    args.accountId,
  );
  const interestBalance = EmployeeFinanceMoney.toCents(balance.interest);
  if (interestBalance <= 0n) return 0n;
  const installments = await args.installmentRepository.find({
    where: {
      companyId: args.companyId,
      accountId: args.accountId,
      status: In(OPEN_INSTALLMENT_STATUSES),
    },
    order: { dueDate: 'ASC', id: 'ASC' },
  });
  let budget = interestBalance;
  let rebated = 0n;
  const changed: EmployeeFinanceInstallment[] = [];
  for (const installment of installments) {
    if (installment.dueDate <= args.asOf || budget <= 0n) continue;
    const unearned = installmentRemainder(installment).interest;
    const cut = unearned < budget ? unearned : budget;
    if (cut <= 0n) continue;
    installment.interestDue = EmployeeFinanceMoney.fromCents(
      EmployeeFinanceMoney.toCents(installment.interestDue) - cut,
    );
    installment.totalDue = EmployeeFinanceMoney.fromCents(
      EmployeeFinanceMoney.toCents(installment.totalDue) - cut,
    );
    if (
      EmployeeFinanceMoney.toCents(installment.paidAmount) >=
      EmployeeFinanceMoney.toCents(installment.totalDue)
    ) {
      installment.status = EmployeeFinanceInstallmentStatusEnum.PAID;
    }
    budget -= cut;
    rebated += cut;
    changed.push(installment);
  }
  if (rebated <= 0n) return 0n;
  await args.installmentRepository.save(changed);
  await args.ledgerService.post({
    companyId: args.companyId,
    accountId: args.accountId,
    entryType: EmployeeFinanceLedgerEntryTypeEnum.INTEREST_WAIVER,
    direction: 'CREDIT',
    interestAmount: EmployeeFinanceMoney.fromCents(rebated),
    effectiveDate: args.asOf,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    idempotencyKey: args.idempotencyKey,
    description: 'Rebate of interest not yet earned',
  });
  return rebated;
}

/** Pay-off figures: balance owed today less interest not yet earned. */
export function settlementFigures(
  installments: EmployeeFinanceInstallment[],
  balance: { principal: string; interest: string; fees: string; total: string },
  asOf: string,
) {
  const interestBalance = EmployeeFinanceMoney.toCents(balance.interest);
  const unearned = unearnedInterestCents(installments, asOf);
  const rebate =
    interestBalance > 0n
      ? unearned < interestBalance
        ? unearned
        : interestBalance
      : 0n;
  const total = EmployeeFinanceMoney.toCents(balance.total) - rebate;
  return {
    as_of: asOf,
    outstanding_principal: balance.principal,
    outstanding_interest: EmployeeFinanceMoney.fromCents(
      interestBalance - rebate,
    ),
    outstanding_fees: balance.fees,
    unearned_interest_rebate: EmployeeFinanceMoney.fromCents(rebate),
    ledger_balance: balance.total,
    settlement_amount: EmployeeFinanceMoney.fromCents(total > 0n ? total : 0n),
  };
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
    @Optional()
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository?: Repository<EmployeeFinanceInstallment>,
    @Optional()
    @InjectRepository(EmployeeFinanceRepayment)
    private readonly repaymentRepository?: Repository<EmployeeFinanceRepayment>,
    @Optional()
    private readonly auditService?: EmployeeFinanceAuditService,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
  ) {}

  async quote(actor: AuthenticatedUser, accountId: number) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (!SERVICEABLE_ACCOUNT_STATUSES.includes(account.status)) {
      throw new ConflictException(
        `A ${account.status.toLowerCase()} account cannot be settled early.`,
      );
    }
    if (recordValue(account.productSnapshot).allowEarlySettlement === false) {
      throw new ConflictException(
        'This product does not allow early settlement.',
      );
    }
    await this.ledgerService.ensureInterestAccrued(
      account.companyId,
      account.id,
    );
    const balance = await this.ledgerService.calculateBalance(
      account.companyId,
      account.id,
    );
    const installments = this.installmentRepository
      ? await this.installmentRepository.find({
          where: {
            companyId: account.companyId,
            accountId: account.id,
            status: In(OPEN_INSTALLMENT_STATUSES),
          },
        })
      : [];
    const figures = settlementFigures(installments, balance, todayString());
    const validDays = this.configService.get<number>(
      'EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS',
      7,
    );
    const validUntil = addDaysString(todayString(), validDays);
    const snapshot = {
      account_id: account.id,
      balance,
      ...figures,
      generated_at: new Date().toISOString(),
    };
    // Earlier open quotes are superseded by the newest figures.
    await this.quoteRepository.update(
      { companyId: account.companyId, accountId: account.id, status: 'OPEN' },
      { status: 'SUPERSEDED' },
    );
    const quote = await this.quoteRepository.save(
      this.quoteRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        quoteNo: `EFQ-${account.companyId}-${account.id}-${Date.now()}`,
        settlementAmount: figures.settlement_amount,
        validUntil,
        snapshot,
        snapshotHash: hash(snapshot),
      }),
    );
    await this.auditService?.log({
      actor,
      action: 'finance.settlement.quoted',
      entityType: 'EMPLOYEE_FINANCE_SETTLEMENT_QUOTE',
      entityId: quote.id,
      summary: { account_id: account.id, amount: quote.settlementAmount },
    });
    await this.notifier?.notifyEmployee(account.companyId, account.employeeId, {
      title: 'Early settlement quote',
      message: `To close ${account.accountNo} early, pay ${formatMoney(quote.settlementAmount)} by ${quote.validUntil}. This already removes ${formatMoney(figures.unearned_interest_rebate)} of interest not yet earned.`,
      entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
      entityId: account.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-quote:${quote.id}`,
    });
    return quote;
  }

  /**
   * Records the employee's payoff against a quote. The resulting repayment
   * still needs a second Finance user to approve it before the loan closes.
   */
  async settle(
    actor: AuthenticatedUser,
    quoteId: number,
    dto: SettleEmployeeFinanceQuoteDto,
  ) {
    if (!this.repaymentRepository || !this.installmentRepository) {
      throw new ConflictException('Early settlement is not available.');
    }
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId, companyId: actor.companyId! },
    });
    if (!quote) throw new NotFoundException('Settlement quote not found.');
    if (quote.status !== 'OPEN') {
      throw new ConflictException(
        `This quote is ${quote.status.toLowerCase()}.`,
      );
    }
    if (quote.validUntil < todayString()) {
      quote.status = 'EXPIRED';
      await this.quoteRepository.save(quote);
      throw new ConflictException('This quote has expired; issue a new one.');
    }
    const account = await this.accountRepository.findOne({
      where: { id: quote.accountId, companyId: quote.companyId },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    const balance = await this.ledgerService.calculateBalance(
      account.companyId,
      account.id,
    );
    const quotedBalance = recordValue(recordValue(quote.snapshot).balance);
    if (
      EmployeeFinanceMoney.toCents(balance.total) !==
      EmployeeFinanceMoney.toCents(textValue(quotedBalance.total))
    ) {
      quote.status = 'SUPERSEDED';
      await this.quoteRepository.save(quote);
      throw new ConflictException(
        'The balance changed since this quote was issued; issue a new quote.',
      );
    }
    const reference = dto.payment_reference.trim();
    if (!reference) {
      throw new BadRequestException('A bank payment reference is required.');
    }
    const duplicate = await this.repaymentRepository.count({
      where: { companyId: quote.companyId, paymentReference: reference },
    });
    if (duplicate > 0) {
      throw new ConflictException(
        `Payment reference ${reference} is already recorded.`,
      );
    }
    const repayment = await this.repaymentRepository.save(
      this.repaymentRepository.create({
        status: EmployeeFinanceRepaymentStatusEnum.DRAFT,
        companyId: quote.companyId,
        accountId: quote.accountId,
        repaymentType: 'SETTLEMENT_REPAYMENT',
        amount: quote.settlementAmount,
        paymentReference: reference,
        paymentDate: dto.payment_date,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    quote.status = 'PENDING_APPROVAL';
    quote.repaymentId = repayment.id;
    await this.quoteRepository.save(quote);
    await this.accountRepository.update(
      { id: account.id, companyId: account.companyId },
      { status: EmployeeFinanceAccountStatusEnum.SETTLEMENT_PENDING },
    );
    await this.auditService?.log({
      actor,
      action: 'finance.settlement.payment_recorded',
      entityType: 'EMPLOYEE_FINANCE_SETTLEMENT_QUOTE',
      entityId: quote.id,
      summary: { repayment_id: repayment.id, amount: repayment.amount },
    });
    return { quote, repayment };
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
    @Optional()
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository?: Repository<EmployeeFinancePayrollInstruction>,
    @Optional()
    private readonly auditService?: EmployeeFinanceAuditService,
    @Optional()
    private readonly accountStatusService?: EmployeeFinanceAccountStatusService,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
  ) {}

  /**
   * Asks to push one instalment to the end of the schedule. Nothing changes
   * until a second Finance user approves the request.
   */
  async request(
    actor: AuthenticatedUser,
    accountId: number,
    dto: RequestEmployeeFinanceDefermentDto,
    options: { selfService?: boolean } = {},
  ) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (options.selfService && account.employeeId !== actor.employeeId) {
      throw new ForbiddenException('You can only defer your own loan.');
    }
    if (
      ![
        EmployeeFinanceAccountStatusEnum.ACTIVE,
        EmployeeFinanceAccountStatusEnum.IN_ARREARS,
        EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
        EmployeeFinanceAccountStatusEnum.DEFERRED,
      ].includes(account.status)
    ) {
      throw new ConflictException(
        `Instalments on a ${account.status.toLowerCase()} account cannot be deferred.`,
      );
    }
    const product = await this.productRepository.findOne({
      where: { id: account.productId, companyId: account.companyId },
    });
    if (!product?.allowDeferment) {
      throw new ConflictException(
        'This product does not allow installment deferment.',
      );
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required.');
    }
    const yearAgo = new Date();
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const recent = await this.defermentRepository.find({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: In([
          EmployeeFinanceRequestStatusEnum.PENDING,
          EmployeeFinanceRequestStatusEnum.APPROVED,
          'APPROVED',
        ]),
      },
    });
    const maxPerYear = this.configService.get<number>(
      'EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR',
      2,
    );
    if (
      recent.filter((item) => new Date(item.createdAt) >= yearAgo).length >=
      maxPerYear
    ) {
      throw new ConflictException(
        `Maximum of ${maxPerYear} deferments in 12 months reached.`,
      );
    }
    const installment = await this.installmentRepository.findOne({
      where: {
        id: dto.installment_id,
        accountId: account.id,
        companyId: account.companyId,
      },
    });
    if (!installment) throw new NotFoundException('Installment not found.');
    if (
      ![
        EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
        EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
        EmployeeFinanceInstallmentStatusEnum.OVERDUE,
      ].includes(installment.status)
    ) {
      throw new ConflictException('Only unpaid instalments can be deferred.');
    }
    if (
      recent.some(
        (item) =>
          item.installmentId === installment.id &&
          item.status === String(EmployeeFinanceRequestStatusEnum.PENDING),
      )
    ) {
      throw new ConflictException(
        'A deferment request for this instalment is already pending.',
      );
    }
    if (this.instructionRepository) {
      const reserved = await this.instructionRepository.count({
        where: {
          companyId: account.companyId,
          installmentId: installment.id,
          status: EmployeeFinancePayrollInstructionStatusEnum.RESERVED,
        },
      });
      if (reserved > 0) {
        throw new ConflictException(
          'This instalment is reserved by a payroll run in progress.',
        );
      }
    }
    const request = await this.defermentRepository.save(
      this.defermentRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        installmentId: installment.id,
        reason: dto.reason.trim(),
        status: EmployeeFinanceRequestStatusEnum.PENDING,
        requestedByCompanyUserId: actor.companyMembershipId ?? actor.id,
        originalDueDate: installment.dueDate,
      }),
    );
    await this.auditService?.log({
      actor,
      action: 'finance.deferment.requested',
      entityType: 'EMPLOYEE_FINANCE_DEFERMENT',
      entityId: request.id,
      summary: { account_id: account.id, installment_id: installment.id },
    });
    return request;
  }

  listPending(actor: AuthenticatedUser) {
    return this.defermentRepository.find({
      where: {
        companyId: actor.companyId!,
        status: EmployeeFinanceRequestStatusEnum.PENDING,
      },
      order: { id: 'ASC' },
    });
  }

  async decide(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideEmployeeFinanceServicingRequestDto,
  ) {
    const request = await this.defermentRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!request) throw new NotFoundException('Deferment request not found.');
    assertDecidable(request, actor, request.requestedByCompanyUserId);
    const approved = dto.decision === EmployeeFinanceRequestStatusEnum.APPROVED;
    if (
      !approved &&
      dto.decision !== EmployeeFinanceRequestStatusEnum.REJECTED
    ) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED.');
    }
    const account = await this.accountRepository.findOne({
      where: { id: request.accountId, companyId: request.companyId },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (approved) {
      const installment = await this.installmentRepository.findOne({
        where: { id: request.installmentId, companyId: request.companyId },
      });
      if (
        !installment ||
        ![
          EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
          EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
          EmployeeFinanceInstallmentStatusEnum.OVERDUE,
        ].includes(installment.status)
      ) {
        throw new ConflictException(
          'The instalment is no longer open, so it cannot be deferred.',
        );
      }
      const schedule = await this.installmentRepository.find({
        where: {
          companyId: account.companyId,
          accountId: account.id,
          scheduleVersion: installment.scheduleVersion,
        },
      });
      const lastDue = schedule
        .filter(
          (item) =>
            item.status !== EmployeeFinanceInstallmentStatusEnum.CANCELLED,
        )
        .reduce(
          (latest, item) => (item.dueDate > latest ? item.dueDate : latest),
          installment.dueDate,
        );
      const repaymentDay = Number(lastDue.slice(8, 10)) || 28;
      const newDueDate = addMonths(lastDue, 1, repaymentDay);
      installment.originalDueDate =
        installment.originalDueDate ?? installment.dueDate;
      installment.dueDate = newDueDate;
      installment.overdueSince = null;
      installment.status =
        EmployeeFinanceMoney.toCents(installment.paidAmount) > 0n
          ? EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID
          : EmployeeFinanceInstallmentStatusEnum.SCHEDULED;
      await this.installmentRepository.save(installment);
      await this.instructionRepository?.update(
        {
          companyId: account.companyId,
          installmentId: installment.id,
          status: EmployeeFinancePayrollInstructionStatusEnum.OPEN,
        },
        {
          status: EmployeeFinancePayrollInstructionStatusEnum.CANCELLED,
          resolution: 'DEFERRED',
        },
      );
      if (newDueDate > account.maturityDate) {
        account.maturityDate = newDueDate;
        await this.accountRepository.update(
          { id: account.id, companyId: account.companyId },
          { maturityDate: newDueDate },
        );
      }
      request.newDueDate = newDueDate;
    }
    request.status = approved
      ? EmployeeFinanceRequestStatusEnum.APPROVED
      : EmployeeFinanceRequestStatusEnum.REJECTED;
    request.decidedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    request.decidedAt = new Date();
    request.decisionComments = dto.comments?.trim() || null;
    const saved = await this.defermentRepository.save(request);
    await this.auditService?.log({
      actor,
      action: approved
        ? 'finance.deferment.approved'
        : 'finance.deferment.rejected',
      entityType: 'EMPLOYEE_FINANCE_DEFERMENT',
      entityId: saved.id,
      summary: {
        account_id: saved.accountId,
        installment_id: saved.installmentId,
        new_due_date: saved.newDueDate,
      },
    });
    await this.accountStatusService?.refresh(account.companyId, account.id);
    await this.notifier?.notifyEmployee(account.companyId, account.employeeId, {
      title: approved ? 'Instalment deferred' : 'Deferment declined',
      message: approved
        ? `The instalment due ${saved.originalDueDate} on ${account.accountNo} now falls due ${saved.newDueDate}.`
        : `Your request to defer the instalment due ${saved.originalDueDate} on ${account.accountNo} was declined.`,
      entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
      entityId: account.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-deferment:${saved.id}`,
    });
    return saved;
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
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    private readonly interestService?: EmployeeFinanceInterestService,
    @Optional()
    private readonly ledgerService?: EmployeeFinanceLedgerService,
    @Optional()
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository?: Repository<EmployeeFinanceInstallment>,
    @Optional()
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository?: Repository<EmployeeFinancePayrollInstruction>,
    @Optional()
    private readonly auditService?: EmployeeFinanceAuditService,
    @Optional()
    private readonly accountStatusService?: EmployeeFinanceAccountStatusService,
    @Optional()
    private readonly notifier?: EmployeeFinanceNotifierService,
  ) {}

  /**
   * Proposes spreading what is still owed over a new term. The approver sees
   * the replacement schedule before anything changes.
   */
  async request(
    actor: AuthenticatedUser,
    accountId: number,
    dto: RequestEmployeeFinanceRescheduleDto,
  ) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, companyId: actor.companyId! },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (
      ![
        EmployeeFinanceAccountStatusEnum.ACTIVE,
        EmployeeFinanceAccountStatusEnum.IN_ARREARS,
        EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
        EmployeeFinanceAccountStatusEnum.DEFERRED,
      ].includes(account.status)
    ) {
      throw new ConflictException(
        `A ${account.status.toLowerCase()} account cannot be rescheduled.`,
      );
    }
    const product = await this.productRepository.findOne({
      where: { id: account.productId, companyId: account.companyId },
    });
    if (!product?.allowRescheduling) {
      throw new ConflictException('This product does not allow rescheduling.');
    }
    if (
      !Number.isInteger(dto.new_term_months) ||
      dto.new_term_months < 1 ||
      dto.new_term_months > product.maximumTermMonths
    ) {
      throw new BadRequestException(
        `New term must be between 1 and ${product.maximumTermMonths} months.`,
      );
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required.');
    }
    const pending = await this.rescheduleRepository.count({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: EmployeeFinanceRequestStatusEnum.PENDING,
      },
    });
    if (pending > 0) {
      throw new ConflictException(
        'A reschedule request for this account is already pending.',
      );
    }
    const preview = await this.buildPreview(account, dto.new_term_months);
    const reschedule = await this.rescheduleRepository.save(
      this.rescheduleRepository.create({
        companyId: account.companyId,
        accountId: account.id,
        oldScheduleVersion: account.scheduleVersion,
        newScheduleVersion: account.scheduleVersion + 1,
        oldTermMonths: account.termMonths,
        newTermMonths: dto.new_term_months,
        reason: dto.reason.trim(),
        status: EmployeeFinanceRequestStatusEnum.PENDING,
        schedulePreview: preview,
        requestedByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.auditService?.log({
      actor,
      action: 'finance.reschedule.requested',
      entityType: 'EMPLOYEE_FINANCE_RESCHEDULE',
      entityId: reschedule.id,
      summary: {
        account_id: account.id,
        new_term_months: dto.new_term_months,
        new_installment: preview.new_installment,
      },
    });
    return reschedule;
  }

  listPending(actor: AuthenticatedUser) {
    return this.rescheduleRepository.find({
      where: {
        companyId: actor.companyId!,
        status: EmployeeFinanceRequestStatusEnum.PENDING,
      },
      order: { id: 'ASC' },
    });
  }

  async decide(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideEmployeeFinanceServicingRequestDto,
  ) {
    const reschedule = await this.rescheduleRepository.findOne({
      where: { id, companyId: actor.companyId! },
    });
    if (!reschedule)
      throw new NotFoundException('Reschedule request not found.');
    assertDecidable(reschedule, actor, reschedule.requestedByCompanyUserId);
    const approved = dto.decision === EmployeeFinanceRequestStatusEnum.APPROVED;
    if (
      !approved &&
      dto.decision !== EmployeeFinanceRequestStatusEnum.REJECTED
    ) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED.');
    }
    const account = await this.accountRepository.findOne({
      where: { id: reschedule.accountId, companyId: reschedule.companyId },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    if (approved) {
      if (account.scheduleVersion !== reschedule.oldScheduleVersion) {
        throw new ConflictException(
          'The schedule changed since this request was raised; ask for a new reschedule.',
        );
      }
      reschedule.schedulePreview = await this.apply(account, reschedule);
    }
    reschedule.status = approved
      ? EmployeeFinanceRequestStatusEnum.APPROVED
      : EmployeeFinanceRequestStatusEnum.REJECTED;
    reschedule.decidedByCompanyUserId = actor.companyMembershipId ?? actor.id;
    reschedule.decidedAt = new Date();
    reschedule.decisionComments = dto.comments?.trim() || null;
    const saved = await this.rescheduleRepository.save(reschedule);
    await this.auditService?.log({
      actor,
      action: approved
        ? 'finance.reschedule.approved'
        : 'finance.reschedule.rejected',
      entityType: 'EMPLOYEE_FINANCE_RESCHEDULE',
      entityId: saved.id,
      summary: {
        account_id: saved.accountId,
        new_term_months: saved.newTermMonths,
      },
    });
    await this.notifier?.notifyEmployee(account.companyId, account.employeeId, {
      title: approved ? 'Loan rescheduled' : 'Reschedule declined',
      message: approved
        ? `${account.accountNo} is now repaid over ${saved.newTermMonths} months at ${textValue(recordValue(saved.schedulePreview).new_installment)} per month.`
        : `The request to reschedule ${account.accountNo} was declined.`,
      entityType: 'EMPLOYEE_FINANCE_ACCOUNT',
      entityId: account.id,
      actionUrl: '/dashboard/me/finance',
      dedupeKey: `ef-reschedule:${saved.id}`,
    });
    return saved;
  }

  private requireServicingDependencies() {
    if (
      !this.interestService ||
      !this.ledgerService ||
      !this.installmentRepository ||
      !this.configService
    ) {
      throw new ConflictException('Rescheduling is not available.');
    }
    return {
      interestService: this.interestService,
      ledgerService: this.ledgerService,
      installmentRepository: this.installmentRepository,
      configService: this.configService,
    };
  }

  /**
   * Replacement schedule: outstanding principal re-amortised over the new
   * term at the account's rate. Interest already earned on overdue
   * instalments and unpaid fees are carried into the first new instalment;
   * interest not yet earned is rebated.
   */
  private async buildPreview(account: EmployeeFinanceAccount, newTerm: number) {
    const {
      interestService,
      ledgerService,
      installmentRepository,
      configService,
    } = this.requireServicingDependencies();
    await ledgerService.ensureInterestAccrued(account.companyId, account.id);
    const balance = await ledgerService.calculateBalance(
      account.companyId,
      account.id,
    );
    const principalCents = EmployeeFinanceMoney.toCents(balance.principal);
    if (principalCents <= 0n) {
      throw new ConflictException('No principal is left to reschedule.');
    }
    const asOf = todayString();
    const open = await installmentRepository.find({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    const interestBalance = EmployeeFinanceMoney.toCents(balance.interest);
    const unearned = unearnedInterestCents(open, asOf);
    const rebate =
      interestBalance > 0n
        ? unearned < interestBalance
          ? unearned
          : interestBalance
        : 0n;
    const carriedInterest =
      interestBalance - rebate > 0n ? interestBalance - rebate : 0n;
    const carriedFees =
      EmployeeFinanceMoney.toCents(balance.fees) > 0n
        ? EmployeeFinanceMoney.toCents(balance.fees)
        : 0n;
    const repaymentDay = configService.get<number>(
      'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY',
      28,
    );
    const firstRepaymentDate = addMonths(asOf, 1, repaymentDay);
    const method =
      (recordValue(account.productSnapshot)
        .interestMethod as EmployeeFinanceInterestMethodEnum) ??
      EmployeeFinanceInterestMethodEnum.ZERO_INTEREST;
    const schedule = interestService.calculateSchedule({
      principal: balance.principal,
      annualInterestRate: account.interestRate,
      termMonths: newTerm,
      method,
      firstRepaymentDate,
      repaymentDay,
    });
    if (schedule[0]) {
      schedule[0].interest_due = EmployeeFinanceMoney.add(
        schedule[0].interest_due,
        EmployeeFinanceMoney.fromCents(carriedInterest),
      );
      schedule[0].fee_due = EmployeeFinanceMoney.add(
        schedule[0].fee_due,
        EmployeeFinanceMoney.fromCents(carriedFees),
      );
      schedule[0].total_due = EmployeeFinanceMoney.add(
        schedule[0].principal_due,
        schedule[0].interest_due,
        schedule[0].fee_due,
      );
    }
    const newInterest =
      schedule.reduce(
        (sum, item) => sum + EmployeeFinanceMoney.toCents(item.interest_due),
        0n,
      ) - carriedInterest;
    return {
      as_of: asOf,
      outstanding_principal: balance.principal,
      carried_interest: EmployeeFinanceMoney.fromCents(carriedInterest),
      carried_fees: EmployeeFinanceMoney.fromCents(carriedFees),
      unearned_interest_rebate: EmployeeFinanceMoney.fromCents(rebate),
      new_interest_total: EmployeeFinanceMoney.fromCents(newInterest),
      first_repayment_date: firstRepaymentDate,
      new_installment:
        schedule[schedule.length > 1 ? 1 : 0]?.total_due ?? '0.00',
      cancelled_installment_ids: open.map((item) => item.id),
      schedule,
    };
  }

  private async apply(
    account: EmployeeFinanceAccount,
    reschedule: EmployeeFinanceReschedule,
  ) {
    const { ledgerService, installmentRepository } =
      this.requireServicingDependencies();
    const preview = await this.buildPreview(account, reschedule.newTermMonths);
    const open = await installmentRepository.find({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
    });
    for (const installment of open) {
      installment.status = EmployeeFinanceInstallmentStatusEnum.CANCELLED;
    }
    await installmentRepository.save(open);
    if (open.length && this.instructionRepository) {
      await this.instructionRepository.update(
        {
          companyId: account.companyId,
          installmentId: In(open.map((item) => item.id)),
          status: EmployeeFinancePayrollInstructionStatusEnum.OPEN,
        },
        {
          status: EmployeeFinancePayrollInstructionStatusEnum.CANCELLED,
          resolution: 'RESCHEDULED',
        },
      );
    }
    if (EmployeeFinanceMoney.toCents(preview.unearned_interest_rebate) > 0n) {
      await ledgerService.post({
        companyId: account.companyId,
        accountId: account.id,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.INTEREST_WAIVER,
        direction: 'CREDIT',
        interestAmount: preview.unearned_interest_rebate,
        effectiveDate: preview.as_of,
        sourceType: 'RESCHEDULE',
        sourceId: String(reschedule.id),
        idempotencyKey: `reschedule:${reschedule.id}:rebate`,
        description: 'Interest on the replaced schedule not yet earned',
      });
    }
    const newVersion = reschedule.newScheduleVersion;
    if (EmployeeFinanceMoney.toCents(preview.new_interest_total) > 0n) {
      await ledgerService.post({
        companyId: account.companyId,
        accountId: account.id,
        entryType: EmployeeFinanceLedgerEntryTypeEnum.INTEREST_ACCRUAL,
        direction: 'DEBIT',
        interestAmount: preview.new_interest_total,
        effectiveDate: preview.as_of,
        sourceType: 'RESCHEDULE',
        sourceId: String(reschedule.id),
        idempotencyKey: `interest-accrual:${account.id}:v${newVersion}`,
        description: 'Contractual interest for the rescheduled term',
      });
    }
    await installmentRepository.save(
      preview.schedule.map((item) =>
        installmentRepository.create({
          companyId: account.companyId,
          accountId: account.id,
          employeeId: account.employeeId,
          scheduleVersion: newVersion,
          installmentNumber: item.installment_number,
          dueDate: item.due_date,
          originalDueDate: item.due_date,
          principalDue: item.principal_due,
          interestDue: item.interest_due,
          feeDue: item.fee_due,
          totalDue: item.total_due,
        }),
      ),
    );
    await this.accountRepository.update(
      { id: account.id, companyId: account.companyId },
      {
        scheduleVersion: newVersion,
        termMonths: reschedule.newTermMonths,
        scheduledMonthlyInstallment: preview.new_installment,
        maturityDate:
          preview.schedule[preview.schedule.length - 1]?.due_date ??
          account.maturityDate,
        interestAmount: EmployeeFinanceMoney.add(
          EmployeeFinanceMoney.subtract(
            account.interestAmount,
            preview.unearned_interest_rebate,
          ),
          preview.new_interest_total,
        ),
        status: EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
      },
    );
    await this.accountStatusService?.refresh(account.companyId, account.id);
    return preview;
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
    @Optional()
    private readonly ledgerService?: EmployeeFinanceLedgerService,
    @Optional()
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository?: Repository<EmployeeFinanceInstallment>,
    @Optional()
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository?: Repository<EmployeeFinancePayrollInstruction>,
    @Optional()
    private readonly auditService?: EmployeeFinanceAuditService,
    @Optional()
    private readonly accountStatusService?: EmployeeFinanceAccountStatusService,
  ) {}

  /**
   * Moves the leaver's open loans into exit recovery and adds one recovery
   * line per loan to the final settlement. Safe to call again: it refreshes
   * the amounts instead of adding duplicate lines.
   */
  async createForOffboarding(companyId: number, offboardingRequestId: number) {
    const offboarding = await this.offboardingRepository.findOne({
      where: { id: offboardingRequestId, company_id: companyId },
    });
    if (!offboarding)
      throw new NotFoundException('Offboarding request not found.');
    const accounts = await this.accountRepository.find({
      where: {
        companyId,
        employeeId: offboarding.employee_id,
        status: In([
          ...activeAccountStatuses(),
          EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY,
        ]),
      },
    });
    const recoveries: EmployeeFinanceExitRecovery[] = [];
    for (const account of accounts) {
      if (
        account.status === EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT
      ) {
        continue;
      }
      const figures = await this.recoveryFigures(account);
      const snapshot = {
        account_id: account.id,
        account_no: account.accountNo,
        product_type: account.productType,
        outstanding_total: account.outstandingTotal,
        ...figures,
      };
      let recovery = await this.exitRecoveryRepository.findOne({
        where: { offboardingRequestId, accountId: account.id },
      });
      if (!recovery) {
        recovery = await this.exitRecoveryRepository.save(
          this.exitRecoveryRepository.create({
            companyId,
            offboardingRequestId,
            employeeId: offboarding.employee_id,
            accountId: account.id,
            recoveryAmount: figures.settlement_amount,
            snapshot,
            snapshotHash: hash(snapshot),
          }),
        );
      } else if (recovery.status === 'OPEN') {
        recovery.recoveryAmount = figures.settlement_amount;
        recovery.snapshot = snapshot;
        recovery.snapshotHash = hash(snapshot);
        recovery = await this.exitRecoveryRepository.save(recovery);
      }
      const itemAttributes = {
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
        amount: recovery.recoveryAmount,
        currency: 'TZS',
        source_type:
          account.productType === EmployeeFinanceProductTypeEnum.SALARY_ADVANCE
            ? OffboardingSettlementSourceEnum.ADVANCE_EXTERNAL
            : OffboardingSettlementSourceEnum.LOAN_EXTERNAL,
        source_reference: account.accountNo,
        calculation_snapshot: snapshot,
        metadata: { employee_finance_exit_recovery_id: recovery.id },
      };
      const existingItem = recovery.settlementItemId
        ? await this.settlementItemRepository.findOne({
            where: { id: recovery.settlementItemId, company_id: companyId },
          })
        : await this.settlementItemRepository.findOne({
            where: {
              company_id: companyId,
              offboarding_request_id: offboardingRequestId,
              source_reference: account.accountNo,
            },
          });
      if (existingItem) {
        if (existingItem.status === OffboardingSettlementStatusEnum.PENDING) {
          Object.assign(existingItem, itemAttributes);
          await this.settlementItemRepository.save(existingItem);
        }
        recovery.settlementItemId = existingItem.id;
      } else {
        const item = await this.settlementItemRepository.save(
          this.settlementItemRepository.create({
            ...itemAttributes,
            status: OffboardingSettlementStatusEnum.PENDING,
          }),
        );
        recovery.settlementItemId = item.id;
      }
      recovery = await this.exitRecoveryRepository.save(recovery);
      if (account.status !== EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY) {
        account.status = EmployeeFinanceAccountStatusEnum.EXIT_RECOVERY;
        await this.accountRepository.save(account);
      }
      // Regular payroll deductions stop; the final settlement recovers it.
      await this.instructionRepository?.update(
        {
          companyId,
          accountId: account.id,
          status: EmployeeFinancePayrollInstructionStatusEnum.OPEN,
        },
        {
          status: EmployeeFinancePayrollInstructionStatusEnum.CANCELLED,
          resolution: 'EXIT_RECOVERY',
        },
      );
      recoveries.push(recovery);
    }
    return recoveries;
  }

  list(actor: AuthenticatedUser, offboardingRequestId?: number) {
    return this.exitRecoveryRepository.find({
      where: {
        companyId: actor.companyId!,
        ...(offboardingRequestId ? { offboardingRequestId } : {}),
      },
      order: { id: 'DESC' },
    });
  }

  /**
   * Records money recovered from the leaver's final settlement and posts it
   * to the loan. A shortfall leaves the account in exit recovery so Finance
   * can collect directly or write the remainder off.
   */
  async confirmRecovery(
    actor: AuthenticatedUser,
    recoveryId: number,
    dto: ConfirmEmployeeFinanceExitRecoveryDto,
  ) {
    if (!this.ledgerService || !this.installmentRepository) {
      throw new ConflictException('Exit recovery posting is not available.');
    }
    const recovery = await this.exitRecoveryRepository.findOne({
      where: { id: recoveryId, companyId: actor.companyId! },
    });
    if (!recovery) throw new NotFoundException('Exit recovery not found.');
    if (!['OPEN', 'PARTIALLY_RECOVERED'].includes(recovery.status)) {
      throw new ConflictException(
        `This recovery is ${recovery.status.toLowerCase()}.`,
      );
    }
    const remaining =
      EmployeeFinanceMoney.toCents(recovery.recoveryAmount) -
      EmployeeFinanceMoney.toCents(recovery.recoveredAmount);
    const amountCents = EmployeeFinanceMoney.toCents(dto.amount);
    if (amountCents <= 0n || amountCents > remaining) {
      throw new BadRequestException(
        `Recovered amount must be above zero and at most ${EmployeeFinanceMoney.fromCents(remaining)}.`,
      );
    }
    const asOf = textValue(recordValue(recovery.snapshot).as_of, todayString());
    await rebateUnearnedInterest({
      ledgerService: this.ledgerService,
      installmentRepository: this.installmentRepository,
      companyId: recovery.companyId,
      accountId: recovery.accountId,
      asOf,
      idempotencyKey: `exit-recovery:${recovery.id}:rebate`,
      sourceType: 'EXIT_RECOVERY',
      sourceId: String(recovery.id),
    });
    const installments = await this.installmentRepository.find({
      where: {
        companyId: recovery.companyId,
        accountId: recovery.accountId,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    const allocation = allocateCreditToInstallments(installments, amountCents);
    if (allocation.unapplied > 0n) {
      throw new BadRequestException(
        'Recovered amount exceeds what the loan still owes.',
      );
    }
    await this.installmentRepository.save(
      allocation.allocations.map((item) => item.installment),
    );
    const sequence =
      Number(recordValue(recovery.snapshot).confirmation_count ?? 0) + 1;
    await this.ledgerService.post({
      companyId: recovery.companyId,
      accountId: recovery.accountId,
      entryType: EmployeeFinanceLedgerEntryTypeEnum.SETTLEMENT_REPAYMENT,
      direction: 'CREDIT',
      principalAmount: EmployeeFinanceMoney.fromCents(
        allocation.totals.principal,
      ),
      interestAmount: EmployeeFinanceMoney.fromCents(
        allocation.totals.interest,
      ),
      feeAmount: EmployeeFinanceMoney.fromCents(allocation.totals.fee),
      effectiveDate: dto.payment_date ?? todayString(),
      sourceType: 'EXIT_RECOVERY',
      sourceId: String(recovery.id),
      idempotencyKey: `exit-recovery:${recovery.id}:${sequence}`,
      postedByCompanyUserId: actor.companyMembershipId ?? actor.id,
      description: dto.payment_reference
        ? `Final settlement recovery (${dto.payment_reference})`
        : 'Final settlement recovery',
    });
    recovery.recoveredAmount = EmployeeFinanceMoney.add(
      recovery.recoveredAmount,
      EmployeeFinanceMoney.fromCents(amountCents),
    );
    recovery.status =
      amountCents === remaining ? 'RECOVERED' : 'PARTIALLY_RECOVERED';
    recovery.recoveredAt = new Date();
    recovery.snapshot = {
      ...recordValue(recovery.snapshot),
      confirmation_count: sequence,
    };
    const saved = await this.exitRecoveryRepository.save(recovery);
    await this.auditService?.log({
      actor,
      action: 'finance.exit_recovery.confirmed',
      entityType: 'EMPLOYEE_FINANCE_EXIT_RECOVERY',
      entityId: saved.id,
      summary: {
        account_id: saved.accountId,
        amount: EmployeeFinanceMoney.fromCents(amountCents),
        status: saved.status,
      },
    });
    await this.accountStatusService?.refresh(saved.companyId, saved.accountId);
    return saved;
  }

  private async recoveryFigures(account: EmployeeFinanceAccount) {
    if (!this.ledgerService || !this.installmentRepository) {
      return {
        as_of: todayString(),
        settlement_amount: account.outstandingTotal,
        unearned_interest_rebate: '0.00',
      };
    }
    await this.ledgerService.ensureInterestAccrued(
      account.companyId,
      account.id,
    );
    const balance = await this.ledgerService.calculateBalance(
      account.companyId,
      account.id,
    );
    const installments = await this.installmentRepository.find({
      where: {
        companyId: account.companyId,
        accountId: account.id,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
    });
    return settlementFigures(installments, balance, todayString());
  }
}

@Injectable()
export class EmployeeFinancePaymentImportService {
  constructor(
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly disbursementService: EmployeeFinanceDisbursementService,
    private readonly repaymentService: EmployeeFinanceRepaymentService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(EmployeeFinanceDisbursement)
    private readonly disbursementRepository: Repository<EmployeeFinanceDisbursement>,
    @InjectRepository(EmployeeFinanceRepayment)
    private readonly repaymentRepository: Repository<EmployeeFinanceRepayment>,
  ) {}

  async importFile(
    actor: AuthenticatedUser,
    dto: ImportEmployeeFinancePaymentFileDto,
    options: { columnMap?: EmployeeFinanceBankColumnMap | null } = {},
  ) {
    const storedFile = await this.filesService.savePrivateBase64File(dto.file, {
      directorySegments: [
        'imports',
        'employee-finance',
        `company-${actor.companyId!}`,
      ],
      fileNamePrefix: 'finance-payments',
      allowedMimeTypes: [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      maxFileSizeBytes: 5 * 1024 * 1024,
    });
    const buffer = await this.filesService.readManagedFile(
      storedFile.publicPath,
    );
    const rows = await this.parsePaymentRows(
      buffer ?? Buffer.alloc(0),
      storedFile.mimeType,
      storedFile.originalFileName,
    );
    const results: Record<string, unknown>[] = [];
    for (const row of rows) {
      results.push(
        await this.matchRow(
          actor,
          row,
          dto.dry_run !== false,
          options.columnMap ?? undefined,
        ),
      );
    }
    const summary = {
      imported_rows: rows.length,
      matched_rows: results.filter((row) => row.matched).length,
      posted_rows: results.filter((row) => row.action === 'POSTED').length,
      issue_rows: results.filter((row) => row.issue).length,
      dry_run: dto.dry_run !== false,
      file_path: storedFile.publicPath,
    };
    await this.auditService.log({
      actor,
      action: 'finance.payment_file.imported',
      entityType: 'EMPLOYEE_FINANCE_PAYMENT_IMPORT',
      entityId: storedFile.storedFileName,
      summary,
    });
    return { summary, rows: results };
  }

  private async matchRow(
    actor: AuthenticatedUser,
    row: Record<string, string>,
    dryRun: boolean,
    override?: EmployeeFinanceBankColumnMap,
  ) {
    const mapping = this.bankColumnMap(override);
    const reference = this.firstMappedValue(row, mapping.reference).trim();
    const amount = this.firstMappedValue(row, mapping.amount).trim();
    const status = normalizeImportStatus(
      this.firstMappedValue(row, mapping.status),
    );
    if (!reference) {
      return { row, matched: false, issue: 'MISSING_REFERENCE' };
    }
    const disbursement = await this.disbursementRepository.findOne({
      where: { companyId: actor.companyId!, paymentReference: reference },
    });
    if (disbursement) {
      return this.matchDisbursement(
        actor,
        disbursement,
        amount,
        status,
        dryRun,
      );
    }
    const repayment = await this.repaymentRepository.findOne({
      where: { companyId: actor.companyId!, paymentReference: reference },
    });
    if (repayment) {
      return this.matchRepayment(actor, repayment, amount, status, dryRun);
    }
    return { row, reference, matched: false, issue: 'NO_MATCH' };
  }

  private async matchDisbursement(
    actor: AuthenticatedUser,
    disbursement: EmployeeFinanceDisbursement,
    amount: string,
    status: string,
    dryRun: boolean,
  ) {
    const issue =
      amount &&
      EmployeeFinanceMoney.toCents(amount) !==
        EmployeeFinanceMoney.toCents(disbursement.amount)
        ? 'AMOUNT_MISMATCH'
        : status === 'FAILED'
          ? 'BANK_REPORTED_FAILED'
          : status === 'PARTIAL'
            ? 'BANK_REPORTED_PARTIAL'
            : null;
    if (issue || dryRun) {
      return {
        matched: true,
        entity_type: 'DISBURSEMENT',
        entity_id: disbursement.id,
        reference: disbursement.paymentReference,
        issue,
        action: dryRun ? 'DRY_RUN' : 'REVIEW_REQUIRED',
      };
    }
    if (
      disbursement.status === EmployeeFinanceDisbursementStatusEnum.APPROVED
    ) {
      try {
        await this.disbursementService.confirm(actor, disbursement.id);
        return {
          matched: true,
          entity_type: 'DISBURSEMENT',
          entity_id: disbursement.id,
          reference: disbursement.paymentReference,
          action: 'POSTED',
        };
      } catch (error) {
        return {
          matched: true,
          entity_type: 'DISBURSEMENT',
          entity_id: disbursement.id,
          reference: disbursement.paymentReference,
          issue: error instanceof Error ? error.message : 'POST_FAILED',
          action: 'REVIEW_REQUIRED',
        };
      }
    }
    return {
      matched: true,
      entity_type: 'DISBURSEMENT',
      entity_id: disbursement.id,
      reference: disbursement.paymentReference,
      issue: `UNPOSTABLE_STATUS_${disbursement.status}`,
      action: 'REVIEW_REQUIRED',
    };
  }

  private async matchRepayment(
    actor: AuthenticatedUser,
    repayment: EmployeeFinanceRepayment,
    amount: string,
    status: string,
    dryRun: boolean,
  ) {
    const issue =
      amount &&
      EmployeeFinanceMoney.toCents(amount) !==
        EmployeeFinanceMoney.toCents(repayment.amount)
        ? 'AMOUNT_MISMATCH'
        : status === 'FAILED'
          ? 'BANK_REPORTED_FAILED'
          : status === 'PARTIAL'
            ? 'BANK_REPORTED_PARTIAL'
            : null;
    if (issue || dryRun) {
      return {
        matched: true,
        entity_type: 'REPAYMENT',
        entity_id: repayment.id,
        reference: repayment.paymentReference,
        issue,
        action: dryRun ? 'DRY_RUN' : 'REVIEW_REQUIRED',
      };
    }
    if (
      repayment.status === EmployeeFinanceRepaymentStatusEnum.DRAFT ||
      repayment.status === EmployeeFinanceRepaymentStatusEnum.APPROVED
    ) {
      try {
        await this.repaymentService.approve(actor, repayment.id);
        return {
          matched: true,
          entity_type: 'REPAYMENT',
          entity_id: repayment.id,
          reference: repayment.paymentReference,
          action: 'POSTED',
        };
      } catch (error) {
        return {
          matched: true,
          entity_type: 'REPAYMENT',
          entity_id: repayment.id,
          reference: repayment.paymentReference,
          issue: error instanceof Error ? error.message : 'POST_FAILED',
          action: 'REVIEW_REQUIRED',
        };
      }
    }
    return {
      matched: true,
      entity_type: 'REPAYMENT',
      entity_id: repayment.id,
      reference: repayment.paymentReference,
      issue: `UNPOSTABLE_STATUS_${repayment.status}`,
      action: 'REVIEW_REQUIRED',
    };
  }

  private async parsePaymentRows(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ) {
    const lowerName = fileName.toLowerCase();
    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      lowerName.endsWith('.xlsx')
    ) {
      return this.parseXlsx(buffer);
    }
    return this.parseCsv(buffer.toString('utf8'));
  }

  private parseCsv(content: string) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = this.splitCsvLine(lines[0]).map((header) =>
      header.trim().toLowerCase(),
    );
    return lines.slice(1).map((line) => {
      const values = this.splitCsvLine(line);
      return Object.fromEntries(
        headers.map((header, index) => [header, values[index]?.trim() ?? '']),
      );
    });
  }

  private splitCsvLine(line: string) {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  private async parseXlsx(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) return [];
    const headers = this.excelRowValues(worksheet.getRow(1)).map((header) =>
      header.trim().toLowerCase(),
    );
    const rows: Record<string, string>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = this.excelRowValues(row);
      if (values.every((value) => !value.trim())) return;
      rows.push(
        Object.fromEntries(
          headers.map((header, index) => [header, values[index]?.trim() ?? '']),
        ),
      );
    });
    return rows;
  }

  private excelRowValues(row: ExcelJS.Row) {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    return values.map((value) => this.excelCellValueToString(value));
  }

  private excelCellValueToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if ('text' in record) return this.excelCellValueToString(record.text);
      if ('result' in record) return this.excelCellValueToString(record.result);
      if (Array.isArray(record.richText)) {
        return record.richText
          .map((entry) =>
            this.excelCellValueToString(
              (entry as Record<string, unknown>).text,
            ),
          )
          .join('');
      }
    }
    return '';
  }

  private bankColumnMap(override?: EmployeeFinanceBankColumnMap) {
    const fallback = {
      reference: ['payment_reference', 'reference', 'transaction_reference'],
      amount: ['amount', 'paid_amount', 'transaction_amount'],
      status: ['status', 'result', 'payment_status'],
    };
    if (override) {
      return {
        reference: this.stringArray(override.reference, fallback.reference),
        amount: this.stringArray(override.amount, fallback.amount),
        status: this.stringArray(override.status, fallback.status),
      };
    }
    const raw = this.configService.get<string>(
      'EMPLOYEE_FINANCE_BANK_IMPORT_COLUMN_MAP',
    );
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        reference: this.stringArray(parsed.reference, fallback.reference),
        amount: this.stringArray(parsed.amount, fallback.amount),
        status: this.stringArray(parsed.status, fallback.status),
      };
    } catch {
      return fallback;
    }
  }

  private stringArray(value: unknown, fallback: string[]) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : fallback;
  }

  private firstMappedValue(row: Record<string, string>, keys: string[]) {
    for (const key of keys) {
      const value = row[key.trim().toLowerCase()];
      if (value !== undefined) return value;
    }
    return '';
  }
}

@Injectable()
export class EmployeeFinanceAccountingPostingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: EmployeeFinanceAuditService,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository: Repository<EmployeeFinanceLedgerEntry>,
  ) {}

  async post(actor: AuthenticatedUser, dto: PostEmployeeFinanceAccountingDto) {
    const companyId = actor.companyId!;
    let entries = await this.ledgerRepository.find({
      where: { companyId },
      order: { effectiveDate: 'ASC', id: 'ASC' },
    });
    entries = entries.filter((entry) => {
      if (dto.date_from && entry.effectiveDate < dto.date_from) return false;
      if (dto.date_to && entry.effectiveDate > dto.date_to) return false;
      return true;
    });
    const journals = entries.map((entry) => ({
      external_id: `employee-finance-ledger-${entry.id}`,
      account_id: entry.accountId,
      entry_type: entry.entryType,
      direction: entry.direction,
      amount: entry.totalAmount,
      principal_amount: entry.principalAmount,
      interest_amount: entry.interestAmount,
      fee_amount: entry.feeAmount,
      effective_date: entry.effectiveDate,
      source_type: entry.sourceType,
      source_id: entry.sourceId,
      idempotency_key: entry.idempotencyKey,
    }));
    const provider = dto.provider ?? 'webhook';
    const endpoint = this.configService.get<string>(
      'EMPLOYEE_FINANCE_ERP_POST_URL',
    );
    const dryRun = dto.dry_run !== false || !endpoint;
    let providerResponse: unknown = null;
    if (!dryRun && endpoint) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.erpHeaders(),
        body: JSON.stringify({ provider, company_id: companyId, journals }),
      });
      providerResponse = {
        status: response.status,
        ok: response.ok,
        body: await response.text(),
      };
      if (!response.ok) {
        throw new BadRequestException({
          message: 'ERP posting endpoint rejected the journal batch.',
          providerResponse,
        });
      }
    }
    const summary = {
      provider,
      dry_run: dryRun,
      journal_count: journals.length,
      endpoint_configured: Boolean(endpoint),
    };
    await this.auditService.log({
      actor,
      action: 'finance.accounting.posted',
      entityType: 'EMPLOYEE_FINANCE_ACCOUNTING_POST',
      entityId: `${companyId}-${Date.now()}`,
      summary,
    });
    return { summary, journals, providerResponse };
  }

  private erpHeaders() {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    const authType = (
      this.configService.get<string>('EMPLOYEE_FINANCE_ERP_AUTH_TYPE') ?? 'none'
    )
      .trim()
      .toLowerCase();
    if (authType === 'bearer') {
      const token = this.configService.get<string>(
        'EMPLOYEE_FINANCE_ERP_AUTH_TOKEN',
      );
      if (token) headers.authorization = `Bearer ${token}`;
    } else if (authType === 'api-key') {
      const header =
        this.configService.get<string>('EMPLOYEE_FINANCE_ERP_API_KEY_HEADER') ??
        'x-api-key';
      const value = this.configService.get<string>(
        'EMPLOYEE_FINANCE_ERP_API_KEY',
      );
      if (value) headers[header] = value;
    } else if (authType === 'basic') {
      const username = this.configService.get<string>(
        'EMPLOYEE_FINANCE_ERP_BASIC_USERNAME',
      );
      const password = this.configService.get<string>(
        'EMPLOYEE_FINANCE_ERP_BASIC_PASSWORD',
      );
      if (username && password) {
        headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      }
    }
    return headers;
  }
}

@Injectable()
export class EmployeeFinanceReportsService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(EmployeeFinanceApplication)
    private readonly applicationRepository: Repository<EmployeeFinanceApplication>,
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinanceDisbursement)
    private readonly disbursementRepository: Repository<EmployeeFinanceDisbursement>,
    @InjectRepository(EmployeeFinanceRepayment)
    private readonly repaymentRepository: Repository<EmployeeFinanceRepayment>,
    @InjectRepository(EmployeeFinanceSettlementQuote)
    private readonly settlementQuoteRepository: Repository<EmployeeFinanceSettlementQuote>,
    @InjectRepository(EmployeeFinanceAuditLog)
    private readonly auditRepository: Repository<EmployeeFinanceAuditLog>,
  ) {}

  async dashboard(actor: AuthenticatedUser) {
    const companyId = actor.companyId!;
    const [
      pendingApplications,
      activeAccounts,
      arrearsAccounts,
      accountTotals,
      overdueTotals,
      dueToDate,
    ] = await Promise.all([
      this.applicationRepository.count({
        where: {
          companyId,
          status: In([
            EmployeeFinanceApplicationStatusEnum.PENDING_MANAGER_RECOMMENDATION,
            EmployeeFinanceApplicationStatusEnum.PENDING_HR_APPROVAL,
            EmployeeFinanceApplicationStatusEnum.PENDING_FINANCE_APPROVAL,
            EmployeeFinanceApplicationStatusEnum.PENDING_MANAGEMENT_APPROVAL,
            EmployeeFinanceApplicationStatusEnum.PENDING_EMPLOYEE_ACCEPTANCE,
          ]),
        },
      }),
      this.accountRepository.count({
        where: { companyId, status: In(activeAccountStatuses()) },
      }),
      this.accountRepository.count({
        where: {
          companyId,
          status: EmployeeFinanceAccountStatusEnum.IN_ARREARS,
        },
      }),
      this.accountRepository
        .createQueryBuilder('account')
        .select(
          'COALESCE(SUM(account.outstandingTotal) FILTER (WHERE account.status IN (:...activeStatuses)), 0)',
          'outstanding',
        )
        .addSelect(
          'COUNT(*) FILTER (WHERE account.status = :settledStatus)',
          'settled_accounts',
        )
        .addSelect(
          'COUNT(*) FILTER (WHERE account.status = :writtenOffStatus)',
          'written_off_accounts',
        )
        .addSelect(
          'COALESCE(SUM(account.principalAmount) FILTER (WHERE account.status NOT IN (:...undisbursedStatuses)), 0)',
          'disbursed_total',
        )
        .where('account.companyId = :companyId', { companyId })
        .setParameters({
          activeStatuses: activeAccountStatuses(),
          settledStatus: EmployeeFinanceAccountStatusEnum.SETTLED,
          writtenOffStatus: EmployeeFinanceAccountStatusEnum.WRITTEN_OFF,
          undisbursedStatuses: [
            EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
            EmployeeFinanceAccountStatusEnum.CANCELLED,
          ],
        })
        .getRawOne<{
          outstanding: string;
          settled_accounts: string;
          written_off_accounts: string;
          disbursed_total: string;
        }>(),
      this.installmentRepository
        .createQueryBuilder('installment')
        .select('COUNT(*)', 'overdue_installments')
        .addSelect(
          'COALESCE(SUM(GREATEST(installment.feeDue + installment.interestDue + installment.principalDue - installment.paidAmount, 0)), 0)',
          'overdue_amount',
        )
        .where('installment.companyId = :companyId', { companyId })
        .andWhere('installment.status = :overdueStatus', {
          overdueStatus: EmployeeFinanceInstallmentStatusEnum.OVERDUE,
        })
        .getRawOne<{
          overdue_installments: string;
          overdue_amount: string;
        }>(),
      this.installmentRepository
        .createQueryBuilder('installment')
        .select('COALESCE(SUM(installment.totalDue), 0)', 'due')
        .addSelect('COALESCE(SUM(installment.paidAmount), 0)', 'paid')
        .where('installment.companyId = :companyId', { companyId })
        .andWhere('installment.dueDate <= :today', { today: todayString() })
        .andWhere('installment.status != :cancelled', {
          cancelled: EmployeeFinanceInstallmentStatusEnum.CANCELLED,
        })
        .getRawOne<{ due: string; paid: string }>(),
    ]);
    const dueCents = EmployeeFinanceMoney.toCents(dueToDate?.due ?? '0');
    const paidCents = EmployeeFinanceMoney.toCents(dueToDate?.paid ?? '0');
    return {
      pendingApplications,
      activeAccounts,
      arrearsAccounts,
      outstanding: EmployeeFinanceMoney.add(accountTotals?.outstanding ?? '0'),
      overdueAmount: EmployeeFinanceMoney.add(
        overdueTotals?.overdue_amount ?? '0',
      ),
      overdueInstallments: Number(overdueTotals?.overdue_installments ?? 0),
      collectionRate:
        dueCents > 0n
          ? EmployeeFinanceMoney.percentage(
              paidCents > dueCents ? dueCents : paidCents,
              dueCents,
            )
          : '100.00',
      settledAccounts: Number(accountTotals?.settled_accounts ?? 0),
      writtenOffAccounts: Number(accountTotals?.written_off_accounts ?? 0),
      disbursedTotal: EmployeeFinanceMoney.add(
        accountTotals?.disbursed_total ?? '0',
      ),
    };
  }

  catalog() {
    return [
      {
        type: 'aging',
        label: 'Aging',
        description: 'Outstanding balances grouped by overdue age bucket.',
        chart: 'bucket-bar',
      },
      {
        type: 'exposure',
        label: 'Outstanding exposure',
        description: 'Loan exposure by product and account status.',
        chart: 'status-product',
      },
      {
        type: 'repayment-performance',
        label: 'Repayment performance',
        description: 'Collections, repayment rows, and collection rate.',
        chart: 'collection-rate',
      },
      {
        type: 'disbursements',
        label: 'Disbursements',
        description: 'Disbursement volume and bank reference status.',
        chart: 'amount-summary',
      },
      {
        type: 'settlements',
        label: 'Settlements',
        description: 'Settlement quote totals and validity status.',
        chart: 'amount-summary',
      },
      {
        type: 'default-risk',
        label: 'Default risk',
        description: 'Accounts with overdue schedule and risk buckets.',
        chart: 'risk-bucket',
      },
      {
        type: 'support-compliance',
        label: 'Support compliance',
        description: 'Document and guarantor completion by application.',
        chart: 'completion',
      },
    ];
  }

  notificationCatalog() {
    return [
      {
        code: 'employee_finance.application.received',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Application submitted or resubmitted',
        required: true,
      },
      {
        code: 'employee_finance.application.awaiting_decision',
        recipient: 'Stage approvers',
        channel: 'in-app/email',
        trigger: 'Application reaches an approval stage',
        required: true,
      },
      {
        code: 'employee_finance.application.reminder',
        recipient: 'Stage approvers and delegates',
        channel: 'in-app/email',
        trigger: 'Stage waits past the reminder window',
        required: true,
      },
      {
        code: 'employee_finance.application.escalated',
        recipient: 'Next authority',
        channel: 'in-app/email',
        trigger: 'Stage waits past the escalation window',
        required: true,
      },
      {
        code: 'employee_finance.application.returned',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Returned for correction',
        required: true,
      },
      {
        code: 'employee_finance.application.rejected',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Declined at a stage',
        required: true,
      },
      {
        code: 'employee_finance.application.approved',
        recipient: 'Employee',
        channel: 'in-app/email/sms',
        trigger: 'Final approval; sanction letter ready',
        required: true,
      },
      {
        code: 'employee_finance.guarantor.requested',
        recipient: 'Guarantor',
        channel: 'in-app/email',
        trigger: 'Added as guarantor',
        required: true,
      },
      {
        code: 'employee_finance.disbursement.confirmed',
        recipient: 'Employee',
        channel: 'in-app/email/sms',
        trigger: 'Loan paid out',
        required: true,
      },
      {
        code: 'employee_finance.installment.deducted',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Payroll deducted an instalment (FRS 17.12)',
        required: true,
      },
      {
        code: 'employee_finance.installment.overdue',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Account falls into arrears',
        required: true,
      },
      {
        code: 'employee_finance.deferment.decided',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Deferment approved or declined',
        required: true,
      },
      {
        code: 'employee_finance.reschedule.decided',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Reschedule approved or declined',
        required: true,
      },
      {
        code: 'employee_finance.adjustment.applied',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Penalty, waiver, or write-off applied',
        required: true,
      },
      {
        code: 'employee_finance.settlement.quoted',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Early settlement quote issued',
        required: true,
      },
      {
        code: 'employee_finance.account.settled',
        recipient: 'Employee',
        channel: 'in-app/email',
        trigger: 'Loan fully repaid',
        required: true,
      },
    ];
  }

  deploymentReadiness() {
    const erpUrl = this.configService.get<string>(
      'EMPLOYEE_FINANCE_ERP_POST_URL',
    );
    const bankMap = this.configService.get<string>(
      'EMPLOYEE_FINANCE_BANK_IMPORT_COLUMN_MAP',
    );
    const privateStorage =
      this.configService.get<string>('APP_PRIVATE_STORAGE_PATH') ??
      'private-uploads';
    const maxFileSize =
      this.configService.get<number>(
        'EMPLOYEE_FINANCE_DOCUMENT_MAX_FILE_SIZE_BYTES',
      ) ??
      this.configService.get<number>('MAX_UPLOAD_FILE_SIZE_BYTES') ??
      EMPLOYEE_FINANCE_DOCUMENT_MAX_BYTES;
    const checks = [
      {
        code: 'PRIVATE_STORAGE',
        status: privateStorage ? 'CONFIGURED' : 'MISSING',
        detail: privateStorage,
      },
      {
        code: 'DOCUMENT_FILE_SIZE',
        status: maxFileSize > 0 ? 'CONFIGURED' : 'MISSING',
        detail: maxFileSize,
      },
      {
        code: 'BANK_IMPORT_MAPPING',
        status: bankMap ? 'CONFIGURED' : 'DEFAULT',
        detail:
          bankMap ??
          'Using default aliases: payment_reference/reference, amount, status.',
      },
      {
        code: 'ERP_POSTING',
        status: erpUrl ? 'CONFIGURED' : 'DRY_RUN_ONLY',
        detail: erpUrl
          ? 'Posting endpoint configured.'
          : 'Set EMPLOYEE_FINANCE_ERP_POST_URL.',
      },
      {
        code: 'ERP_AUTH',
        status: (
          this.configService.get<string>('EMPLOYEE_FINANCE_ERP_AUTH_TYPE') ??
          'none'
        ).toUpperCase(),
        detail: 'none, bearer, api-key, or basic',
      },
      {
        code: 'NOTIFICATION_CATALOG',
        status: 'CONFIGURED',
        detail: `${this.notificationCatalog().length} loan notification events registered.`,
      },
    ];
    return {
      module: 'employee-finance',
      ready: checks.every((check) =>
        [
          'CONFIGURED',
          'DEFAULT',
          'NONE',
          'BEARER',
          'API-KEY',
          'BASIC',
        ].includes(String(check.status)),
      ),
      checks,
    };
  }

  async report(
    actor: AuthenticatedUser,
    reportType: string,
    query: EmployeeFinanceQueryDto,
  ) {
    const companyId = actor.companyId!;
    const type = reportType.trim().toLowerCase();
    if (type === 'aging') return this.agingReport(companyId);
    if (type === 'exposure') return this.exposureReport(companyId, query);
    if (type === 'repayment-performance')
      return this.repaymentPerformanceReport(companyId, query);
    if (type === 'disbursements')
      return this.disbursementReport(companyId, query);
    if (type === 'settlements') return this.settlementReport(companyId, query);
    if (type === 'default-risk') return this.defaultRiskReport(companyId);
    if (type === 'support-compliance')
      return this.supportComplianceReport(companyId, query);
    throw new BadRequestException('Unknown employee finance report type.');
  }

  async auditTimeline(
    actor: AuthenticatedUser,
    query: EmployeeFinanceQueryDto,
  ) {
    const where: Record<string, unknown> = { companyId: actor.companyId! };
    if (query.entity_type) where.entityType = query.entity_type;
    if (query.entity_id) where.entityId = String(query.entity_id);
    return this.auditRepository.find({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: Math.min(query.limit ?? 100, 500),
    });
  }

  private filterByDate<T>(
    rows: T[],
    query: EmployeeFinanceQueryDto,
    dateReader: (row: T) => string | Date | null | undefined,
  ) {
    return rows.filter((row) => {
      const raw = dateReader(row);
      if (!raw) return true;
      const value = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw;
      if (query.date_from && value < query.date_from) return false;
      if (query.date_to && value > query.date_to) return false;
      return true;
    });
  }

  private async agingReport(companyId: number) {
    const accounts = await this.accountRepository.find({
      where: { companyId, status: In(activeAccountStatuses()) },
      order: { id: 'ASC' },
    });
    const accountIds = accounts.map((account) => account.id);
    const installments = accountIds.length
      ? await this.installmentRepository.find({
          where: {
            companyId,
            accountId: In(accountIds),
            status: In([
              EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
              EmployeeFinanceInstallmentStatusEnum.PARTIALLY_PAID,
              EmployeeFinanceInstallmentStatusEnum.OVERDUE,
              EmployeeFinanceInstallmentStatusEnum.DEFERRED,
            ]),
          },
          order: { dueDate: 'ASC', id: 'ASC' },
        })
      : [];
    const buckets = {
      current: '0.00',
      days_1_30: '0.00',
      days_31_60: '0.00',
      days_61_90: '0.00',
      days_over_90: '0.00',
    };
    const rows = accounts.map((account) => {
      const accountInstallments = installments.filter(
        (installment) => installment.accountId === account.id,
      );
      let overdueAmount = '0.00';
      let bucket = 'current';
      for (const installment of accountInstallments) {
        const unpaid = EmployeeFinanceMoney.subtract(
          installment.totalDue,
          installment.paidAmount,
        );
        if (EmployeeFinanceMoney.toCents(unpaid) <= 0n) continue;
        const age = daysBetweenDates(installment.dueDate);
        let currentBucket: keyof typeof buckets = 'current';
        if (age > 90) currentBucket = 'days_over_90';
        else if (age > 60) currentBucket = 'days_61_90';
        else if (age > 30) currentBucket = 'days_31_60';
        else if (age > 0) currentBucket = 'days_1_30';
        buckets[currentBucket] = EmployeeFinanceMoney.add(
          buckets[currentBucket],
          unpaid,
        );
        if (currentBucket !== 'current')
          overdueAmount = EmployeeFinanceMoney.add(overdueAmount, unpaid);
        if (currentBucket !== 'current' && bucket === 'current')
          bucket = currentBucket;
      }
      return {
        account_id: account.id,
        account_no: account.accountNo,
        employee_id: account.employeeId,
        product_type: account.productType,
        status: account.status,
        outstanding_total: account.outstandingTotal,
        overdue_amount: overdueAmount,
        aging_bucket: bucket,
        next_due_date: accountInstallments[0]?.dueDate ?? null,
      };
    });
    return {
      reportType: 'aging',
      generatedAt: new Date().toISOString(),
      buckets,
      rows,
    };
  }

  private async exposureReport(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    let accounts = await this.accountRepository.find({
      where: { companyId },
      order: { id: 'ASC' },
    });
    if (query.status) {
      accounts = accounts.filter((account) => account.status === query.status);
    }
    if (query.employee_id) {
      accounts = accounts.filter(
        (account) => account.employeeId === query.employee_id,
      );
    }
    const byProduct: Record<
      string,
      { count: number; outstanding_total: string }
    > = {};
    const byStatus: Record<
      string,
      { count: number; outstanding_total: string }
    > = {};
    for (const account of accounts) {
      byProduct[account.productType] ??= {
        count: 0,
        outstanding_total: '0.00',
      };
      byStatus[account.status] ??= { count: 0, outstanding_total: '0.00' };
      byProduct[account.productType].count += 1;
      byProduct[account.productType].outstanding_total =
        EmployeeFinanceMoney.add(
          byProduct[account.productType].outstanding_total,
          account.outstandingTotal,
        );
      byStatus[account.status].count += 1;
      byStatus[account.status].outstanding_total = EmployeeFinanceMoney.add(
        byStatus[account.status].outstanding_total,
        account.outstandingTotal,
      );
    }
    return {
      reportType: 'exposure',
      generatedAt: new Date().toISOString(),
      totals: {
        account_count: accounts.length,
        outstanding_total: accounts.reduce(
          (sum, account) =>
            EmployeeFinanceMoney.add(sum, account.outstandingTotal),
          '0.00',
        ),
      },
      byProduct,
      byStatus,
      rows: accounts.map((account) => ({
        account_id: account.id,
        account_no: account.accountNo,
        employee_id: account.employeeId,
        product_type: account.productType,
        status: account.status,
        principal_amount: account.principalAmount,
        outstanding_total: account.outstandingTotal,
        scheduled_monthly_installment: account.scheduledMonthlyInstallment,
      })),
    };
  }

  private async repaymentPerformanceReport(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const repayments = this.filterByDate(
      await this.repaymentRepository.find({
        where: { companyId },
        order: { paymentDate: 'DESC', id: 'DESC' },
      }),
      query,
      (repayment) => repayment.paymentDate,
    );
    const installments = await this.installmentRepository.find({
      where: { companyId },
    });
    const dueTotal = installments.reduce(
      (sum, installment) => EmployeeFinanceMoney.add(sum, installment.totalDue),
      '0.00',
    );
    const paidTotal = installments.reduce(
      (sum, installment) =>
        EmployeeFinanceMoney.add(sum, installment.paidAmount),
      '0.00',
    );
    return {
      reportType: 'repayment-performance',
      generatedAt: new Date().toISOString(),
      totals: {
        due_total: dueTotal,
        paid_total: paidTotal,
        collection_rate:
          EmployeeFinanceMoney.toCents(dueTotal) > 0n
            ? EmployeeFinanceMoney.percentage(
                EmployeeFinanceMoney.toCents(paidTotal),
                EmployeeFinanceMoney.toCents(dueTotal),
              )
            : '0.00',
        repayment_total: repayments.reduce(
          (sum, repayment) => EmployeeFinanceMoney.add(sum, repayment.amount),
          '0.00',
        ),
      },
      rows: repayments.map((repayment) => ({
        repayment_id: repayment.id,
        account_id: repayment.accountId,
        repayment_type: repayment.repaymentType,
        amount: repayment.amount,
        payment_date: repayment.paymentDate,
        status: repayment.status,
        payment_reference: repayment.paymentReference,
      })),
    };
  }

  private async disbursementReport(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const disbursements = this.filterByDate(
      await this.disbursementRepository.find({
        where: { companyId },
        order: { paymentDate: 'DESC', id: 'DESC' },
      }),
      query,
      (disbursement) => disbursement.paymentDate,
    );
    return {
      reportType: 'disbursements',
      generatedAt: new Date().toISOString(),
      totals: {
        count: disbursements.length,
        amount: disbursements.reduce(
          (sum, disbursement) =>
            EmployeeFinanceMoney.add(sum, disbursement.amount),
          '0.00',
        ),
      },
      rows: disbursements.map((disbursement) => ({
        disbursement_id: disbursement.id,
        account_id: disbursement.accountId,
        amount: disbursement.amount,
        payment_reference: disbursement.paymentReference,
        payment_date: disbursement.paymentDate,
        status: disbursement.status,
      })),
    };
  }

  private async settlementReport(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    const quotes = this.filterByDate(
      await this.settlementQuoteRepository.find({
        where: { companyId },
        order: { validUntil: 'DESC', id: 'DESC' },
      }),
      query,
      (quote) => quote.validUntil,
    );
    return {
      reportType: 'settlements',
      generatedAt: new Date().toISOString(),
      totals: {
        count: quotes.length,
        settlement_amount: quotes.reduce(
          (sum, quote) => EmployeeFinanceMoney.add(sum, quote.settlementAmount),
          '0.00',
        ),
      },
      rows: quotes.map((quote) => ({
        quote_id: quote.id,
        quote_no: quote.quoteNo,
        account_id: quote.accountId,
        settlement_amount: quote.settlementAmount,
        valid_until: quote.validUntil,
        status: quote.status,
      })),
    };
  }

  private async defaultRiskReport(companyId: number) {
    const aging = await this.agingReport(companyId);
    const rows = aging.rows.map((row) => {
      const overdue = EmployeeFinanceMoney.toCents(row.overdue_amount);
      const outstanding = EmployeeFinanceMoney.toCents(row.outstanding_total);
      const risk_score =
        row.aging_bucket === 'days_over_90'
          ? 100
          : row.aging_bucket === 'days_61_90'
            ? 75
            : row.aging_bucket === 'days_31_60'
              ? 50
              : row.aging_bucket === 'days_1_30'
                ? 25
                : 0;
      return {
        ...row,
        risk_score,
        overdue_ratio:
          outstanding > 0n
            ? EmployeeFinanceMoney.percentage(overdue, outstanding)
            : '0.00',
      };
    });
    return {
      reportType: 'default-risk',
      generatedAt: new Date().toISOString(),
      totals: {
        account_count: rows.length,
        high_risk_count: rows.filter((row) => row.risk_score >= 75).length,
        watchlist_count: rows.filter((row) => row.risk_score > 0).length,
      },
      rows,
    };
  }

  private async supportComplianceReport(
    companyId: number,
    query: EmployeeFinanceQueryDto,
  ) {
    let applications = await this.applicationRepository.find({
      where: { companyId },
      order: { id: 'DESC' },
    });
    if (query.status) {
      applications = applications.filter(
        (application) => application.status === query.status,
      );
    }
    const rows = await Promise.all(
      applications.map(async (application) => {
        const product = recordValue(application.productSnapshot);
        const requiredDocuments = requiredDocumentTypes(
          product,
          application.requestedAmount,
        );
        const requiredGuarantors = requiredGuarantorCount(product);
        const [documents, guarantors] = await Promise.all([
          this.auditRepository.manager
            .getRepository(EmployeeFinanceApplicationDocument)
            .find({
              where: {
                companyId,
                applicationId: application.id,
              },
            }),
          this.auditRepository.manager
            .getRepository(EmployeeFinanceApplicationGuarantor)
            .find({
              where: {
                companyId,
                applicationId: application.id,
              },
            }),
        ]);
        const verifiedDocuments = new Set(
          documents
            .filter((document) => document.status === 'VERIFIED')
            .map((document) => document.documentType),
        );
        const approvedGuarantors = guarantors.filter(
          (guarantor) => guarantor.status === 'APPROVED',
        ).length;
        return {
          application_id: application.id,
          application_no: application.applicationNo,
          employee_id: application.employeeId,
          status: application.status,
          required_documents: requiredDocuments.length,
          verified_documents: requiredDocuments.filter((documentType) =>
            verifiedDocuments.has(documentType),
          ).length,
          required_guarantors: requiredGuarantors,
          approved_guarantors: approvedGuarantors,
          complete:
            requiredDocuments.every((documentType) =>
              verifiedDocuments.has(documentType),
            ) && approvedGuarantors >= requiredGuarantors,
        };
      }),
    );
    return {
      reportType: 'support-compliance',
      generatedAt: new Date().toISOString(),
      totals: {
        application_count: rows.length,
        complete_count: rows.filter((row) => row.complete).length,
        incomplete_count: rows.filter((row) => !row.complete).length,
      },
      rows,
    };
  }
}

@Injectable()
export class EmployeeFinanceReconciliationService {
  private readonly logger = new Logger(
    EmployeeFinanceReconciliationService.name,
  );

  constructor(
    @InjectRepository(EmployeeFinanceAccount)
    private readonly accountRepository: Repository<EmployeeFinanceAccount>,
    @InjectRepository(EmployeeFinanceInstallment)
    private readonly installmentRepository: Repository<EmployeeFinanceInstallment>,
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly instructionRepository: Repository<EmployeeFinancePayrollInstruction>,
    private readonly ledgerService: EmployeeFinanceLedgerService,
    @Optional()
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly ledgerRepository?: Repository<EmployeeFinanceLedgerEntry>,
    @Optional()
    private readonly auditService?: EmployeeFinanceAuditService,
  ) {}

  @Cron(process.env.EMPLOYEE_FINANCE_RECONCILIATION_CRON || '0 30 2 * * *')
  async scheduledReconciliation() {
    let lastAccountId = 0;
    let issues = 0;
    let checked = 0;
    let failed = 0;
    while (true) {
      const accounts = await this.accountRepository.find({
        where: { id: MoreThan(lastAccountId) },
        order: { id: 'ASC' },
        take: 100,
      });
      if (accounts.length === 0) break;

      for (const account of accounts) {
        checked += 1;
        try {
          issues += (await this.reconcileAccount(account.companyId, account.id))
            .issue_count;
        } catch (error) {
          failed += 1;
          issues += 1;
          this.logger.error(
            `Scheduled finance reconciliation failed for account ${account.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      lastAccountId = accounts[accounts.length - 1].id;
    }
    return {
      account_count: checked,
      issue_count: issues,
      failed_account_count: failed,
    };
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
    const account = await this.accountRepository.findOne({
      where: { companyId, id: accountId },
    });
    if (!account) throw new NotFoundException('Finance account not found.');
    const balance = await this.ledgerService.calculateBalance(
      companyId,
      accountId,
    );
    if (
      EmployeeFinanceMoney.toCents(balance.total) !==
      EmployeeFinanceMoney.toCents(account.outstandingTotal)
    ) {
      issues.push({
        code: 'ACCOUNT_BALANCE_DIFFERS_FROM_LEDGER',
        account_id: accountId,
      });
    }
    for (const [component, value] of Object.entries({
      principal: balance.principal,
      interest: balance.interest,
      fees: balance.fees,
    })) {
      if (EmployeeFinanceMoney.toCents(value) < 0n) {
        issues.push({
          code: 'NEGATIVE_LEDGER_BALANCE',
          account_id: accountId,
          component,
          amount: value,
        });
      }
    }
    const openInstallments = await this.installmentRepository.find({
      where: {
        companyId,
        accountId,
        status: In(OPEN_INSTALLMENT_STATUSES),
      },
    });
    if (
      activeAccountStatuses().includes(account.status) &&
      account.status !==
        EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT &&
      openInstallments.length === 0
    ) {
      issues.push({
        code: 'ACTIVE_ACCOUNT_HAS_NO_FUTURE_SCHEDULE',
        account_id: accountId,
      });
    }
    const ledgerEntries = this.ledgerRepository
      ? await this.ledgerRepository.find({ where: { companyId, accountId } })
      : [];
    const disbursed = ledgerEntries.some(
      (entry) =>
        entry.entryType ===
        EmployeeFinanceLedgerEntryTypeEnum.PRINCIPAL_DISBURSEMENT,
    );
    if (
      this.ledgerRepository &&
      disbursed &&
      EmployeeFinanceMoney.toCents(account.interestAmount) > 0n &&
      !ledgerEntries.some(
        (entry) =>
          entry.entryType ===
          EmployeeFinanceLedgerEntryTypeEnum.INTEREST_ACCRUAL,
      )
    ) {
      issues.push({
        code: 'INTEREST_NOT_ACCRUED',
        account_id: accountId,
        expected_interest: account.interestAmount,
      });
    }
    // What the schedule still expects must equal what the ledger says is
    // owed; a gap means a posting reached one side but not the other.
    if (
      (disbursed ||
        ledgerEntries.some((entry) => entry.sourceType === 'MIGRATION')) &&
      account.status !== EmployeeFinanceAccountStatusEnum.WRITTEN_OFF
    ) {
      const scheduleOwed = openInstallments.reduce(
        (sum, installment) => sum + installmentRemainder(installment).total,
        0n,
      );
      if (scheduleOwed !== EmployeeFinanceMoney.toCents(balance.total)) {
        issues.push({
          code: 'SCHEDULE_DIFFERS_FROM_LEDGER',
          account_id: accountId,
          schedule_owed: EmployeeFinanceMoney.fromCents(scheduleOwed),
          ledger_owed: balance.total,
        });
      }
    }
    const instructions = await this.instructionRepository.find({
      where: { companyId, accountId },
    });
    const postedByPayroll = instructions
      .filter(
        (instruction) =>
          instruction.status ===
          EmployeeFinancePayrollInstructionStatusEnum.POSTED,
      )
      .reduce(
        (sum, instruction) =>
          sum + EmployeeFinanceMoney.toCents(instruction.postedAmount),
        0n,
      );
    const payrollLedger = ledgerEntries
      .filter(
        (entry) =>
          entry.entryType ===
          EmployeeFinanceLedgerEntryTypeEnum.PAYROLL_REPAYMENT,
      )
      .reduce(
        (sum, entry) => sum + EmployeeFinanceMoney.toCents(entry.totalAmount),
        0n,
      );
    if (this.ledgerRepository && postedByPayroll !== payrollLedger) {
      issues.push({
        code: 'PAYROLL_POSTINGS_DIFFER_FROM_LEDGER',
        account_id: accountId,
        payroll_posted: EmployeeFinanceMoney.fromCents(postedByPayroll),
        ledger_payroll_credits: EmployeeFinanceMoney.fromCents(payrollLedger),
      });
    }
    for (const instruction of instructions) {
      const overcollected = recordValue(
        instruction.snapshot,
      ).overcollected_amount;
      if (overcollected) {
        issues.push({
          code: 'PAYROLL_OVERCOLLECTED',
          account_id: accountId,
          instruction_id: instruction.id,
          payroll_run_id: instruction.payrollRunId,
          amount: overcollected,
        });
      }
    }
    const activeInstructionPeriods = new Map<number, number>();
    for (const instruction of instructions) {
      if (
        instruction.status ===
          EmployeeFinancePayrollInstructionStatusEnum.RESERVED ||
        instruction.status === EmployeeFinancePayrollInstructionStatusEnum.OPEN
      ) {
        activeInstructionPeriods.set(
          instruction.installmentId,
          (activeInstructionPeriods.get(instruction.installmentId) ?? 0) + 1,
        );
      }
    }
    if (
      Array.from(activeInstructionPeriods.values()).some((count) => count > 1)
    ) {
      issues.push({
        code: 'PAYROLL_INSTRUCTION_INCLUDED_TWICE',
        account_id: accountId,
      });
    }
    return { account_id: accountId, issue_count: issues.length, issues };
  }

  /**
   * Books missing contractual interest on loans disbursed before interest
   * accrual existed. Dry run by default so Finance can review the list.
   */
  async backfillInterestAccruals(actor: AuthenticatedUser, dryRun = true) {
    const companyId = actor.companyId!;
    const accounts = await this.accountRepository.find({
      where: { companyId },
      order: { id: 'ASC' },
    });
    const candidates: Array<{
      account_id: number;
      account_no: string;
      interest: string;
    }> = [];
    for (const account of accounts) {
      const result = await this.reconcileAccount(companyId, account.id);
      if (
        result.issues.some((issue) => issue.code === 'INTEREST_NOT_ACCRUED')
      ) {
        candidates.push({
          account_id: account.id,
          account_no: account.accountNo,
          interest: account.interestAmount,
        });
        if (!dryRun) {
          await this.ledgerService.ensureInterestAccrued(companyId, account.id);
        }
      }
    }
    if (!dryRun && candidates.length && this.auditService) {
      await this.auditService.log({
        actor,
        action: 'finance.reconciliation.interest_backfilled',
        entityType: 'EMPLOYEE_FINANCE_RECONCILIATION',
        entityId: `${companyId}-${Date.now()}`,
        summary: { account_ids: candidates.map((item) => item.account_id) },
      });
    }
    return {
      dry_run: dryRun,
      account_count: candidates.length,
      accounts: candidates,
    };
  }
}
