import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { EmployeeCompensationVersion } from '../../employee-movements/entities/employee-compensation-version.entity';
import { EmployeeBankAccount } from '../../employees/entities/employee-bank-account.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { OffboardingRequest } from '../../offboarding/entities/offboarding-request.entity';
import { OffboardingSettlementItem } from '../../offboarding/entities/offboarding-settlement-item.entity';
import { OffboardingRequestStatusEnum } from '../../offboarding/enums/offboarding-request-status.enum';
import { OffboardingSettlementItemTypeEnum } from '../../offboarding/enums/offboarding-settlement-item-type.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import { EmployeeFinancePayrollInstructionService } from '../../employee-finance/services/employee-finance-core.services';
import { NotificationQueueService } from '../../../notifications/notification-queue.service';
import { SmsNotificationManagementService } from '../../../sms/sms-notification-management.service';
import {
  ApprovePayrollRunDto,
  CreatePayrollCalendarDto,
  CreatePayrollAccountingMappingDto,
  CreatePayrollComponentDto,
  CreatePayrollInputDto,
  CreatePayrollRunDto,
  CreateSalaryStructureDto,
  CreateStatutoryRuleDto,
  CreateStatutorySchemeDto,
  GeneratePayrollPeriodDto,
  PayrollQueryDto,
  UpsertEmployeePayrollProfileDto,
} from '../dto/payroll.dto';
import { EmployeePayrollProfile } from '../entities/employee-payroll-profile.entity';
import {
  PayrollAccountingMapping,
  PayrollCalendar,
  PayrollComponent,
  PayrollPeriod,
  SalaryStructure,
  SalaryStructureComponent,
  StatutoryRuleVersion,
  StatutoryScheme,
  StatutoryTaxBand,
} from '../entities/payroll-configuration.entities';
import {
  EmployeePayrollLineItem,
  EmployeePayrollResult,
  PayrollAuditLog,
  PayrollBankBatch,
  PayrollDeductionShortfall,
  PayrollFinalSettlement,
  PayrollInput,
  PayrollJournalBatch,
  PayrollResultAdjustment,
  PayrollRun,
  PayrollRunApproval,
  PayrollVarianceResult,
  Payslip,
} from '../entities/payroll-run.entities';
import {
  EmployeePayrollResultStatusEnum,
  PayrollApprovalDecisionEnum,
  PayrollApprovalStageEnum,
  PayrollCalculationMethodEnum,
  PayrollComponentTypeEnum,
  PayrollInputStatusEnum,
  PayrollOutputStatusEnum,
  PayrollPeriodStatusEnum,
  PayrollRunStatusEnum,
  PayrollRunTypeEnum,
  PayrollTaxTreatmentEnum,
  StatutorySchemeTypeEnum,
} from '../payroll.enums';
import { PayrollMoney } from './payroll-money.util';

type CalculatedPayrollEmployee = {
  employee: Employee;
  profile: EmployeePayrollProfile;
  compensation: EmployeeCompensationVersion;
  bank: EmployeeBankAccount | null;
  lineItems: Array<Partial<EmployeePayrollLineItem>>;
  result: Partial<EmployeePayrollResult>;
};

function clean(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashSnapshot(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function addDays(date: Date, days: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInclusive(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86400000) + 1);
}

@Injectable()
export class PayrollAuditService {
  constructor(
    @InjectRepository(PayrollAuditLog)
    private readonly repository: Repository<PayrollAuditLog>,
    private readonly hrAccessService: HrAccessService,
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
export class EmployeePayrollProfileService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(EmployeePayrollProfile)
    private readonly repository: Repository<EmployeePayrollProfile>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeBankAccount)
    private readonly bankRepository: Repository<EmployeeBankAccount>,
  ) {}

  async upsert(actor: AuthenticatedUser, dto: UpsertEmployeePayrollProfileDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.employeeRepository.findOne({
      where: { id: dto.employee_id, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');

    if (dto.primary_bank_account_id) {
      const bank = await this.bankRepository.findOne({
        where: { id: dto.primary_bank_account_id, employee_id: dto.employee_id },
      });
      if (!bank) throw new BadRequestException('Primary bank account not found.');
    }

    const existing = await this.repository.findOne({
      where: { companyId, employeeId: dto.employee_id },
    });
    const profile =
      existing ??
      this.repository.create({
        companyId,
        employeeId: dto.employee_id,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
      });

    profile.payrollNumber = dto.payroll_number.trim();
    profile.taxpayerIdentificationNumber = clean(dto.taxpayer_identification_number);
    profile.socialSecuritySchemeCode = clean(dto.social_security_scheme_code);
    profile.socialSecurityNumber = clean(dto.social_security_number);
    profile.healthInsuranceSchemeCode = clean(dto.health_insurance_scheme_code);
    profile.healthInsuranceNumber = clean(dto.health_insurance_number);
    profile.taxResidencyCode = dto.tax_residency_code?.trim() ?? 'RESIDENT';
    profile.employmentTaxCategory =
      dto.employment_tax_category?.trim() ?? 'PRIMARY_EMPLOYMENT';
    profile.paymentMethod = dto.payment_method?.trim() ?? 'BANK_TRANSFER';
    profile.primaryBankAccountId = dto.primary_bank_account_id ?? null;
    profile.currency = (dto.currency ?? 'TZS').trim().toUpperCase();
    profile.payFrequency = dto.pay_frequency?.trim() ?? 'MONTHLY';
    profile.payrollEnabled = dto.payroll_enabled ?? true;
    profile.payrollHold = dto.payroll_hold ?? false;
    profile.payrollHoldReason = clean(dto.payroll_hold_reason);
    profile.effectiveFrom = dto.effective_from;
    profile.effectiveTo = dto.effective_to ?? null;
    profile.updatedByCompanyUserId = actor.companyMembershipId ?? null;

    const saved = await this.repository.save(profile);
    await this.auditService.log({
      actor,
      action: existing ? 'payroll.profile.updated' : 'payroll.profile.created',
      entityType: 'EMPLOYEE_PAYROLL_PROFILE',
      entityId: saved.id,
      summary: { employee_id: saved.employeeId },
    });
    return this.mask(saved);
  }

  async list(actor: AuthenticatedUser, query: PayrollQueryDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const qb = this.repository
      .createQueryBuilder('profile')
      .where('profile.companyId = :companyId', { companyId })
      .orderBy('profile.id', 'DESC');
    if (query.employee_id) {
      qb.andWhere('profile.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    return (await qb.getMany()).map((item) => this.mask(item));
  }

  private mask(profile: EmployeePayrollProfile) {
    const maskValue = (value: string | null) =>
      value ? `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}` : null;
    return {
      ...profile,
      taxpayerIdentificationNumber: maskValue(profile.taxpayerIdentificationNumber),
      socialSecurityNumber: maskValue(profile.socialSecurityNumber),
      healthInsuranceNumber: maskValue(profile.healthInsuranceNumber),
    };
  }
}

@Injectable()
export class PayrollConfigurationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(PayrollComponent)
    private readonly componentRepository: Repository<PayrollComponent>,
    @InjectRepository(SalaryStructure)
    private readonly structureRepository: Repository<SalaryStructure>,
    @InjectRepository(SalaryStructureComponent)
    private readonly structureComponentRepository: Repository<SalaryStructureComponent>,
    @InjectRepository(PayrollCalendar)
    private readonly calendarRepository: Repository<PayrollCalendar>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(StatutoryScheme)
    private readonly schemeRepository: Repository<StatutoryScheme>,
    @InjectRepository(StatutoryRuleVersion)
    private readonly ruleRepository: Repository<StatutoryRuleVersion>,
    @InjectRepository(StatutoryTaxBand)
    private readonly taxBandRepository: Repository<StatutoryTaxBand>,
    @InjectRepository(PayrollAccountingMapping)
    private readonly accountingMappingRepository: Repository<PayrollAccountingMapping>,
  ) {}

  async createComponent(actor: AuthenticatedUser, dto: CreatePayrollComponentDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const component = await this.componentRepository.save(
      this.componentRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        componentType: dto.component_type,
        frequency: dto.frequency,
        calculationMethod: dto.calculation_method,
        taxTreatment: dto.tax_treatment,
        taxablePercentage: dto.taxable_percentage ?? '100',
        pensionable: dto.pensionable ?? false,
        healthInsuranceApplicable: dto.health_insurance_applicable ?? false,
        includedInGross: dto.included_in_gross ?? true,
        includedInNet: dto.included_in_net ?? true,
        includedInEmployerCost: dto.included_in_employer_cost ?? true,
        subjectToProration: dto.subject_to_proration ?? true,
        allowManualInput: dto.allow_manual_input ?? false,
        calculationOrder: dto.calculation_order ?? 100,
        calculationConfiguration: dto.calculation_configuration ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.component.created',
      entityType: 'PAYROLL_COMPONENT',
      entityId: component.id,
      summary: { code: component.code },
    });
    return component;
  }

  listComponents(actor: AuthenticatedUser) {
    return this.componentRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { calculationOrder: 'ASC', code: 'ASC' },
    });
  }

  async createStructure(actor: AuthenticatedUser, dto: CreateSalaryStructureDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const latest = await this.structureRepository.findOne({
      where: { companyId, code: dto.code.trim().toUpperCase() },
      order: { versionNumber: 'DESC' },
    });
    const structure = await this.structureRepository.save(
      this.structureRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        currency: (dto.currency ?? 'TZS').toUpperCase(),
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
      }),
    );
    await this.structureComponentRepository.save(
      dto.components.map((item) =>
        this.structureComponentRepository.create({
          companyId,
          salaryStructureId: structure.id,
          componentId: item.component_id,
          defaultAmount: item.default_amount ?? '0',
          defaultRate: item.default_rate ?? null,
          calculationOrder: item.calculation_order ?? 100,
          configuration: item.configuration ?? null,
        }),
      ),
    );
    return this.getStructure(actor, structure.id);
  }

  async getStructure(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const structure = await this.structureRepository.findOne({
      where: { id, companyId },
    });
    if (!structure) throw new NotFoundException('Salary structure not found.');
    const components = await this.structureComponentRepository.find({
      where: { salaryStructureId: id, companyId },
      order: { calculationOrder: 'ASC', id: 'ASC' },
    });
    return { ...structure, components };
  }

  listStructures(actor: AuthenticatedUser) {
    return this.structureRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { code: 'ASC', versionNumber: 'DESC' },
    });
  }

  async createCalendar(actor: AuthenticatedUser, dto: CreatePayrollCalendarDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const calendar = await this.calendarRepository.save(
      this.calendarRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        cutoffDay:
          dto.cutoff_day ??
          this.configService.get<number>('PAYROLL_DEFAULT_CUTOFF_DAY', 20),
        paymentDay:
          dto.payment_day ??
          this.configService.get<number>('PAYROLL_DEFAULT_PAYMENT_DAY', 28),
        timezone:
          dto.timezone ??
          this.configService.get<string>(
            'PAYROLL_DEFAULT_TIMEZONE',
            'Africa/Dar_es_Salaam',
          ),
        currency:
          dto.currency ??
          this.configService.get<string>('PAYROLL_DEFAULT_CURRENCY', 'TZS'),
        isDefault: dto.is_default ?? false,
      }),
    );
    return calendar;
  }

  listCalendars(actor: AuthenticatedUser) {
    return this.calendarRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { isDefault: 'DESC', code: 'ASC' },
    });
  }

  async generatePeriod(actor: AuthenticatedUser, dto: GeneratePayrollPeriodDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const calendar = await this.calendarRepository.findOne({
      where: { id: dto.payroll_calendar_id, companyId },
    });
    if (!calendar) throw new NotFoundException('Payroll calendar not found.');

    const start = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const end = new Date(Date.UTC(dto.year, dto.month, 0));
    const cutoff = new Date(Date.UTC(dto.year, dto.month - 1, calendar.cutoffDay));
    const payment = new Date(Date.UTC(dto.year, dto.month - 1, calendar.paymentDay));
    const periodCode = `${calendar.code}-${dto.year}${String(dto.month).padStart(2, '0')}`;

    return this.periodRepository.save(
      this.periodRepository.create({
        companyId,
        payrollCalendarId: calendar.id,
        periodCode,
        periodYear: dto.year,
        periodMonth: dto.month,
        startDate: dateString(start),
        endDate: dateString(end),
        cutoffDate: dateString(cutoff > end ? end : cutoff),
        paymentDate: dateString(payment > end ? end : payment),
      }),
    );
  }

  listPeriods(actor: AuthenticatedUser) {
    return this.periodRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { startDate: 'DESC' },
    });
  }

  async createScheme(actor: AuthenticatedUser, dto: CreateStatutorySchemeDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.schemeRepository.save(
      this.schemeRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        schemeType: dto.scheme_type,
        jurisdiction: dto.jurisdiction ?? 'TZ',
      }),
    );
  }

  listSchemes(actor: AuthenticatedUser) {
    return this.schemeRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { schemeType: 'ASC', code: 'ASC' },
    });
  }

  async createRule(actor: AuthenticatedUser, dto: CreateStatutoryRuleDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const scheme = await this.schemeRepository.findOne({
      where: { id: dto.scheme_id, companyId },
    });
    if (!scheme) throw new NotFoundException('Statutory scheme not found.');
    const rule = await this.ruleRepository.save(
      this.ruleRepository.create({
        companyId,
        schemeId: scheme.id,
        versionNumber: dto.version_number,
        calculationMethod: dto.calculation_method,
        employeeRate: dto.employee_rate ?? null,
        employerRate: dto.employer_rate ?? null,
        maximumBasis: dto.maximum_basis ?? null,
        deductEmployeeBeforeTax: dto.deduct_employee_before_tax ?? false,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        configuration: dto.configuration ?? null,
        status: 'APPROVED',
        approvedByCompanyUserId: actor.companyMembershipId ?? null,
        approvedAt: new Date(),
      }),
    );
    if (dto.bands?.length) {
      await this.taxBandRepository.save(
        dto.bands.map((band) =>
          this.taxBandRepository.create({
            ruleVersionId: rule.id,
            lowerLimit: band.lower_limit,
            upperLimit: band.upper_limit ?? null,
            baseTax: band.base_tax ?? '0',
            ratePercent: band.rate_percent,
            sortOrder: band.sort_order ?? 1,
          }),
        ),
      );
    }
    return rule;
  }

  async createAccountingMapping(
    actor: AuthenticatedUser,
    dto: CreatePayrollAccountingMappingDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const componentCode = dto.component_code.trim().toUpperCase();
    const existing = await this.accountingMappingRepository.findOne({
      where: { companyId, componentCode },
    });
    const mapping =
      existing ??
      this.accountingMappingRepository.create({
        companyId,
        componentCode,
      });
    mapping.debitAccountCode = dto.debit_account_code.trim();
    mapping.creditAccountCode = dto.credit_account_code.trim();
    mapping.dimensions = dto.dimensions ?? null;
    return this.accountingMappingRepository.save(mapping);
  }

  listAccountingMappings(actor: AuthenticatedUser) {
    return this.accountingMappingRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { componentCode: 'ASC' },
    });
  }
}

@Injectable()
export class PayrollInputService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollInput)
    private readonly repository: Repository<PayrollInput>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreatePayrollInputDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: dto.payroll_period_id, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');
    if ([PayrollPeriodStatusEnum.LOCKED, PayrollPeriodStatusEnum.CLOSED].includes(period.status)) {
      throw new ConflictException('Locked payroll periods cannot accept inputs.');
    }
    return this.repository.save(
      this.repository.create({
        companyId,
        payrollPeriodId: period.id,
        employeeId: dto.employee_id ?? null,
        componentCode: dto.component_code.trim().toUpperCase(),
        sourceModule: dto.source_module ?? 'MANUAL',
        sourceReference: dto.source_reference ?? null,
        amount: dto.amount,
        quantity: dto.quantity ?? null,
        rate: dto.rate ?? null,
        currency: dto.currency ?? 'TZS',
        status: dto.status ?? PayrollInputStatusEnum.DRAFT,
        payload: dto.payload ?? null,
      }),
    );
  }

  list(actor: AuthenticatedUser, query: PayrollQueryDto) {
    const where: Record<string, unknown> = {
      companyId: this.hrAccessService.ensureActorCompanyId(actor),
    };
    if (query.payroll_period_id) where.payrollPeriodId = query.payroll_period_id;
    if (query.employee_id) where.employeeId = query.employee_id;
    if (query.status) where.status = query.status;
    return this.repository.find({ where, order: { id: 'DESC' } });
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const input = await this.repository.findOne({ where: { id, companyId } });
    if (!input) throw new NotFoundException('Payroll input not found.');
    input.status = PayrollInputStatusEnum.APPROVED;
    input.approvedByCompanyUserId = actor.companyMembershipId ?? null;
    input.approvedAt = new Date();
    return this.repository.save(input);
  }
}

@Injectable()
export class PayrollProrationService {
  calculateRatio(args: {
    periodStart: string;
    periodEnd: string;
    hireDate?: string | null;
    exitDate?: string | null;
    compensationEffectiveFrom?: string | null;
    method?: string;
  }) {
    const effectiveStart = [
      args.periodStart,
      args.hireDate,
      args.compensationEffectiveFrom,
    ]
      .filter(Boolean)
      .sort()
      .pop()!;
    const effectiveEnd = [args.periodEnd, args.exitDate].filter(Boolean).sort()[0]!;

    if (effectiveEnd < effectiveStart) {
      return { numerator: 0, denominator: 1 };
    }

    const denominator =
      args.method === 'FIXED_30' ? 30 : daysInclusive(args.periodStart, args.periodEnd);
    const numerator = Math.min(denominator, daysInclusive(effectiveStart, effectiveEnd));

    return { numerator, denominator };
  }

  calculateFactor(args: {
    periodStart: string;
    periodEnd: string;
    hireDate?: string | null;
    exitDate?: string | null;
    compensationEffectiveFrom?: string | null;
    method?: string;
  }) {
    const ratio = this.calculateRatio(args);
    return Number((ratio.numerator / ratio.denominator).toFixed(8));
  }
}

@Injectable()
export class ProgressiveTaxService {
  calculate(taxableIncome: string, bands: StatutoryTaxBand[]) {
    const taxable = PayrollMoney.toCents(taxableIncome);
    const band = [...bands]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((item) => {
        const lower = PayrollMoney.toCents(item.lowerLimit);
        const upper =
          item.upperLimit === null ? null : PayrollMoney.toCents(item.upperLimit);
        return taxable >= lower && (upper === null || taxable <= upper);
      });

    if (!band) return '0.00';
    const excess = PayrollMoney.fromCents(
      taxable - PayrollMoney.toCents(band.lowerLimit),
    );
    return PayrollMoney.add(
      band.baseTax,
      PayrollMoney.multiplyPercent(excess, band.ratePercent),
    );
  }
}

@Injectable()
export class StatutoryCalculationService {
  constructor(
    private readonly progressiveTaxService: ProgressiveTaxService,
    @InjectRepository(StatutoryScheme)
    private readonly schemeRepository: Repository<StatutoryScheme>,
    @InjectRepository(StatutoryRuleVersion)
    private readonly ruleRepository: Repository<StatutoryRuleVersion>,
    @InjectRepository(StatutoryTaxBand)
    private readonly taxBandRepository: Repository<StatutoryTaxBand>,
  ) {}

  async getApprovedRules(companyId: number, date: string) {
    const schemes = await this.schemeRepository.find({
      where: { companyId, status: 'ACTIVE' },
    });
    const rules: Array<{ scheme: StatutoryScheme; rule: StatutoryRuleVersion; bands: StatutoryTaxBand[] }> = [];
    for (const scheme of schemes) {
      const rule = await this.ruleRepository
        .createQueryBuilder('rule')
        .where('rule.companyId = :companyId', { companyId })
        .andWhere('rule.schemeId = :schemeId', { schemeId: scheme.id })
        .andWhere('rule.status = :status', { status: 'APPROVED' })
        .andWhere('rule.effectiveFrom <= :date', { date })
        .andWhere('(rule.effectiveTo IS NULL OR rule.effectiveTo >= :date)', {
          date,
        })
        .orderBy('rule.effectiveFrom', 'DESC')
        .addOrderBy('rule.versionNumber', 'DESC')
        .getOne();
      if (rule) {
        const bands = await this.taxBandRepository.find({
          where: { ruleVersionId: rule.id },
          order: { sortOrder: 'ASC' },
        });
        rules.push({ scheme, rule, bands });
      }
    }
    return rules;
  }

  calculateTax(taxableIncome: string, rule: StatutoryRuleVersion, bands: StatutoryTaxBand[]) {
    if (rule.calculationMethod === PayrollCalculationMethodEnum.PROGRESSIVE_BANDS) {
      return this.progressiveTaxService.calculate(taxableIncome, bands);
    }
    if (rule.employeeRate) {
      return PayrollMoney.multiplyPercent(taxableIncome, rule.employeeRate);
    }
    return '0.00';
  }
}

@Injectable()
export class EmployeePayrollCalculationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prorationService: PayrollProrationService,
    private readonly statutoryService: StatutoryCalculationService,
    private readonly employeeFinancePayrollInstructionService: EmployeeFinancePayrollInstructionService,
    @InjectRepository(EmployeePayrollProfile)
    private readonly profileRepository: Repository<EmployeePayrollProfile>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeBankAccount)
    private readonly bankRepository: Repository<EmployeeBankAccount>,
    @InjectRepository(EmployeeCompensationVersion)
    private readonly compensationRepository: Repository<EmployeeCompensationVersion>,
    @InjectRepository(PayrollComponent)
    private readonly componentRepository: Repository<PayrollComponent>,
    @InjectRepository(PayrollInput)
    private readonly inputRepository: Repository<PayrollInput>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
  ) {}

  async calculateRun(companyId: number, period: PayrollPeriod, run: PayrollRun) {
    const profiles = await this.profileRepository.find({
      where: { companyId, payrollEnabled: true, payrollHold: false },
      order: { employeeId: 'ASC' },
    });
    const components = await this.componentRepository.find({
      where: { companyId, status: 'ACTIVE' },
      order: { calculationOrder: 'ASC', code: 'ASC' },
    });
    const componentMap = new Map(components.map((item) => [item.code, item]));
    const rules = await this.statutoryService.getApprovedRules(companyId, period.endDate);

    const outputs: CalculatedPayrollEmployee[] = [];
    for (const profile of profiles) {
      const employee = await this.employeeRepository.findOne({
        where: { id: profile.employeeId, company_id: companyId },
      });
      if (!employee) continue;
      const compensation = await this.findCompensation(companyId, employee.id, period);
      if (!compensation) continue;

      const result = await this.calculateEmployee({
        companyId,
        period,
        run,
        employee,
        profile,
        compensation,
        components,
        componentMap,
        rules,
      });
      outputs.push(result);
    }
    return outputs;
  }

  private async calculateEmployee(args: {
    companyId: number;
    period: PayrollPeriod;
    run: PayrollRun;
    employee: Employee;
    profile: EmployeePayrollProfile;
    compensation: EmployeeCompensationVersion;
    components: PayrollComponent[];
    componentMap: Map<string, PayrollComponent>;
    rules: Array<{ scheme: StatutoryScheme; rule: StatutoryRuleVersion; bands: StatutoryTaxBand[] }>;
  }) {
    const { companyId, period, employee, profile, compensation, components } = args;
    const prorationArgs = {
      periodStart: period.startDate,
      periodEnd: period.endDate,
      hireDate: employee.hire_date,
      exitDate: employee.exit_date,
      compensationEffectiveFrom: compensation.effectiveFrom,
      method: this.configService.get<string>(
        'PAYROLL_DEFAULT_PRORATION_METHOD',
        'CALENDAR_DAYS',
      ),
    };
    const factor = this.prorationService.calculateFactor(prorationArgs);
    const prorationRatio = this.prorationService.calculateRatio(prorationArgs);
    const basicPay = PayrollMoney.multiplyRatio(
      compensation.baseSalary,
      prorationRatio.numerator,
      prorationRatio.denominator,
    );
    const bank = profile.primaryBankAccountId
      ? await this.bankRepository.findOne({ where: { id: profile.primaryBankAccountId } })
      : await this.bankRepository.findOne({
          where: { employee_id: employee.id, is_primary: true },
        });
    const inputs = await this.inputRepository
      .createQueryBuilder('input')
      .where('input.companyId = :companyId', { companyId })
      .andWhere('input.payrollPeriodId = :payrollPeriodId', {
        payrollPeriodId: period.id,
      })
      .andWhere('input.status = :status', {
        status: PayrollInputStatusEnum.APPROVED,
      })
      .andWhere('(input.employeeId = :employeeId OR input.employeeId IS NULL)', {
        employeeId: employee.id,
      })
      .getMany();
    const financeInstructions =
      await this.employeeFinancePayrollInstructionService.reserveForPayrollRun(
        companyId,
        period.id,
        args.run.id,
        employee.id,
      );

    const leaveWithoutPayDays = await this.calculateLwpDays(companyId, employee.id, period);
    const lwpDeduction =
      leaveWithoutPayDays > 0
        ? PayrollMoney.multiplyRatio(
            compensation.baseSalary,
            leaveWithoutPayDays,
            daysInclusive(period.startDate, period.endDate),
          )
        : '0.00';

    const lineItems: Array<Partial<EmployeePayrollLineItem>> = [
      {
        componentCode: 'BASIC',
        componentName: 'Basic salary',
        componentType: PayrollComponentTypeEnum.EARNING,
        amount: basicPay,
        taxableAmount: basicPay,
        employerAmount: '0.00',
        calculationOrder: 1,
        sourceType: 'COMPENSATION',
        sourceReference: String(compensation.id),
        calculationSnapshot: { factor, base_salary: compensation.baseSalary },
      },
    ];

    if (PayrollMoney.toCents(lwpDeduction) > 0n) {
      lineItems.push({
        componentCode: 'LWP',
        componentName: 'Leave without pay',
        componentType: PayrollComponentTypeEnum.DEDUCTION,
        amount: lwpDeduction,
        taxableAmount: '0.00',
        employerAmount: '0.00',
        calculationOrder: 20,
        sourceType: 'LEAVE',
        sourceReference: `${employee.id}:${period.id}`,
        calculationSnapshot: { leave_without_pay_days: leaveWithoutPayDays },
      });
    }

    for (const input of inputs) {
      const component = args.componentMap.get(input.componentCode);
      const componentType = component?.componentType ?? PayrollComponentTypeEnum.EARNING;
      const taxableAmount = this.taxableAmount(input.amount, component);
      lineItems.push({
        componentCode: input.componentCode,
        componentName: component?.name ?? input.componentCode,
        componentType,
        amount: input.amount,
        taxableAmount,
        employerAmount:
          componentType === PayrollComponentTypeEnum.EMPLOYER_CONTRIBUTION ||
          componentType === PayrollComponentTypeEnum.EMPLOYER_LEVY
            ? input.amount
            : '0.00',
        calculationOrder: component?.calculationOrder ?? 100,
        sourceType: input.sourceModule,
        sourceReference: input.sourceReference ?? String(input.id),
        calculationSnapshot: input.payload,
      });
    }

    const pensionableGross = this.sumLines(lineItems, (item) => {
      const component = args.componentMap.get(item.componentCode!);
      return item.componentType === PayrollComponentTypeEnum.EARNING && (component?.pensionable ?? true);
    });
    const healthGross = this.sumLines(lineItems, (item) => {
      const component = args.componentMap.get(item.componentCode!);
      return item.componentType === PayrollComponentTypeEnum.EARNING && (component?.healthInsuranceApplicable ?? false);
    });

    let pretaxDeductions = '0.00';
    for (const statutory of args.rules) {
      if (
        statutory.scheme.schemeType !== StatutorySchemeTypeEnum.PENSION &&
        statutory.scheme.schemeType !== StatutorySchemeTypeEnum.HEALTH_INSURANCE &&
        statutory.scheme.schemeType !== StatutorySchemeTypeEnum.EMPLOYER_LEVY
      ) {
        continue;
      }
      const rawBasis =
        statutory.scheme.schemeType === StatutorySchemeTypeEnum.HEALTH_INSURANCE
          ? healthGross
          : pensionableGross;
      const basis = statutory.rule.maximumBasis
        ? PayrollMoney.min(rawBasis, statutory.rule.maximumBasis)
        : rawBasis;
      const employeeAmount = statutory.rule.employeeRate
        ? PayrollMoney.multiplyPercent(basis, statutory.rule.employeeRate)
        : '0.00';
      const employerAmount = statutory.rule.employerRate
        ? PayrollMoney.multiplyPercent(basis, statutory.rule.employerRate)
        : '0.00';
      if (PayrollMoney.toCents(employeeAmount) > 0n) {
        lineItems.push({
          componentCode: `${statutory.scheme.code}_EE`,
          componentName: `${statutory.scheme.name} employee`,
          componentType: PayrollComponentTypeEnum.DEDUCTION,
          amount: employeeAmount,
          taxableAmount: '0.00',
          employerAmount: '0.00',
          calculationOrder: 500,
          sourceType: 'STATUTORY',
          sourceReference: String(statutory.rule.id),
          calculationSnapshot: { basis, rate: statutory.rule.employeeRate },
        });
        if (statutory.rule.deductEmployeeBeforeTax) {
          pretaxDeductions = PayrollMoney.add(pretaxDeductions, employeeAmount);
        }
      }
      if (PayrollMoney.toCents(employerAmount) > 0n) {
        lineItems.push({
          componentCode: `${statutory.scheme.code}_ER`,
          componentName: `${statutory.scheme.name} employer`,
          componentType:
            statutory.scheme.schemeType === StatutorySchemeTypeEnum.EMPLOYER_LEVY
              ? PayrollComponentTypeEnum.EMPLOYER_LEVY
              : PayrollComponentTypeEnum.EMPLOYER_CONTRIBUTION,
          amount: '0.00',
          taxableAmount: '0.00',
          employerAmount,
          calculationOrder: 510,
          sourceType: 'STATUTORY',
          sourceReference: String(statutory.rule.id),
          calculationSnapshot: { basis, rate: statutory.rule.employerRate },
        });
      }
    }

    const taxableBeforeTax = PayrollMoney.add(
      this.sumLines(lineItems, (item) => PayrollMoney.toCents(item.taxableAmount ?? '0') > 0n),
      PayrollMoney.fromCents(-PayrollMoney.toCents(pretaxDeductions)),
    );
    const payeRule = args.rules.find(
      (item) => item.scheme.schemeType === StatutorySchemeTypeEnum.PAYE,
    );
    if (payeRule) {
      const paye = this.statutoryService.calculateTax(
        taxableBeforeTax,
        payeRule.rule,
        payeRule.bands,
      );
      if (PayrollMoney.toCents(paye) > 0n) {
        lineItems.push({
          componentCode: payeRule.scheme.code,
          componentName: payeRule.scheme.name,
          componentType: PayrollComponentTypeEnum.DEDUCTION,
          amount: paye,
          taxableAmount: '0.00',
          employerAmount: '0.00',
          calculationOrder: 900,
          sourceType: 'STATUTORY',
          sourceReference: String(payeRule.rule.id),
          calculationSnapshot: { taxable_income: taxableBeforeTax },
        });
      }
    }

    for (const instruction of financeInstructions) {
      lineItems.push({
        componentCode: instruction.componentCode,
        componentName:
          instruction.componentCode === 'SALARY_ADVANCE'
            ? 'Salary advance repayment'
            : 'Staff loan repayment',
        componentType: PayrollComponentTypeEnum.DEDUCTION,
        amount: instruction.reservedAmount,
        taxableAmount: '0.00',
        employerAmount: '0.00',
        calculationOrder: 950,
        sourceType: 'EMPLOYEE_FINANCE',
        sourceReference: String(instruction.id),
        calculationSnapshot: instruction.snapshot,
      });
    }

    const gross = this.sumLines(lineItems, (item) =>
      [
        PayrollComponentTypeEnum.EARNING,
        PayrollComponentTypeEnum.REIMBURSEMENT,
        PayrollComponentTypeEnum.TAXABLE_BENEFIT,
      ].includes(item.componentType as PayrollComponentTypeEnum),
    );
    const taxable = this.sumLines(lineItems, (item) => PayrollMoney.toCents(item.taxableAmount ?? '0') > 0n);
    const deductions = this.sumLines(
      lineItems,
      (item) => item.componentType === PayrollComponentTypeEnum.DEDUCTION,
    );
    const employerContributions = this.sumLines(lineItems, (item) =>
      [
        PayrollComponentTypeEnum.EMPLOYER_CONTRIBUTION,
        PayrollComponentTypeEnum.EMPLOYER_LEVY,
      ].includes(item.componentType as PayrollComponentTypeEnum),
      'employerAmount',
    );
    const netPay = PayrollMoney.add(
      gross,
      PayrollMoney.fromCents(-PayrollMoney.toCents(deductions)),
    );
    const employerCost = PayrollMoney.add(gross, employerContributions);
    const warnings = await this.buildWarnings(companyId, employee.id, period, bank);
    const calculationSnapshot = {
      period: period.periodCode,
      proration_factor: factor,
      leave_without_pay_days: leaveWithoutPayDays,
      line_count: lineItems.length,
      statutory_rule_ids: args.rules.map((item) => item.rule.id),
    };
    const inputSnapshot = {
      input_ids: inputs.map((item) => item.id),
      employee_finance_instruction_ids: financeInstructions.map((item) => item.id),
    };
    const resultPayload = {
      employee_id: employee.id,
      gross,
      taxable,
      deductions,
      employerContributions,
      netPay,
      employerCost,
      calculationSnapshot,
      inputSnapshot,
      lineItems,
    };
    const calculationHash = hashSnapshot(resultPayload);
    return {
      employee,
      profile,
      compensation,
      bank,
      lineItems,
      result: {
        status:
          warnings.length > 0
            ? EmployeePayrollResultStatusEnum.WARNING
            : EmployeePayrollResultStatusEnum.CALCULATED,
        employeeSnapshot: this.employeeSnapshot(employee),
        compensationSnapshot: { ...compensation },
        bankAccountSnapshot: bank ? this.bankSnapshot(bank) : null,
        statutorySnapshot: { rule_ids: args.rules.map((item) => item.rule.id) },
        inputSnapshot,
        calculationSnapshot,
        grossPay: gross,
        taxablePay: taxable,
        employeeDeductions: deductions,
        employerContributions,
        netPay,
        employerCost,
        calculationHash,
        warnings,
      },
    };
  }

  private async findCompensation(companyId: number, employeeId: number, period: PayrollPeriod) {
    return this.compensationRepository
      .createQueryBuilder('compensation')
      .where('compensation.companyId = :companyId', { companyId })
      .andWhere('compensation.employeeId = :employeeId', { employeeId })
      .andWhere('compensation.effectiveFrom <= :periodEnd', {
        periodEnd: period.endDate,
      })
      .andWhere(
        '(compensation.effectiveTo IS NULL OR compensation.effectiveTo >= :periodStart)',
        { periodStart: period.startDate },
      )
      .andWhere('compensation.status IN (:...statuses)', {
        statuses: ['ACTIVE', 'SCHEDULED'],
      })
      .orderBy('compensation.effectiveFrom', 'DESC')
      .getOne();
  }

  private async calculateLwpDays(companyId: number, employeeId: number, period: PayrollPeriod) {
    const leaves = await this.leaveRepository
      .createQueryBuilder('leaveRequest')
      .leftJoinAndSelect('leaveRequest.leave_type', 'leaveType')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leaveRequest.start_date <= :periodEnd', { periodEnd: period.endDate })
      .andWhere('leaveRequest.end_date >= :periodStart', { periodStart: period.startDate })
      .getMany();
    return leaves.reduce((sum, leave) => {
      const type = leave.leave_type as unknown as { is_paid?: boolean; paid_percentage?: string };
      if (type?.is_paid !== false) return sum;
      const start = leave.start_date > period.startDate ? leave.start_date : period.startDate;
      const end = leave.end_date < period.endDate ? leave.end_date : period.endDate;
      return sum + daysInclusive(start, end);
    }, 0);
  }

  private taxableAmount(amount: string, component?: PayrollComponent) {
    if (!component) return amount;
    switch (component.taxTreatment) {
      case PayrollTaxTreatmentEnum.NON_TAXABLE:
      case PayrollTaxTreatmentEnum.TAX_EXEMPT:
        return '0.00';
      case PayrollTaxTreatmentEnum.PARTIALLY_TAXABLE:
        return PayrollMoney.multiplyPercent(amount, component.taxablePercentage);
      default:
        return amount;
    }
  }

  private sumLines(
    lineItems: Array<Partial<EmployeePayrollLineItem>>,
    predicate: (item: Partial<EmployeePayrollLineItem>) => boolean,
    field: 'amount' | 'employerAmount' | 'taxableAmount' = 'amount',
  ) {
    return PayrollMoney.fromCents(
      lineItems
        .filter(predicate)
        .reduce((sum, item) => sum + PayrollMoney.toCents(item[field] ?? '0'), 0n),
    );
  }

  private async buildWarnings(
    companyId: number,
    employeeId: number,
    period: PayrollPeriod,
    bank: EmployeeBankAccount | null,
  ) {
    const warnings: Record<string, unknown>[] = [];
    if (!bank) warnings.push({ code: 'MISSING_BANK_ACCOUNT' });
    if (bank && bank.verification_status !== 'VERIFIED') {
      warnings.push({ code: 'BANK_ACCOUNT_NOT_VERIFIED' });
    }
    const unfinalizedAttendance = await this.attendanceRepository.count({
      where: { companyId, employeeId, finalizedAt: IsNull() },
    });
    if (unfinalizedAttendance > 0) {
      warnings.push({ code: 'UNFINALIZED_ATTENDANCE', count: unfinalizedAttendance });
    }
    return warnings;
  }

  private employeeSnapshot(employee: Employee) {
    return {
      id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      branch_id: employee.primary_branch_id,
      department_id: employee.primary_department_id,
      position_id: employee.primary_position_id,
      grade_id: employee.grade_id,
      cost_center_id: employee.cost_center_id,
      employment_type: employee.employment_type,
      hire_date: employee.hire_date,
      exit_date: employee.exit_date,
    };
  }

  private bankSnapshot(bank: EmployeeBankAccount) {
    return {
      id: bank.id,
      bank_name: bank.bank_name,
      bank_code: bank.bank_code,
      bank_branch_code: bank.bank_branch_code,
      account_name: bank.account_name,
      account_number_masked: bank.account_number
        ? `${'*'.repeat(Math.max(bank.account_number.length - 4, 0))}${bank.account_number.slice(-4)}`
        : null,
      account_currency: bank.account_currency,
      verification_status: bank.verification_status,
    };
  }
}

@Injectable()
export class PayrollRunService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly calculationService: EmployeePayrollCalculationService,
    private readonly employeeFinancePayrollInstructionService: EmployeeFinancePayrollInstructionService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineItemRepository: Repository<EmployeePayrollLineItem>,
    @InjectRepository(PayrollRunApproval)
    private readonly approvalRepository: Repository<PayrollRunApproval>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreatePayrollRunDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: dto.payroll_period_id, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');
    const count = await this.runRepository.count({ where: { companyId } });
    const run = await this.runRepository.save(
      this.runRepository.create({
        companyId,
        payrollPeriodId: period.id,
        runNo: `PR-${companyId}-${String(count + 1).padStart(6, '0')}`,
        runType: dto.run_type ?? PayrollRunTypeEnum.REGULAR,
        parentRunId: dto.parent_run_id ?? null,
        offboardingRequestId: dto.offboarding_request_id ?? null,
        createdByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.run.created',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
    });
    return run;
  }

  list(actor: AuthenticatedUser, query: PayrollQueryDto) {
    const where: Record<string, unknown> = {
      companyId: this.hrAccessService.ensureActorCompanyId(actor),
    };
    if (query.payroll_period_id) where.payrollPeriodId = query.payroll_period_id;
    if (query.status) where.status = query.status;
    return this.runRepository.find({ where, order: { id: 'DESC' } });
  }

  async get(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    const results = await this.resultRepository.find({
      where: { payrollRunId: id, companyId },
      order: { employeeId: 'ASC' },
    });
    return { ...run, results };
  }

  async process(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (![PayrollRunStatusEnum.DRAFT, PayrollRunStatusEnum.VALIDATION_FAILED].includes(run.status)) {
      throw new ConflictException('Payroll run cannot be processed in its current status.');
    }
    const period = await this.periodRepository.findOne({
      where: { id: run.payrollPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');

    run.status = PayrollRunStatusEnum.PROCESSING;
    run.startedAt = new Date();
    await this.runRepository.save(run);

    await this.lineItemRepository.delete({ payrollRunId: run.id, companyId });
    await this.resultRepository.delete({ payrollRunId: run.id, companyId });

    const calculated = await this.calculationService.calculateRun(companyId, period, run);
    let gross = '0.00';
    let taxable = '0.00';
    let deductions = '0.00';
    let employerContributions = '0.00';
    let net = '0.00';
    let employerCost = '0.00';
    const resultHashes: string[] = [];

    for (const item of calculated) {
      const savedResult = await this.resultRepository.save(
        this.resultRepository.create({
          companyId,
          payrollRunId: run.id,
          payrollPeriodId: period.id,
          employeeId: item.employee.id,
          ...item.result,
        }),
      );
      await this.lineItemRepository.save(
        item.lineItems.map((line) =>
          this.lineItemRepository.create({
            companyId,
            payrollRunId: run.id,
            employeePayrollResultId: savedResult.id,
            employeeId: item.employee.id,
            componentCode: line.componentCode!,
            componentName: line.componentName!,
            componentType: line.componentType!,
            amount: line.amount!,
            taxableAmount: line.taxableAmount ?? '0.00',
            employerAmount: line.employerAmount ?? '0.00',
            calculationOrder: line.calculationOrder ?? 100,
            sourceType: line.sourceType!,
            sourceReference: line.sourceReference ?? null,
            calculationSnapshot: line.calculationSnapshot ?? null,
          }),
        ),
      );
      gross = PayrollMoney.add(gross, savedResult.grossPay);
      taxable = PayrollMoney.add(taxable, savedResult.taxablePay);
      deductions = PayrollMoney.add(deductions, savedResult.employeeDeductions);
      employerContributions = PayrollMoney.add(
        employerContributions,
        savedResult.employerContributions,
      );
      net = PayrollMoney.add(net, savedResult.netPay);
      employerCost = PayrollMoney.add(employerCost, savedResult.employerCost);
      resultHashes.push(savedResult.calculationHash);
    }

    if (
      !this.configService.get<boolean>('PAYROLL_ALLOW_NEGATIVE_NET_PAY', false) &&
      PayrollMoney.toCents(net) < 0n
    ) {
      run.status = PayrollRunStatusEnum.VALIDATION_FAILED;
      await this.runRepository.save(run);
      throw new BadRequestException('Payroll net pay cannot be negative.');
    }

    run.employeeCount = calculated.length;
    run.grossTotal = gross;
    run.taxableTotal = taxable;
    run.deductionTotal = deductions;
    run.employerContributionTotal = employerContributions;
    run.netPayTotal = net;
    run.totalEmployerCost = employerCost;
    run.calculationHash = hashSnapshot(resultHashes);
    run.calculatedAt = new Date();
    run.status = this.configService.get<boolean>('PAYROLL_REQUIRE_HR_APPROVAL', true)
      ? PayrollRunStatusEnum.PENDING_HR_APPROVAL
      : PayrollRunStatusEnum.APPROVED;
    await this.auditService.log({
      actor,
      action: 'payroll.run.calculated',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
      summary: { employee_count: run.employeeCount, net_pay_total: run.netPayTotal },
    });
    return this.runRepository.save(run);
  }

  async approve(actor: AuthenticatedUser, id: number, dto: ApprovePayrollRunDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (!run.calculationHash || run.calculationHash !== dto.calculation_hash) {
      throw new ConflictException('Approval hash must match current payroll hash.');
    }
    if (
      this.configService.get<boolean>('PAYROLL_REQUIRE_MAKER_CHECKER', true) &&
      run.createdByCompanyUserId === (actor.companyMembershipId ?? actor.id)
    ) {
      throw new ForbiddenException('Payroll creator cannot approve the same run.');
    }
    this.assertApprovalStage(run, dto.stage);

    await this.approvalRepository.save(
      this.approvalRepository.create({
        companyId,
        payrollRunId: run.id,
        stage: dto.stage,
        decision: PayrollApprovalDecisionEnum.APPROVED,
        calculationHash: dto.calculation_hash,
        approvedByCompanyUserId: actor.companyMembershipId ?? actor.id,
        comments: dto.comments ?? null,
      }),
    );

    run.status = this.nextApprovalStatus(dto.stage);
    if (run.status === PayrollRunStatusEnum.APPROVED) run.approvedAt = new Date();
    await this.auditService.log({
      actor,
      action: 'payroll.run.approved',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
      summary: { stage: dto.stage },
    });
    return this.runRepository.save(run);
  }

  async lock(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.APPROVED) {
      throw new ConflictException('Only approved payroll can be locked.');
    }
    run.status = PayrollRunStatusEnum.LOCKED;
    run.lockedAt = new Date();
    await this.resultRepository.update(
      { payrollRunId: run.id, companyId },
      { status: EmployeePayrollResultStatusEnum.LOCKED },
    );
    await this.periodRepository.update(
      { id: run.payrollPeriodId, companyId },
      { status: PayrollPeriodStatusEnum.LOCKED, lockedAt: new Date() },
    );
    await this.employeeFinancePayrollInstructionService.lockForPayrollRun(
      companyId,
      run.id,
    );
    await this.auditService.log({
      actor,
      action: 'payroll.run.locked',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
    });
    return this.runRepository.save(run);
  }

  private assertApprovalStage(run: PayrollRun, stage: PayrollApprovalStageEnum) {
    const expected =
      run.status === PayrollRunStatusEnum.PENDING_HR_APPROVAL
        ? PayrollApprovalStageEnum.HR
        : run.status === PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL
          ? PayrollApprovalStageEnum.FINANCE
          : run.status === PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL
            ? PayrollApprovalStageEnum.MANAGEMENT
            : null;
    if (expected !== stage) {
      throw new ConflictException('Payroll run is not waiting for this approval stage.');
    }
  }

  private nextApprovalStatus(stage: PayrollApprovalStageEnum) {
    if (stage === PayrollApprovalStageEnum.HR) {
      return this.configService.get<boolean>('PAYROLL_REQUIRE_FINANCE_APPROVAL', true)
        ? PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL
        : PayrollRunStatusEnum.APPROVED;
    }
    if (stage === PayrollApprovalStageEnum.FINANCE) {
      return this.configService.get<boolean>('PAYROLL_REQUIRE_MANAGEMENT_APPROVAL', true)
        ? PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL
        : PayrollRunStatusEnum.APPROVED;
    }
    return PayrollRunStatusEnum.APPROVED;
  }
}

@Injectable()
export class PayslipService {
  private readonly logger = new Logger(PayslipService.name);

  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
    private readonly notificationQueueService: NotificationQueueService,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineRepository: Repository<EmployeePayrollLineItem>,
    @InjectRepository(Payslip)
    private readonly payslipRepository: Repository<Payslip>,
  ) {}

  async generateForRun(actor: AuthenticatedUser, payrollRunId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id: payrollRunId, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.LOCKED) {
      throw new ConflictException('Payslips can be generated only from locked payroll.');
    }
    const results = await this.resultRepository.find({ where: { payrollRunId, companyId } });
    const payslips: Payslip[] = [];
    for (const result of results) {
      const existing = await this.payslipRepository.findOne({
        where: { employeePayrollResultId: result.id },
      });
      if (existing) {
        payslips.push(existing);
        continue;
      }
      const lines = await this.lineRepository.find({
        where: { employeePayrollResultId: result.id },
        order: { calculationOrder: 'ASC', id: 'ASC' },
      });
      const snapshot = { run_no: run.runNo, result, lines };
      const payslip = await this.payslipRepository.save(
        this.payslipRepository.create({
          companyId,
          employeeId: result.employeeId,
          payrollRunId,
          employeePayrollResultId: result.id,
          payslipNo: `PS-${run.runNo}-${result.employeeId}`,
          snapshot,
          resultHash: result.calculationHash,
        }),
      );
      payslips.push(payslip);

      void this.notificationQueueService.enqueueSmsConfiguredNotification({
        code: 'payroll.payslip.ready',
        module: 'payroll',
        recipientEmployeeId: result.employeeId,
        relatedEntityType: 'PAYSLIP',
        relatedEntityId: payslip.id,
        actor,
        variables: {
          run_no: run.runNo,
          payslip_no: payslip.payslipNo,
        },
      });
    }
    await this.auditService.log({
      actor,
      action: 'payslip.generated',
      entityType: 'PAYROLL_RUN',
      entityId: payrollRunId,
      summary: { count: payslips.length },
    });
    return payslips;
  }

  async listMine(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) throw new ForbiddenException('Employee profile is required.');
    return this.payslipRepository.find({
      where: { companyId, employeeId: actor.employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async getMine(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) throw new ForbiddenException('Employee profile is required.');
    const payslip = await this.payslipRepository.findOne({
      where: { id, companyId, employeeId: actor.employeeId },
    });
    if (!payslip) throw new NotFoundException('Payslip not found.');
    await this.auditService.log({
      actor,
      action: 'payslip.viewed',
      entityType: 'PAYSLIP',
      entityId: payslip.id,
    });
    return payslip;
  }

  async downloadMine(actor: AuthenticatedUser, id: number) {
    const payslip = await this.getMine(actor, id);
    await this.auditService.log({
      actor,
      action: 'payslip.downloaded',
      entityType: 'PAYSLIP',
      entityId: payslip.id,
    });
    return {
      file_name: `${payslip.payslipNo}.json`,
      mime_type: 'application/json',
      content: JSON.stringify(payslip.snapshot, null, 2),
    };
  }

  listForRun(actor: AuthenticatedUser, payrollRunId: number) {
    return this.payslipRepository.find({
      where: {
        companyId: this.hrAccessService.ensureActorCompanyId(actor),
        payrollRunId,
      },
      order: { employeeId: 'ASC' },
    });
  }
}

@Injectable()
export class PayrollBankService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(PayrollBankBatch)
    private readonly batchRepository: Repository<PayrollBankBatch>,
  ) {}

  async generate(actor: AuthenticatedUser, payrollRunId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const existing = await this.batchRepository.findOne({
      where: { companyId, payrollRunId },
    });
    if (existing) return existing;
    const run = await this.runRepository.findOne({ where: { id: payrollRunId, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.LOCKED) {
      throw new ConflictException('Bank files can be generated only from locked payroll.');
    }
    const results = await this.resultRepository.find({
      where: { companyId, payrollRunId, status: EmployeePayrollResultStatusEnum.LOCKED },
      order: { employeeId: 'ASC' },
    });
    const invalid = results.filter(
      (result) =>
        !result.bankAccountSnapshot ||
        result.bankAccountSnapshot.verification_status !== 'VERIFIED',
    );
    if (invalid.length > 0) {
      throw new BadRequestException('All bank-transfer employees need verified bank accounts.');
    }
    const rows = [
      'employee_id,account_name,bank_code,branch_code,account_number_masked,amount',
      ...results.map((result) => {
        const bank = result.bankAccountSnapshot!;
        return [
          result.employeeId,
          bank.account_name ?? '',
          bank.bank_code ?? '',
          bank.bank_branch_code ?? '',
          bank.account_number_masked ?? '',
          result.netPay,
        ].join(',');
      }),
    ];
    const total = results.reduce(
      (sum, result) => PayrollMoney.add(sum, result.netPay),
      '0.00',
    );
    const fileContent = rows.join('\n');
    const batch = await this.batchRepository.save(
      this.batchRepository.create({
        companyId,
        payrollRunId,
        batchNo: `PB-${run.runNo}`,
        recordCount: results.length,
        totalAmount: total,
        snapshot: { result_ids: results.map((item) => item.id) },
        fileContent,
        fileHash: hashSnapshot(fileContent),
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.bank_file.generated',
      entityType: 'PAYROLL_BANK_BATCH',
      entityId: batch.id,
      summary: { record_count: batch.recordCount, total_amount: batch.totalAmount },
    });
    return batch;
  }

  async download(actor: AuthenticatedUser, batchId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const batch = await this.batchRepository.findOne({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new NotFoundException('Payroll bank batch not found.');
    await this.auditService.log({
      actor,
      action: 'payroll.bank_file.downloaded',
      entityType: 'PAYROLL_BANK_BATCH',
      entityId: batch.id,
      summary: { record_count: batch.recordCount, total_amount: batch.totalAmount },
    });
    return {
      file_name: `${batch.batchNo}.csv`,
      mime_type: 'text/csv',
      content: batch.fileContent,
      file_hash: batch.fileHash,
    };
  }
}

@Injectable()
export class PayrollAccountingService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineRepository: Repository<EmployeePayrollLineItem>,
    @InjectRepository(PayrollAccountingMapping)
    private readonly mappingRepository: Repository<PayrollAccountingMapping>,
    @InjectRepository(PayrollJournalBatch)
    private readonly journalRepository: Repository<PayrollJournalBatch>,
  ) {}

  async generate(actor: AuthenticatedUser, payrollRunId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const existing = await this.journalRepository.findOne({
      where: { companyId, payrollRunId },
    });
    if (existing) return existing;
    const run = await this.runRepository.findOne({ where: { id: payrollRunId, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.LOCKED) {
      throw new ConflictException('Journals can be generated only from locked payroll.');
    }
    const lines = await this.lineRepository.find({ where: { companyId, payrollRunId } });
    const mappings = await this.mappingRepository.find({ where: { companyId } });
    const mappingMap = new Map(mappings.map((item) => [item.componentCode, item]));
    const entries: Record<string, unknown>[] = [];
    let debit = '0.00';
    let credit = '0.00';
    for (const line of lines) {
      const amount =
        PayrollMoney.toCents(line.employerAmount) > 0n
          ? line.employerAmount
          : line.amount;
      if (PayrollMoney.toCents(amount) === 0n) continue;
      const mapping = mappingMap.get(line.componentCode);
      if (!mapping) {
        throw new BadRequestException(
          `Missing payroll accounting mapping for component ${line.componentCode}.`,
        );
      }
      const debitAccount = mapping.debitAccountCode;
      const creditAccount = mapping.creditAccountCode;
      entries.push({
        employee_id: line.employeeId,
        component_code: line.componentCode,
        debit_account: debitAccount,
        credit_account: creditAccount,
        amount,
      });
      debit = PayrollMoney.add(debit, amount);
      credit = PayrollMoney.add(credit, amount);
    }
    if (PayrollMoney.toCents(debit) !== PayrollMoney.toCents(credit)) {
      throw new ConflictException('Payroll journal debit and credit totals do not balance.');
    }
    return this.journalRepository.save(
      this.journalRepository.create({
        companyId,
        payrollRunId,
        batchNo: `PJ-${run.runNo}`,
        debitTotal: debit,
        creditTotal: credit,
        entries,
      }),
    );
  }
}

@Injectable()
export class PayrollReportsService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(PayrollVarianceResult)
    private readonly varianceRepository: Repository<PayrollVarianceResult>,
  ) {}

  async dashboard(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const latestRun = await this.runRepository.findOne({
      where: { companyId },
      order: { id: 'DESC' },
    });
    const lockedRuns = await this.runRepository.count({
      where: { companyId, status: PayrollRunStatusEnum.LOCKED },
    });
    return {
      latest_run: latestRun,
      locked_runs: lockedRuns,
      latest_locked_cost: latestRun?.status === PayrollRunStatusEnum.LOCKED
        ? latestRun.totalEmployerCost
        : null,
      latest_locked_net_pay: latestRun?.status === PayrollRunStatusEnum.LOCKED
        ? latestRun.netPayTotal
        : null,
      payroll_ready: Boolean(latestRun),
    };
  }

  async variance(actor: AuthenticatedUser, payrollRunId: number, comparisonRunId?: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const current = await this.resultRepository.find({
      where: { companyId, payrollRunId },
    });
    const comparison = comparisonRunId
      ? await this.resultRepository.find({
          where: { companyId, payrollRunId: comparisonRunId },
        })
      : [];
    const comparisonMap = new Map(comparison.map((item) => [item.employeeId, item]));
    let varianceTotal = '0.00';
    const rows = current.map((item) => {
      const previous = comparisonMap.get(item.employeeId);
      const variance = previous
        ? PayrollMoney.add(
            item.netPay,
            PayrollMoney.fromCents(-PayrollMoney.toCents(previous.netPay)),
          )
        : item.netPay;
      varianceTotal = PayrollMoney.add(varianceTotal, variance);
      return {
        employee_id: item.employeeId,
        current_net_pay: item.netPay,
        comparison_net_pay: previous?.netPay ?? null,
        variance,
        explained: false,
      };
    });
    return this.varianceRepository.save(
      this.varianceRepository.create({
        companyId,
        payrollRunId,
        comparisonRunId: comparisonRunId ?? null,
        snapshot: { rows },
        varianceTotal,
        unexplainedCount: rows.length,
      }),
    );
  }
}

@Injectable()
export class PayrollReconciliationService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeePayrollProfile)
    private readonly profileRepository: Repository<EmployeePayrollProfile>,
    @InjectRepository(EmployeeCompensationVersion)
    private readonly compensationRepository: Repository<EmployeeCompensationVersion>,
    @InjectRepository(EmployeeBankAccount)
    private readonly bankRepository: Repository<EmployeeBankAccount>,
    @InjectRepository(StatutoryScheme)
    private readonly schemeRepository: Repository<StatutoryScheme>,
    @InjectRepository(StatutoryRuleVersion)
    private readonly ruleRepository: Repository<StatutoryRuleVersion>,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineRepository: Repository<EmployeePayrollLineItem>,
  ) {}

  @Cron(process.env.PAYROLL_RECONCILIATION_CRON || '0 30 2 * * *')
  async scheduledReconciliation() {
    const rows = await this.runRepository
      .createQueryBuilder('run')
      .select('DISTINCT run.companyId', 'company_id')
      .getRawMany<{ company_id: number }>();
    let checked = 0;
    for (const row of rows) {
      await this.reconcileCompany(Number(row.company_id));
      checked += 1;
    }
    return checked;
  }

  async reconcile(actor: AuthenticatedUser) {
    return this.reconcileCompany(this.hrAccessService.ensureActorCompanyId(actor), actor);
  }

  private async reconcileCompany(companyId: number, actor?: AuthenticatedUser) {
    const issues: Record<string, unknown>[] = [];
    const activeEmployees = await this.employeeRepository.find({
      where: { company_id: companyId, employment_status: EmploymentStatusEnum.ACTIVE },
      select: [
        'id',
        'company_id',
        'employee_no',
        'first_name',
        'middle_name',
        'last_name',
      ],
    });
    const employeeIds = activeEmployees.map((employee) => employee.id);

    if (employeeIds.length > 0) {
      const profiles = await this.profileRepository.find({
        where: { companyId, employeeId: In(employeeIds) },
      });
      const profileEmployeeIds = new Set(profiles.map((profile) => profile.employeeId));
      for (const employee of activeEmployees) {
        if (!profileEmployeeIds.has(employee.id)) {
          issues.push({
            code: 'EMPLOYEE_PAYROLL_PROFILE_MISSING',
            employee_id: employee.id,
          });
        }
      }

      const compensations = await this.compensationRepository.find({
        where: { companyId, employeeId: In(employeeIds), status: 'ACTIVE' as never },
      });
      const compensationCount = compensations.reduce<Record<number, number>>(
        (acc, item) => {
          acc[item.employeeId] = (acc[item.employeeId] ?? 0) + 1;
          return acc;
        },
        {},
      );
      for (const employee of activeEmployees) {
        if (!compensationCount[employee.id]) {
          issues.push({
            code: 'EMPLOYEE_COMPENSATION_MISSING',
            employee_id: employee.id,
          });
        }
        if ((compensationCount[employee.id] ?? 0) > 1) {
          issues.push({
            code: 'MULTIPLE_ACTIVE_COMPENSATION_VERSIONS',
            employee_id: employee.id,
          });
        }
      }

      const banks = await this.bankRepository.find({
        where: { employee_id: In(employeeIds), is_primary: true },
      });
      const bankEmployeeIds = new Set(
        banks
          .filter((bank) => bank.verification_status === 'VERIFIED')
          .map((bank) => bank.employee_id),
      );
      for (const employee of activeEmployees) {
        if (!bankEmployeeIds.has(employee.id)) {
          issues.push({
            code: 'MISSING_VERIFIED_BANK_ACCOUNT',
            employee_id: employee.id,
          });
        }
      }
    }

    for (const schemeType of [
      StatutorySchemeTypeEnum.PAYE,
      StatutorySchemeTypeEnum.PENSION,
      StatutorySchemeTypeEnum.HEALTH_INSURANCE,
    ]) {
      const schemes = await this.schemeRepository.find({
        where: { companyId, schemeType, status: 'ACTIVE' },
      });
      if (!schemes.length) {
        issues.push({ code: `MISSING_ACTIVE_${schemeType}_SCHEME` });
        continue;
      }
      const activeRules = await this.ruleRepository.find({
        where: {
          companyId,
          schemeId: In(schemes.map((scheme) => scheme.id)),
          status: 'APPROVED',
        },
      });
      if (!activeRules.length) {
        issues.push({ code: `MISSING_ACTIVE_${schemeType}_RULE` });
      }
    }

    const recentRuns = await this.runRepository.find({
      where: { companyId, status: In([PayrollRunStatusEnum.CALCULATED, PayrollRunStatusEnum.APPROVED, PayrollRunStatusEnum.LOCKED]) },
      order: { id: 'DESC' },
      take: 5,
    });
    for (const run of recentRuns) {
      const results = await this.resultRepository.find({
        where: { companyId, payrollRunId: run.id },
      });
      const resultNet = results.reduce(
        (sum, result) => PayrollMoney.add(sum, result.netPay),
        '0.00',
      );
      if (PayrollMoney.toCents(resultNet) !== PayrollMoney.toCents(run.netPayTotal)) {
        issues.push({
          code: 'RUN_TOTAL_DIFFERS_FROM_EMPLOYEE_RESULTS',
          payroll_run_id: run.id,
        });
      }
      for (const result of results) {
        const lines = await this.lineRepository.find({
          where: { companyId, employeePayrollResultId: result.id },
        });
        const gross = lines
          .filter((line) =>
            [
              PayrollComponentTypeEnum.EARNING,
              PayrollComponentTypeEnum.REIMBURSEMENT,
              PayrollComponentTypeEnum.TAXABLE_BENEFIT,
            ].includes(line.componentType as PayrollComponentTypeEnum),
          )
          .reduce((sum, line) => PayrollMoney.add(sum, line.amount), '0.00');
        if (PayrollMoney.toCents(gross) !== PayrollMoney.toCents(result.grossPay)) {
          issues.push({
            code: 'EMPLOYEE_GROSS_DIFFERS_FROM_LINE_ITEMS',
            payroll_result_id: result.id,
          });
        }
      }
    }

    await this.auditService.log({
      actor,
      companyId,
      action: 'payroll.reconciliation.completed',
      entityType: 'PAYROLL_RECONCILIATION',
      entityId: companyId,
      summary: { issue_count: issues.length },
    });

    return {
      company_id: companyId,
      issue_count: issues.length,
      issues,
    };
  }
}

@Injectable()
export class PayrollFinalSettlementService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRepository: Repository<OffboardingRequest>,
    @InjectRepository(OffboardingSettlementItem)
    private readonly settlementItemRepository: Repository<OffboardingSettlementItem>,
    @InjectRepository(PayrollFinalSettlement)
    private readonly repository: Repository<PayrollFinalSettlement>,
  ) {}

  async calculate(actor: AuthenticatedUser, offboardingRequestId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const existing = await this.repository.findOne({
      where: { offboardingRequestId, companyId },
    });
    if (existing) return existing;
    const offboarding = await this.offboardingRepository.findOne({
      where: { id: offboardingRequestId, company_id: companyId },
    });
    if (!offboarding) throw new NotFoundException('Offboarding request not found.');
    if (
      ![
        OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
        OffboardingRequestStatusEnum.COMPLETED,
      ].includes(offboarding.status)
    ) {
      throw new ConflictException('Approved offboarding is required for final settlement.');
    }
    const items = await this.settlementItemRepository.find({
      where: { company_id: companyId, offboarding_request_id: offboarding.id },
    });
    const gross = items
      .filter((item) => PayrollMoney.toCents(item.amount ?? '0') > 0n)
      .reduce((sum, item) => PayrollMoney.add(sum, item.amount), '0.00');
    const deductions = items
      .filter((item) => PayrollMoney.toCents(item.amount ?? '0') < 0n)
      .reduce((sum, item) => PayrollMoney.add(sum, item.amount), '0.00');
    const employeeFinanceRecoveryItemIds = items
      .filter((item) =>
        [
          OffboardingSettlementItemTypeEnum.LOAN_RECOVERY,
          OffboardingSettlementItemTypeEnum.SALARY_ADVANCE_RECOVERY,
        ].includes(item.item_type),
      )
      .map((item) => item.id);
    return this.repository.save(
      this.repository.create({
        companyId,
        offboardingRequestId: offboarding.id,
        employeeId: offboarding.employee_id,
        grossSettlement: gross,
        deductionTotal: deductions,
        netSettlement: PayrollMoney.add(gross, deductions),
        snapshot: {
          offboarding_request_id: offboarding.id,
          last_working_date: offboarding.last_working_date,
          settlement_item_ids: items.map((item) => item.id),
          employee_finance_recovery_item_ids: employeeFinanceRecoveryItemIds,
        },
      }),
    );
  }
}
