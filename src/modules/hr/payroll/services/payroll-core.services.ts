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
import { AttendanceHoliday } from '../../attendance/holidays/entities/holiday.entity';
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
import { EmployeeKpi } from '../../performance/entities/employee-kpi.entity';
import { KpiAchievement } from '../../performance/entities/kpi-achievement.entity';
import { PerformanceAggregate } from '../../performance/entities/performance-aggregate.entity';
import { EmployeeKpiStatusEnum } from '../../performance/enums/employee-kpi-status.enum';
import { KpiAchievementStatusEnum } from '../../performance/enums/kpi-achievement-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  EmployeeFinanceLedgerEntry,
  EmployeeFinancePayrollInstruction,
} from '../../employee-finance/entities/employee-finance-account.entities';
import { EmployeeFinancePayrollInstructionStatusEnum } from '../../employee-finance/employee-finance.enums';
import { EmployeeFinancePayrollInstructionService } from '../../employee-finance/services/employee-finance-core.services';
import { NotificationQueueService } from '../../../notifications/notification-queue.service';
import { SmsNotificationManagementService } from '../../../sms/sms-notification-management.service';
import {
  ApprovePayrollRunDto,
  CreatePayrollCalendarDto,
  CreatePayrollAccountingMappingDto,
  CreatePayrollAdjustmentDto,
  CreatePayrollBonusSchemeDto,
  CreatePayrollComponentDto,
  CreatePayrollGroupDto,
  CreatePayrollGroupAssignmentDto,
  CreatePayrollInputDto,
  CreatePayrollLeaveRuleDto,
  CreatePayrollOvertimePolicyDto,
  CreatePayrollRunDto,
  CreatePayrollSourceRecordBatchDto,
  CreatePayrollSourceRecordDto,
  DecidePayrollOvertimeDto,
  GeneratePayrollSourceRecordsDto,
  CreateSalaryStructureDto,
  CreateStatutoryRuleDto,
  CreateStatutorySchemeDto,
  GeneratePayrollPeriodDto,
  PayrollOvertimeApprovalQueryDto,
  PayrollReportQueryDto,
  PayrollQueryDto,
  ReconcilePayrollPaymentDto,
  UpsertEmployeePayrollProfileDto,
} from '../dto/payroll.dto';
import { EmployeePayrollProfile } from '../entities/employee-payroll-profile.entity';
import {
  PayrollAccountingMapping,
  PayrollBonusScheme,
  PayrollCalendar,
  PayrollComponent,
  PayrollGroup,
  PayrollGroupAssignment,
  PayrollLeaveRule,
  PayrollOvertimePolicy,
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
  PayrollPaymentReconciliation,
  PayrollRun,
  PayrollRunApproval,
  PayrollSourceRecord,
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
  deductionShortfalls: Array<{
    componentCode: string;
    requestedAmount: string;
    appliedAmount: string;
    deferredAmount: string;
    sourceReference: string | null;
  }>;
};

function clean(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashSnapshot(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
        where: {
          id: dto.primary_bank_account_id,
          employee_id: dto.employee_id,
        },
      });
      if (!bank)
        throw new BadRequestException('Primary bank account not found.');
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
    profile.taxpayerIdentificationNumber = clean(
      dto.taxpayer_identification_number,
    );
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
      value
        ? `${'*'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`
        : null;
    return {
      ...profile,
      taxpayerIdentificationNumber: maskValue(
        profile.taxpayerIdentificationNumber,
      ),
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
    @InjectRepository(PayrollGroup)
    private readonly groupRepository: Repository<PayrollGroup>,
    @InjectRepository(PayrollGroupAssignment)
    private readonly groupAssignmentRepository: Repository<PayrollGroupAssignment>,
    @InjectRepository(PayrollOvertimePolicy)
    private readonly overtimePolicyRepository: Repository<PayrollOvertimePolicy>,
    @InjectRepository(PayrollBonusScheme)
    private readonly bonusSchemeRepository: Repository<PayrollBonusScheme>,
    @InjectRepository(PayrollLeaveRule)
    private readonly leaveRuleRepository: Repository<PayrollLeaveRule>,
  ) {}

  async createComponent(
    actor: AuthenticatedUser,
    dto: CreatePayrollComponentDto,
  ) {
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

  async createStructure(
    actor: AuthenticatedUser,
    dto: CreateSalaryStructureDto,
  ) {
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

  async createCalendar(
    actor: AuthenticatedUser,
    dto: CreatePayrollCalendarDto,
  ) {
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

  async generatePeriod(
    actor: AuthenticatedUser,
    dto: GeneratePayrollPeriodDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const calendar = await this.calendarRepository.findOne({
      where: { id: dto.payroll_calendar_id, companyId },
    });
    if (!calendar) throw new NotFoundException('Payroll calendar not found.');

    const start = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const end = new Date(Date.UTC(dto.year, dto.month, 0));
    const cutoff = new Date(
      Date.UTC(dto.year, dto.month - 1, calendar.cutoffDay),
    );
    const payment = new Date(
      Date.UTC(dto.year, dto.month - 1, calendar.paymentDay),
    );
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

  async createGroup(actor: AuthenticatedUser, dto: CreatePayrollGroupDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const group = await this.groupRepository.save(
      this.groupRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        frequency: dto.frequency?.trim().toUpperCase() ?? 'MONTHLY',
        payrollCalendarId: dto.payroll_calendar_id ?? null,
        branchId: dto.branch_id ?? null,
        departmentId: dto.department_id ?? null,
        employeeCategory: clean(dto.employee_category),
        employmentType: clean(dto.employment_type),
        currency: (dto.currency ?? 'TZS').trim().toUpperCase(),
        policy: dto.policy ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.group.created',
      entityType: 'PAYROLL_GROUP',
      entityId: group.id,
      summary: { code: group.code },
    });
    return group;
  }

  listGroups(actor: AuthenticatedUser) {
    return this.groupRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { code: 'ASC' },
    });
  }

  async createGroupAssignment(
    actor: AuthenticatedUser,
    dto: CreatePayrollGroupAssignmentDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const group = await this.groupRepository.findOne({
      where: { id: dto.payroll_group_id, companyId, status: 'ACTIVE' },
    });
    if (!group) throw new NotFoundException('Payroll group not found.');
    const assignment = await this.groupAssignmentRepository.save(
      this.groupAssignmentRepository.create({
        companyId,
        payrollGroupId: group.id,
        employeeId: dto.employee_id,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        metadata: dto.metadata ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.group_assignment.created',
      entityType: 'PAYROLL_GROUP_ASSIGNMENT',
      entityId: assignment.id,
      summary: { group_id: group.id, employee_id: assignment.employeeId },
    });
    return assignment;
  }

  listGroupAssignments(actor: AuthenticatedUser, payrollGroupId?: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.groupAssignmentRepository.find({
      where: payrollGroupId ? { companyId, payrollGroupId } : { companyId },
      order: {
        payrollGroupId: 'ASC',
        employeeId: 'ASC',
        effectiveFrom: 'DESC',
      },
    });
  }

  async createOvertimePolicy(
    actor: AuthenticatedUser,
    dto: CreatePayrollOvertimePolicyDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const policy = await this.overtimePolicyRepository.save(
      this.overtimePolicyRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        componentCode: (dto.component_code ?? 'OVERTIME').trim().toUpperCase(),
        regularMultiplier: dto.regular_multiplier ?? '1.5000',
        weekendMultiplier: dto.weekend_multiplier ?? '2.0000',
        holidayMultiplier: dto.holiday_multiplier ?? '2.0000',
        minimumMinutes: dto.minimum_minutes ?? 0,
        approvalRequired: dto.approval_required ?? true,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        configuration: dto.configuration ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.overtime_policy.created',
      entityType: 'PAYROLL_OVERTIME_POLICY',
      entityId: policy.id,
      summary: { code: policy.code },
    });
    return policy;
  }

  listOvertimePolicies(actor: AuthenticatedUser) {
    return this.overtimePolicyRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { code: 'ASC' },
    });
  }

  async createBonusScheme(
    actor: AuthenticatedUser,
    dto: CreatePayrollBonusSchemeDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const scheme = await this.bonusSchemeRepository.save(
      this.bonusSchemeRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        schemeType: dto.scheme_type?.trim().toUpperCase() ?? 'BONUS',
        componentCode: dto.component_code.trim().toUpperCase(),
        calculationMethod:
          dto.calculation_method?.trim().toUpperCase() ?? 'FIXED_AMOUNT',
        defaultAmount: dto.default_amount ?? null,
        defaultRate: dto.default_rate ?? null,
        approvalRequired: dto.approval_required ?? true,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        configuration: dto.configuration ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.bonus_scheme.created',
      entityType: 'PAYROLL_BONUS_SCHEME',
      entityId: scheme.id,
      summary: { code: scheme.code, type: scheme.schemeType },
    });
    return scheme;
  }

  listBonusSchemes(actor: AuthenticatedUser) {
    return this.bonusSchemeRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { schemeType: 'ASC', code: 'ASC' },
    });
  }

  async createLeaveRule(
    actor: AuthenticatedUser,
    dto: CreatePayrollLeaveRuleDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const rule = await this.leaveRuleRepository.save(
      this.leaveRuleRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        leaveTypeCode: dto.leave_type_code.trim().toUpperCase(),
        paidPercentage: dto.paid_percentage ?? '100',
        paidDaysCap: dto.paid_days_cap ?? null,
        halfPayAfterDays: dto.half_pay_after_days ?? null,
        unpaidAfterDays: dto.unpaid_after_days ?? null,
        carryForwardCapDays: dto.carry_forward_cap_days ?? null,
        effectiveFrom: dto.effective_from,
        effectiveTo: dto.effective_to ?? null,
        configuration: dto.configuration ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.leave_rule.created',
      entityType: 'PAYROLL_LEAVE_RULE',
      entityId: rule.id,
      summary: { code: rule.code, leave_type_code: rule.leaveTypeCode },
    });
    return rule;
  }

  listLeaveRules(actor: AuthenticatedUser) {
    return this.leaveRuleRepository.find({
      where: { companyId: this.hrAccessService.ensureActorCompanyId(actor) },
      order: { leaveTypeCode: 'ASC', effectiveFrom: 'DESC' },
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
    if (
      [PayrollPeriodStatusEnum.LOCKED, PayrollPeriodStatusEnum.CLOSED].includes(
        period.status,
      )
    ) {
      throw new ConflictException(
        'Locked payroll periods cannot accept inputs.',
      );
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
    if (query.payroll_period_id)
      where.payrollPeriodId = query.payroll_period_id;
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

  async createAdjustment(
    actor: AuthenticatedUser,
    dto: CreatePayrollAdjustmentDto,
  ) {
    return this.create(actor, {
      payroll_period_id: dto.payroll_period_id,
      employee_id: dto.employee_id,
      component_code: dto.component_code,
      source_module: dto.adjustment_type?.trim().toUpperCase() ?? 'ADJUSTMENT',
      source_reference: dto.effective_period_code ?? undefined,
      amount: dto.amount,
      currency: 'TZS',
      status: PayrollInputStatusEnum.APPROVED,
      payload: {
        reason: dto.reason,
        adjustment_type: dto.adjustment_type ?? 'ADJUSTMENT',
        effective_period_code: dto.effective_period_code ?? null,
        created_from: 'payroll.adjustments',
      },
    });
  }
}

@Injectable()
export class PayrollSourceService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly inputService: PayrollInputService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(PayrollSourceRecord)
    private readonly repository: Repository<PayrollSourceRecord>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollBonusScheme)
    private readonly bonusSchemeRepository: Repository<PayrollBonusScheme>,
    @InjectRepository(EmployeeKpi)
    private readonly employeeKpiRepository: Repository<EmployeeKpi>,
    @InjectRepository(KpiAchievement)
    private readonly kpiAchievementRepository: Repository<KpiAchievement>,
    @InjectRepository(PerformanceAggregate)
    private readonly performanceAggregateRepository: Repository<PerformanceAggregate>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreatePayrollSourceRecordDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: dto.payroll_period_id, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');
    const sourceType = dto.source_type.trim().toUpperCase();
    if (!['SALES', 'KPI', 'PERFORMANCE', 'COMMISSION'].includes(sourceType)) {
      throw new BadRequestException('Unsupported payroll source type.');
    }
    const calculatedAmount = this.calculateSourceAmount(dto);
    const source = await this.repository.save(
      this.repository.create({
        companyId,
        payrollPeriodId: period.id,
        employeeId: dto.employee_id ?? null,
        sourceType,
        sourceReference:
          dto.source_reference?.trim() ??
          `${sourceType}-${period.id}-${dto.employee_id ?? 'ALL'}-${Date.now()}`,
        schemeCode: clean(dto.scheme_code)?.toUpperCase() ?? null,
        componentCode: dto.component_code.trim().toUpperCase(),
        sourceAmount: dto.source_amount ?? calculatedAmount,
        quantity: dto.quantity ?? null,
        rate: dto.rate ?? null,
        calculatedAmount,
        currency: (dto.currency ?? 'TZS').trim().toUpperCase(),
        payload: dto.payload ?? null,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.source.created',
      entityType: 'PAYROLL_SOURCE_RECORD',
      entityId: source.id,
      summary: {
        source_type: source.sourceType,
        amount: source.calculatedAmount,
      },
    });
    return source;
  }

  async createBatch(
    actor: AuthenticatedUser,
    dto: CreatePayrollSourceRecordBatchDto,
  ) {
    if (!dto.records.length) {
      throw new BadRequestException('At least one source record is required.');
    }
    const created: PayrollSourceRecord[] = [];
    for (const record of dto.records) {
      const source = await this.create(actor, record);
      if (dto.auto_approve) {
        created.push(await this.approve(actor, source.id));
      } else {
        created.push(source);
      }
    }
    return {
      count: created.length,
      records: created,
    };
  }

  list(actor: AuthenticatedUser, query: PayrollQueryDto) {
    const where: Record<string, unknown> = {
      companyId: this.hrAccessService.ensureActorCompanyId(actor),
    };
    if (query.payroll_period_id) {
      where.payrollPeriodId = query.payroll_period_id;
    }
    if (query.employee_id) where.employeeId = query.employee_id;
    if (query.status) where.status = query.status;
    return this.repository.find({ where, order: { id: 'DESC' } });
  }

  async approve(actor: AuthenticatedUser, id: number) {
    const source = await this.findOwned(actor, id);
    if (!['DRAFT', 'REJECTED'].includes(source.status)) {
      throw new ConflictException(
        'Only draft or rejected source records can be approved.',
      );
    }
    source.status = 'APPROVED';
    source.approvedByCompanyUserId = actor.companyMembershipId ?? null;
    source.approvedAt = new Date();
    return this.repository.save(source);
  }

  async reject(actor: AuthenticatedUser, id: number) {
    const source = await this.findOwned(actor, id);
    if (source.status === 'POSTED') {
      throw new ConflictException('Posted source records cannot be rejected.');
    }
    source.status = 'REJECTED';
    source.payload = {
      ...(source.payload ?? {}),
      rejected_by_company_user_id: actor.companyMembershipId ?? null,
      rejected_at: new Date().toISOString(),
    };
    return this.repository.save(source);
  }

  async post(actor: AuthenticatedUser, id: number) {
    const source = await this.findOwned(actor, id);
    if (source.status !== 'APPROVED') {
      throw new ConflictException(
        'Only approved source records can be posted.',
      );
    }
    if (source.generatedPayrollInputId) return source;
    const input = await this.inputService.create(actor, {
      payroll_period_id: source.payrollPeriodId,
      employee_id: source.employeeId ?? undefined,
      component_code: source.componentCode,
      source_module: source.sourceType,
      source_reference: source.sourceReference,
      amount: source.calculatedAmount,
      quantity: source.quantity ?? undefined,
      rate: source.rate ?? undefined,
      currency: source.currency,
      status: PayrollInputStatusEnum.APPROVED,
      payload: {
        ...(source.payload ?? {}),
        source_record_id: source.id,
        scheme_code: source.schemeCode,
      },
    });
    source.status = 'POSTED';
    source.generatedPayrollInputId = input.id;
    source.postedByCompanyUserId = actor.companyMembershipId ?? null;
    source.postedAt = new Date();
    await this.auditService.log({
      actor,
      action: 'payroll.source.posted',
      entityType: 'PAYROLL_SOURCE_RECORD',
      entityId: source.id,
      summary: { payroll_input_id: input.id },
    });
    return this.repository.save(source);
  }

  async generate(
    actor: AuthenticatedUser,
    dto: GeneratePayrollSourceRecordsDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: dto.payroll_period_id, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');

    const sourceType = dto.source_type.trim().toUpperCase();
    const scheme = await this.resolveSourceScheme(companyId, sourceType, dto);
    const componentCode =
      dto.component_code?.trim().toUpperCase() ??
      scheme?.componentCode ??
      (sourceType === 'KPI' ? 'KPI_BONUS' : 'PERFORMANCE_BONUS');
    const configuredScoreRate =
      scheme?.configuration?.amount_per_score_point;
    const scoreRate =
      dto.amount_per_score_point ??
      scheme?.defaultRate ??
      (typeof configuredScoreRate === 'string' ||
      typeof configuredScoreRate === 'number'
        ? String(configuredScoreRate)
        : '0');
    const minimumScore = Number(
      dto.minimum_score ?? scheme?.configuration?.minimum_score ?? '0',
    );

    if (dto.replace_existing) {
      await this.repository.delete({
        companyId,
        payrollPeriodId: period.id,
        sourceType,
        status: In(['DRAFT', 'REJECTED']),
      });
    }

    const rows =
      sourceType === 'KPI'
        ? await this.generateKpiSources({
            actor,
            companyId,
            period,
            performancePeriodId: dto.performance_period_id,
            componentCode,
            scheme,
            scoreRate,
            minimumScore,
            autoApprove: dto.auto_approve === true,
          })
        : await this.generatePerformanceSources({
            actor,
            companyId,
            period,
            dto,
            componentCode,
            scheme,
            scoreRate,
            minimumScore,
            autoApprove: dto.auto_approve === true,
          });

    return {
      count: rows.length,
      records: rows,
      source_type: sourceType,
      component_code: componentCode,
    };
  }

  private async findOwned(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const source = await this.repository.findOne({ where: { id, companyId } });
    if (!source)
      throw new NotFoundException('Payroll source record not found.');
    return source;
  }

  private calculateSourceAmount(dto: CreatePayrollSourceRecordDto) {
    if (dto.calculated_amount) return dto.calculated_amount;
    if (dto.source_amount) return dto.source_amount;
    if (dto.quantity && dto.rate) {
      return PayrollMoney.multiplyFactor(dto.rate, dto.quantity);
    }
    return '0.00';
  }

  private async resolveSourceScheme(
    companyId: number,
    sourceType: string,
    dto: GeneratePayrollSourceRecordsDto,
  ) {
    const qb = this.bonusSchemeRepository
      .createQueryBuilder('scheme')
      .where('scheme.companyId = :companyId', { companyId })
      .andWhere('scheme.status = :status', { status: 'ACTIVE' });
    if (dto.scheme_code) {
      qb.andWhere('scheme.code = :code', {
        code: dto.scheme_code.trim().toUpperCase(),
      });
    } else {
      qb.andWhere('scheme.schemeType IN (:...types)', {
        types:
          sourceType === 'KPI'
            ? ['KPI', 'BONUS', 'PERFORMANCE']
            : ['PERFORMANCE', 'BONUS'],
      });
    }
    return qb.orderBy('scheme.id', 'ASC').getOne();
  }

  private sourceAmountFromScore(score: string | null, scoreRate: string) {
    if (!score) return '0.00';
    return PayrollMoney.multiplyFactor(score, scoreRate);
  }

  private async upsertGeneratedSource(
    actor: AuthenticatedUser,
    data: {
      companyId: number;
      payrollPeriodId: number;
      employeeId: number;
      sourceType: string;
      sourceReference: string;
      schemeCode: string | null;
      componentCode: string;
      sourceAmount: string;
      calculatedAmount: string;
      payload: Record<string, unknown>;
      autoApprove: boolean;
    },
  ) {
    const existing = await this.repository.findOne({
      where: {
        companyId: data.companyId,
        sourceType: data.sourceType,
        sourceReference: data.sourceReference,
      },
    });
    if (existing?.status === 'POSTED') return existing;
    const source =
      existing ??
      this.repository.create({
        companyId: data.companyId,
        payrollPeriodId: data.payrollPeriodId,
        employeeId: data.employeeId,
        sourceType: data.sourceType,
        sourceReference: data.sourceReference,
      });
    source.schemeCode = data.schemeCode;
    source.componentCode = data.componentCode;
    source.sourceAmount = data.sourceAmount;
    source.calculatedAmount = data.calculatedAmount;
    source.currency = 'TZS';
    source.payload = data.payload;
    source.status = data.autoApprove ? 'APPROVED' : 'DRAFT';
    source.approvedByCompanyUserId = data.autoApprove
      ? (actor.companyMembershipId ?? null)
      : null;
    source.approvedAt = data.autoApprove ? new Date() : null;
    return this.repository.save(source);
  }

  private async generateKpiSources(args: {
    actor: AuthenticatedUser;
    companyId: number;
    period: PayrollPeriod;
    performancePeriodId?: number;
    componentCode: string;
    scheme: PayrollBonusScheme | null;
    scoreRate: string;
    minimumScore: number;
    autoApprove: boolean;
  }) {
    const achievements = await this.kpiAchievementRepository
      .createQueryBuilder('achievement')
      .where('achievement.companyId = :companyId', {
        companyId: args.companyId,
      })
      .andWhere('achievement.status IN (:...statuses)', {
        statuses: [
          KpiAchievementStatusEnum.HR_APPROVED,
          KpiAchievementStatusEnum.PUBLISHED,
          KpiAchievementStatusEnum.LOCKED,
        ],
      })
      .andWhere(
        args.performancePeriodId
          ? 'achievement.periodAssignmentId IN (SELECT id FROM performance_period_assignments WHERE performance_period_id = :performancePeriodId)'
          : '1=1',
        { performancePeriodId: args.performancePeriodId },
      )
      .getMany();

    const rows: PayrollSourceRecord[] = [];
    for (const achievement of achievements) {
      const score =
        achievement.weightedScore ??
        achievement.cappedScore ??
        achievement.rawScore;
      if (!score || Number(score) < args.minimumScore) continue;
      const amount = this.sourceAmountFromScore(score, args.scoreRate);
      if (PayrollMoney.toCents(amount) <= 0n) continue;
      rows.push(
        await this.upsertGeneratedSource(args.actor, {
          companyId: args.companyId,
          payrollPeriodId: args.period.id,
          employeeId: achievement.employeeId,
          sourceType: 'KPI',
          sourceReference: `KPI_ACHIEVEMENT:${achievement.id}`,
          schemeCode: args.scheme?.code ?? null,
          componentCode: args.componentCode,
          sourceAmount: score,
          calculatedAmount: amount,
          autoApprove: args.autoApprove,
          payload: {
            achievement_id: achievement.id,
            score,
            score_rate: args.scoreRate,
            target_value: achievement.targetValue,
            achievement_value: achievement.achievementValue,
          },
        }),
      );
    }

    const approvedKpis = await this.employeeKpiRepository.find({
      where: {
        companyId: args.companyId,
        status: EmployeeKpiStatusEnum.APPROVED,
      },
    });
    for (const kpi of approvedKpis.filter((item) =>
      args.performancePeriodId
        ? item.performancePeriodId === args.performancePeriodId
        : item.dueDate >= args.period.startDate &&
          item.dueDate <= args.period.endDate,
    )) {
      const actual = kpi.actualValue ?? kpi.targetValue;
      if (!actual) continue;
      const target = Number(kpi.targetValue ?? actual);
      const score =
        target > 0 ? String((Number(actual) / target) * 100) : actual;
      if (Number(score) < args.minimumScore) continue;
      const amount = this.sourceAmountFromScore(score, args.scoreRate);
      if (PayrollMoney.toCents(amount) <= 0n) continue;
      rows.push(
        await this.upsertGeneratedSource(args.actor, {
          companyId: args.companyId,
          payrollPeriodId: args.period.id,
          employeeId: kpi.employeeId,
          sourceType: 'KPI',
          sourceReference: `EMPLOYEE_KPI:${kpi.id}`,
          schemeCode: args.scheme?.code ?? null,
          componentCode: args.componentCode,
          sourceAmount: score,
          calculatedAmount: amount,
          autoApprove: args.autoApprove,
          payload: {
            employee_kpi_id: kpi.id,
            title: kpi.title,
            target_value: kpi.targetValue,
            actual_value: kpi.actualValue,
            score,
            score_rate: args.scoreRate,
          },
        }),
      );
    }
    return rows;
  }

  private async generatePerformanceSources(args: {
    actor: AuthenticatedUser;
    companyId: number;
    period: PayrollPeriod;
    dto: GeneratePayrollSourceRecordsDto;
    componentCode: string;
    scheme: PayrollBonusScheme | null;
    scoreRate: string;
    minimumScore: number;
    autoApprove: boolean;
  }) {
    const qb = this.performanceAggregateRepository
      .createQueryBuilder('aggregate')
      .where('aggregate.companyId = :companyId', { companyId: args.companyId })
      .andWhere('aggregate.publishedAt IS NOT NULL');
    if (args.dto.financial_year_id) {
      qb.andWhere('aggregate.financialYearId = :financialYearId', {
        financialYearId: args.dto.financial_year_id,
      });
    }
    if (args.dto.period_type) {
      qb.andWhere('aggregate.periodType = :periodType', {
        periodType: args.dto.period_type,
      });
    }
    if (args.dto.sequence_number) {
      qb.andWhere('aggregate.sequenceNumber = :sequenceNumber', {
        sequenceNumber: args.dto.sequence_number,
      });
    }
    const aggregates = await qb.getMany();
    const rows: PayrollSourceRecord[] = [];
    for (const aggregate of aggregates) {
      if (Number(aggregate.aggregateScore) < args.minimumScore) continue;
      const amount = this.sourceAmountFromScore(
        aggregate.aggregateScore,
        args.scoreRate,
      );
      if (PayrollMoney.toCents(amount) <= 0n) continue;
      rows.push(
        await this.upsertGeneratedSource(args.actor, {
          companyId: args.companyId,
          payrollPeriodId: args.period.id,
          employeeId: aggregate.employeeId,
          sourceType: 'PERFORMANCE',
          sourceReference: `PERFORMANCE_AGGREGATE:${aggregate.id}`,
          schemeCode: args.scheme?.code ?? null,
          componentCode: args.componentCode,
          sourceAmount: aggregate.aggregateScore,
          calculatedAmount: amount,
          autoApprove: args.autoApprove,
          payload: {
            performance_aggregate_id: aggregate.id,
            aggregate_score: aggregate.aggregateScore,
            rating_code: aggregate.ratingCode,
            score_rate: args.scoreRate,
            period_type: aggregate.periodType,
            sequence_number: aggregate.sequenceNumber,
          },
        }),
      );
    }
    return rows;
  }
}

@Injectable()
export class PayrollOvertimeApprovalService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PayrollAuditService,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
  ) {}

  list(actor: AuthenticatedUser, query: PayrollOvertimeApprovalQueryDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const qb = this.attendanceRepository
      .createQueryBuilder('summary')
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.overtimeMinutes > 0')
      .orderBy('summary.attendanceDate', 'DESC')
      .addOrderBy('summary.employeeId', 'ASC');
    if (query.employee_id) {
      qb.andWhere('summary.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    if (query.start_date) {
      qb.andWhere('summary.attendanceDate >= :startDate', {
        startDate: query.start_date,
      });
    }
    if (query.end_date) {
      qb.andWhere('summary.attendanceDate <= :endDate', {
        endDate: query.end_date,
      });
    }
    const status = String(query.status ?? 'PENDING').toUpperCase();
    if (status === 'APPROVED') {
      qb.andWhere(
        "(summary.flags ->> 'otApprovalStatus' = 'APPROVED' OR summary.flags ->> 'overtimeApproved' = 'true')",
      );
    } else if (status === 'REJECTED') {
      qb.andWhere("summary.flags ->> 'otApprovalStatus' = 'REJECTED'");
    } else if (status !== 'ALL') {
      qb.andWhere(
        "(summary.flags IS NULL OR COALESCE(summary.flags ->> 'otApprovalStatus', 'PENDING') = 'PENDING')",
      );
    }
    return qb.getMany();
  }

  async approve(
    actor: AuthenticatedUser,
    id: number,
    dto: DecidePayrollOvertimeDto,
  ) {
    return this.decide(actor, id, 'APPROVED', dto);
  }

  async reject(
    actor: AuthenticatedUser,
    id: number,
    dto: DecidePayrollOvertimeDto,
  ) {
    return this.decide(actor, id, 'REJECTED', dto);
  }

  private async decide(
    actor: AuthenticatedUser,
    id: number,
    status: 'APPROVED' | 'REJECTED',
    dto: DecidePayrollOvertimeDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const summary = await this.attendanceRepository.findOne({
      where: { id, companyId },
    });
    if (!summary) throw new NotFoundException('Overtime record not found.');
    const approved = status === 'APPROVED';
    summary.flags = {
      ...(summary.flags ?? {}),
      overtimeApproved: approved,
      otApproved: approved,
      payrollApproved: approved,
      otApprovalStatus: status,
      otApprovalComments: dto.comments ?? null,
      otApprovedByCompanyUserId: actor.companyMembershipId ?? null,
      otApprovedAt: new Date().toISOString(),
    };
    const saved = await this.attendanceRepository.save(summary);
    await this.auditService.log({
      actor,
      action:
        status === 'APPROVED'
          ? 'payroll.overtime.approved'
          : 'payroll.overtime.rejected',
      entityType: 'ATTENDANCE_DAILY_SUMMARY',
      entityId: summary.id,
      summary: {
        employee_id: summary.employeeId,
        attendance_date: summary.attendanceDate,
        overtime_minutes: summary.overtimeMinutes,
      },
    });
    return saved;
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
    const effectiveEnd = [args.periodEnd, args.exitDate]
      .filter(Boolean)
      .sort()[0]!;

    if (effectiveEnd < effectiveStart) {
      return { numerator: 0, denominator: 1 };
    }

    const denominator =
      args.method === 'FIXED_30'
        ? 30
        : daysInclusive(args.periodStart, args.periodEnd);
    const numerator = Math.min(
      denominator,
      daysInclusive(effectiveStart, effectiveEnd),
    );

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
          item.upperLimit === null
            ? null
            : PayrollMoney.toCents(item.upperLimit);
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
    const rules: Array<{
      scheme: StatutoryScheme;
      rule: StatutoryRuleVersion;
      bands: StatutoryTaxBand[];
    }> = [];
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

  calculateTax(
    taxableIncome: string,
    rule: StatutoryRuleVersion,
    bands: StatutoryTaxBand[],
  ) {
    if (
      rule.calculationMethod === PayrollCalculationMethodEnum.PROGRESSIVE_BANDS
    ) {
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
    @InjectRepository(PayrollOvertimePolicy)
    private readonly overtimePolicyRepository: Repository<PayrollOvertimePolicy>,
    @InjectRepository(PayrollBonusScheme)
    private readonly bonusSchemeRepository: Repository<PayrollBonusScheme>,
    @InjectRepository(PayrollGroup)
    private readonly groupRepository: Repository<PayrollGroup>,
    @InjectRepository(PayrollGroupAssignment)
    private readonly groupAssignmentRepository: Repository<PayrollGroupAssignment>,
    @InjectRepository(AttendanceHoliday)
    private readonly holidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(PayrollLeaveRule)
    private readonly leaveRuleRepository: Repository<PayrollLeaveRule>,
  ) {}

  async calculateRun(
    companyId: number,
    period: PayrollPeriod,
    run: PayrollRun,
  ) {
    const payrollGroup = run.payrollGroupId
      ? await this.groupRepository.findOne({
          where: { id: run.payrollGroupId, companyId, status: 'ACTIVE' },
        })
      : null;
    const assignedEmployeeIds = payrollGroup
      ? new Set(
          (
            await this.groupAssignmentRepository
              .createQueryBuilder('assignment')
              .where('assignment.companyId = :companyId', { companyId })
              .andWhere('assignment.payrollGroupId = :payrollGroupId', {
                payrollGroupId: payrollGroup.id,
              })
              .andWhere('assignment.status = :status', { status: 'ACTIVE' })
              .andWhere('assignment.effectiveFrom <= :periodEnd', {
                periodEnd: period.endDate,
              })
              .andWhere(
                '(assignment.effectiveTo IS NULL OR assignment.effectiveTo >= :periodStart)',
                { periodStart: period.startDate },
              )
              .getMany()
          ).map((assignment) => assignment.employeeId),
        )
      : new Set<number>();
    const profiles = await this.profileRepository.find({
      where: { companyId, payrollEnabled: true, payrollHold: false },
      order: { employeeId: 'ASC' },
    });
    const components = await this.componentRepository.find({
      where: { companyId, status: 'ACTIVE' },
      order: { calculationOrder: 'ASC', code: 'ASC' },
    });
    const componentMap = new Map(components.map((item) => [item.code, item]));
    const rules = await this.statutoryService.getApprovedRules(
      companyId,
      period.endDate,
    );

    const outputs: CalculatedPayrollEmployee[] = [];
    for (const profile of profiles) {
      const employee = await this.employeeRepository.findOne({
        where: { id: profile.employeeId, company_id: companyId },
      });
      if (!employee) continue;
      if (
        payrollGroup &&
        !this.employeeMatchesPayrollGroup(
          employee,
          profile,
          payrollGroup,
          assignedEmployeeIds,
        )
      ) {
        continue;
      }
      const compensation = await this.findCompensation(
        companyId,
        employee.id,
        period,
      );
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

  private employeeMatchesPayrollGroup(
    employee: Employee,
    profile: EmployeePayrollProfile,
    group: PayrollGroup,
    assignedEmployeeIds: Set<number>,
  ) {
    if (assignedEmployeeIds.has(employee.id)) return true;
    if (group.branchId && employee.primary_branch_id !== group.branchId) {
      return false;
    }
    if (
      group.departmentId &&
      employee.primary_department_id !== group.departmentId
    ) {
      return false;
    }
    if (
      group.employmentType &&
      String(employee.employment_type ?? '').toUpperCase() !==
        group.employmentType.toUpperCase()
    ) {
      return false;
    }
    if (
      group.employeeCategory &&
      ![
        employee.employment_type,
        employee.employment_status,
        profile.employmentTaxCategory,
        profile.taxResidencyCode,
      ]
        .filter(Boolean)
        .map((value) => String(value).toUpperCase())
        .includes(group.employeeCategory.toUpperCase())
    ) {
      return false;
    }
    if (
      group.frequency &&
      profile.payFrequency &&
      group.frequency.toUpperCase() !== profile.payFrequency.toUpperCase()
    ) {
      return false;
    }
    return true;
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
    rules: Array<{
      scheme: StatutoryScheme;
      rule: StatutoryRuleVersion;
      bands: StatutoryTaxBand[];
    }>;
  }) {
    const { companyId, period, employee, profile, compensation } = args;
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
      ? await this.bankRepository.findOne({
          where: { id: profile.primaryBankAccountId },
        })
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
      .andWhere(
        '(input.employeeId = :employeeId OR input.employeeId IS NULL)',
        {
          employeeId: employee.id,
        },
      )
      .getMany();
    const financeInstructions =
      await this.employeeFinancePayrollInstructionService.reserveForPayrollRun(
        companyId,
        period.id,
        args.run.id,
        employee.id,
      );

    const attendanceSummary = await this.summarizeAttendance(
      companyId,
      employee.id,
      period,
    );
    const leaveSummary = await this.summarizeLeave(
      companyId,
      employee.id,
      period,
    );
    const leaveWithoutPayDays = leaveSummary.unpaidEquivalentDays;
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

    const overtimePolicy = await this.activeOvertimePolicy(
      companyId,
      period.endDate,
    );
    if (
      overtimePolicy &&
      (overtimePolicy.approvalRequired === false
        ? attendanceSummary.overtimeMinutes
        : attendanceSummary.payableOvertimeMinutes) >=
        overtimePolicy.minimumMinutes
    ) {
      const payableOvertime =
        overtimePolicy.approvalRequired === false
          ? {
              regular:
                attendanceSummary.regularOvertimeMinutes +
                attendanceSummary.pendingOvertimeApprovalMinutes,
              weekend: attendanceSummary.weekendOvertimeMinutes,
              holiday: attendanceSummary.holidayOvertimeMinutes,
              total: attendanceSummary.overtimeMinutes,
              pending: 0,
            }
          : {
              regular: attendanceSummary.regularOvertimeMinutes,
              weekend: attendanceSummary.weekendOvertimeMinutes,
              holiday: attendanceSummary.holidayOvertimeMinutes,
              total: attendanceSummary.payableOvertimeMinutes,
              pending: attendanceSummary.pendingOvertimeApprovalMinutes,
            };
      const configuredWorkDays = Number(
        overtimePolicy.configuration?.working_days_per_month ??
          this.configService.get<number>('PAYROLL_DEFAULT_WORKING_DAYS', 26),
      );
      const configuredWorkHours = Number(
        overtimePolicy.configuration?.working_hours_per_day ??
          this.configService.get<number>('PAYROLL_DEFAULT_WORKING_HOURS', 8),
      );
      const hourlyRate = PayrollMoney.multiplyRatio(
        compensation.baseSalary,
        1,
        Math.max(1, configuredWorkDays * configuredWorkHours),
      );
      const regularBase = PayrollMoney.multiplyRatio(
        hourlyRate,
        payableOvertime.regular,
        60,
      );
      const weekendBase = PayrollMoney.multiplyRatio(
        hourlyRate,
        payableOvertime.weekend,
        60,
      );
      const holidayBase = PayrollMoney.multiplyRatio(
        hourlyRate,
        payableOvertime.holiday,
        60,
      );
      const overtimeAmount = PayrollMoney.add(
        PayrollMoney.multiplyFactor(
          regularBase,
          overtimePolicy.regularMultiplier,
        ),
        PayrollMoney.multiplyFactor(
          weekendBase,
          overtimePolicy.weekendMultiplier,
        ),
        PayrollMoney.multiplyFactor(
          holidayBase,
          overtimePolicy.holidayMultiplier,
        ),
      );
      if (PayrollMoney.toCents(overtimeAmount) > 0n) {
        lineItems.push({
          componentCode: overtimePolicy.componentCode,
          componentName: overtimePolicy.name,
          componentType: PayrollComponentTypeEnum.EARNING,
          amount: overtimeAmount,
          taxableAmount: overtimeAmount,
          employerAmount: '0.00',
          calculationOrder: 30,
          sourceType: 'ATTENDANCE_OVERTIME',
          sourceReference: `${employee.id}:${period.id}`,
          calculationSnapshot: {
            overtime_minutes: payableOvertime.total,
            regular_minutes: payableOvertime.regular,
            weekend_minutes: payableOvertime.weekend,
            holiday_minutes: payableOvertime.holiday,
            pending_approval_minutes: payableOvertime.pending,
            hourly_rate: hourlyRate,
            multipliers: {
              regular: overtimePolicy.regularMultiplier,
              weekend: overtimePolicy.weekendMultiplier,
              holiday: overtimePolicy.holidayMultiplier,
            },
            policy_id: overtimePolicy.id,
          },
        });
      }
    }

    const bonusLines = await this.calculateBonusSchemeLines({
      companyId,
      period,
      run: args.run,
      employee,
      compensation,
      inputs,
      componentMap: args.componentMap,
      basicPay,
      existingComponentCodes: new Set(
        lineItems.map((line) => line.componentCode).filter(Boolean) as string[],
      ),
    });
    lineItems.push(...bonusLines);

    const arrearsLine = await this.calculateArrearsLine({
      companyId,
      period,
      run: args.run,
      employee,
      compensation,
    });
    if (arrearsLine) lineItems.push(arrearsLine);

    for (const input of inputs) {
      const component = args.componentMap.get(input.componentCode);
      const componentType =
        component?.componentType ?? PayrollComponentTypeEnum.EARNING;
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
      return (
        item.componentType === PayrollComponentTypeEnum.EARNING &&
        (component?.pensionable ?? true)
      );
    });
    const healthGross = this.sumLines(lineItems, (item) => {
      const component = args.componentMap.get(item.componentCode!);
      return (
        item.componentType === PayrollComponentTypeEnum.EARNING &&
        (component?.healthInsuranceApplicable ?? false)
      );
    });

    let pretaxDeductions = '0.00';
    for (const statutory of args.rules) {
      if (
        statutory.scheme.schemeType !== StatutorySchemeTypeEnum.PENSION &&
        statutory.scheme.schemeType !==
          StatutorySchemeTypeEnum.HEALTH_INSURANCE &&
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
            statutory.scheme.schemeType ===
            StatutorySchemeTypeEnum.EMPLOYER_LEVY
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
      this.sumLines(
        lineItems,
        (item) => PayrollMoney.toCents(item.taxableAmount ?? '0') > 0n,
      ),
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

    const gross = this.sumLines(lineItems, (item) =>
      [
        PayrollComponentTypeEnum.EARNING,
        PayrollComponentTypeEnum.REIMBURSEMENT,
        PayrollComponentTypeEnum.TAXABLE_BENEFIT,
      ].includes(item.componentType as PayrollComponentTypeEnum),
    );
    const statutoryAndInputDeductions = this.sumLines(
      lineItems,
      (item) => item.componentType === PayrollComponentTypeEnum.DEDUCTION,
    );
    const financeAllocation = await this.applyFinanceDeductionCapacity({
      gross,
      deductionsBeforeFinance: statutoryAndInputDeductions,
      financeInstructions,
    });
    for (const allocation of financeAllocation.applied) {
      lineItems.push({
        componentCode: allocation.instruction.componentCode,
        componentName:
          allocation.instruction.componentCode === 'SALARY_ADVANCE'
            ? 'Salary advance repayment'
            : 'Staff loan repayment',
        componentType: PayrollComponentTypeEnum.DEDUCTION,
        amount: allocation.appliedAmount,
        taxableAmount: '0.00',
        employerAmount: '0.00',
        calculationOrder:
          allocation.instruction.componentCode === 'SALARY_ADVANCE' ? 940 : 950,
        sourceType: 'EMPLOYEE_FINANCE',
        sourceReference: String(allocation.instruction.id),
        calculationSnapshot: allocation.instruction.snapshot,
      });
    }
    const taxable = this.sumLines(
      lineItems,
      (item) => PayrollMoney.toCents(item.taxableAmount ?? '0') > 0n,
    );
    const deductions = this.sumLines(
      lineItems,
      (item) => item.componentType === PayrollComponentTypeEnum.DEDUCTION,
    );
    const employerContributions = this.sumLines(
      lineItems,
      (item) =>
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
    const warnings = await this.buildWarnings(
      companyId,
      employee.id,
      period,
      bank,
    );
    for (const shortfall of financeAllocation.shortfalls) {
      warnings.push({
        code: 'EMPLOYEE_FINANCE_DEDUCTION_SHORTFALL',
        component_code: shortfall.componentCode,
        requested_amount: shortfall.requestedAmount,
        applied_amount: shortfall.appliedAmount,
        deferred_amount: shortfall.deferredAmount,
        source_reference: shortfall.sourceReference,
      });
    }
    const errors = this.buildCriticalErrors({
      employee,
      profile,
      bank,
      attendanceSummary,
      netPay,
    });
    const calculationSnapshot = {
      period: period.periodCode,
      proration_factor: factor,
      attendance: attendanceSummary,
      leave: leaveSummary,
      leave_without_pay_days: leaveWithoutPayDays,
      line_count: lineItems.length,
      statutory_rule_ids: args.rules.map((item) => item.rule.id),
      minimum_net_pay: financeAllocation.minimumNetPay,
      finance_deduction_capacity: financeAllocation.capacity,
    };
    const inputSnapshot = {
      input_ids: inputs.map((item) => item.id),
      employee_finance_instruction_ids: financeInstructions.map(
        (item) => item.id,
      ),
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
      deductionShortfalls: financeAllocation.shortfalls,
      result: {
        status:
          errors.length > 0
            ? EmployeePayrollResultStatusEnum.ERROR
            : warnings.length > 0
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
        errors,
      },
    };
  }

  private async calculateBonusSchemeLines(args: {
    companyId: number;
    period: PayrollPeriod;
    run: PayrollRun;
    employee: Employee;
    compensation: EmployeeCompensationVersion;
    inputs: PayrollInput[];
    componentMap: Map<string, PayrollComponent>;
    basicPay: string;
    existingComponentCodes: Set<string>;
  }): Promise<Array<Partial<EmployeePayrollLineItem>>> {
    const schemes = await this.bonusSchemeRepository
      .createQueryBuilder('scheme')
      .where('scheme.companyId = :companyId', { companyId: args.companyId })
      .andWhere('scheme.status = :status', { status: 'ACTIVE' })
      .andWhere('scheme.effectiveFrom <= :date', { date: args.period.endDate })
      .andWhere('(scheme.effectiveTo IS NULL OR scheme.effectiveTo >= :date)', {
        date: args.period.startDate,
      })
      .orderBy('scheme.id', 'ASC')
      .getMany();

    const lines: Array<Partial<EmployeePayrollLineItem>> = [];
    for (const scheme of schemes) {
      if (args.existingComponentCodes.has(scheme.componentCode)) continue;
      const configuration = scheme.configuration ?? {};
      const autoApply =
        args.run.runType === PayrollRunTypeEnum.BONUS ||
        args.run.runType === PayrollRunTypeEnum.SUPPLEMENTARY ||
        configuration.auto_apply === true;
      const sourceInput = args.inputs.find((input) => {
        const module = input.sourceModule.toUpperCase();
        return (
          input.componentCode === scheme.componentCode ||
          input.sourceReference === scheme.code ||
          (['SALES', 'KPI', 'PERFORMANCE', 'COMMISSION'].includes(module) &&
            (input.employeeId === args.employee.id ||
              input.employeeId === null))
        );
      });
      if (!autoApply && !sourceInput) continue;

      const basis = sourceInput?.amount ?? args.basicPay;
      let amount = scheme.defaultAmount ?? '0.00';
      const method = scheme.calculationMethod.toUpperCase();
      const configuredDefaultRate = configuration.default_rate;
      if (sourceInput && !scheme.defaultAmount && !scheme.defaultRate) {
        amount = sourceInput.amount;
      } else if (
        [
          'PERCENTAGE_OF_BASE',
          'PERCENTAGE_OF_GROSS',
          'PERCENTAGE_OF_SALES',
          'FORMULA',
        ].includes(method)
      ) {
        amount = PayrollMoney.multiplyPercent(
          method === 'PERCENTAGE_OF_BASE'
            ? args.compensation.baseSalary
            : basis,
          scheme.defaultRate ??
            (typeof configuredDefaultRate === 'string' ||
            typeof configuredDefaultRate === 'number'
              ? String(configuredDefaultRate)
              : '0'),
        );
      }

      if (PayrollMoney.toCents(amount) <= 0n) continue;
      const component = args.componentMap.get(scheme.componentCode);
      lines.push({
        componentCode: scheme.componentCode,
        componentName: scheme.name,
        componentType: PayrollComponentTypeEnum.EARNING,
        amount,
        taxableAmount: this.taxableAmount(amount, component),
        employerAmount: '0.00',
        calculationOrder: component?.calculationOrder ?? 80,
        sourceType: scheme.schemeType.toUpperCase(),
        sourceReference: sourceInput
          ? String(sourceInput.id)
          : `BONUS_SCHEME:${scheme.id}`,
        calculationSnapshot: {
          scheme_id: scheme.id,
          scheme_code: scheme.code,
          calculation_method: scheme.calculationMethod,
          source_input_id: sourceInput?.id ?? null,
          basis,
          default_rate: scheme.defaultRate,
        },
      });
    }
    return lines;
  }

  private async calculateArrearsLine(args: {
    companyId: number;
    period: PayrollPeriod;
    run: PayrollRun;
    employee: Employee;
    compensation: EmployeeCompensationVersion;
  }): Promise<Partial<EmployeePayrollLineItem> | null> {
    const shouldEvaluate =
      [PayrollRunTypeEnum.ARREARS, PayrollRunTypeEnum.ADJUSTMENT].includes(
        args.run.runType,
      ) ||
      (args.compensation.effectiveFrom < args.period.startDate &&
        args.compensation.createdAt >=
          new Date(`${args.period.startDate}T00:00:00.000Z`));
    if (!shouldEvaluate) return null;

    const previous = await this.compensationRepository
      .createQueryBuilder('compensation')
      .where('compensation.companyId = :companyId', {
        companyId: args.companyId,
      })
      .andWhere('compensation.employeeId = :employeeId', {
        employeeId: args.employee.id,
      })
      .andWhere('compensation.id != :id', { id: args.compensation.id })
      .andWhere('compensation.effectiveFrom < :effectiveFrom', {
        effectiveFrom: args.compensation.effectiveFrom,
      })
      .orderBy('compensation.effectiveFrom', 'DESC')
      .getOne();
    if (!previous) return null;

    const delta = PayrollMoney.add(
      args.compensation.baseSalary,
      PayrollMoney.fromCents(-PayrollMoney.toCents(previous.baseSalary)),
    );
    if (PayrollMoney.toCents(delta) === 0n) return null;
    const retroEnd =
      args.compensation.effectiveFrom < args.period.startDate
        ? new Date(
            new Date(`${args.period.startDate}T00:00:00.000Z`).getTime() -
              24 * 60 * 60 * 1000,
          )
            .toISOString()
            .slice(0, 10)
        : args.period.endDate;
    const retroDays = Math.max(
      0,
      daysInclusive(args.compensation.effectiveFrom, retroEnd),
    );
    if (retroDays <= 0) return null;
    const amount = PayrollMoney.multiplyRatio(delta, retroDays, 30);
    if (PayrollMoney.toCents(amount) === 0n) return null;
    return {
      componentCode: 'ARREARS',
      componentName: 'Retroactive salary arrears',
      componentType:
        PayrollMoney.toCents(amount) > 0n
          ? PayrollComponentTypeEnum.EARNING
          : PayrollComponentTypeEnum.DEDUCTION,
      amount:
        PayrollMoney.toCents(amount) > 0n
          ? amount
          : PayrollMoney.fromCents(-PayrollMoney.toCents(amount)),
      taxableAmount: PayrollMoney.toCents(amount) > 0n ? amount : '0.00',
      employerAmount: '0.00',
      calculationOrder: 85,
      sourceType: 'RETROACTIVE_COMPENSATION',
      sourceReference: String(args.compensation.id),
      calculationSnapshot: {
        current_compensation_id: args.compensation.id,
        previous_compensation_id: previous.id,
        current_base_salary: args.compensation.baseSalary,
        previous_base_salary: previous.baseSalary,
        retro_days: retroDays,
      },
    };
  }

  private async findCompensation(
    companyId: number,
    employeeId: number,
    period: PayrollPeriod,
  ) {
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

  private async summarizeLeave(
    companyId: number,
    employeeId: number,
    period: PayrollPeriod,
  ) {
    const leaves = await this.leaveRepository
      .createQueryBuilder('leaveRequest')
      .leftJoinAndSelect('leaveRequest.leave_type', 'leaveType')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status = :status', {
        status: LeaveStatusEnum.APPROVED,
      })
      .andWhere('leaveRequest.start_date <= :periodEnd', {
        periodEnd: period.endDate,
      })
      .andWhere('leaveRequest.end_date >= :periodStart', {
        periodStart: period.startDate,
      })
      .getMany();
    const rules = await this.leaveRuleRepository
      .createQueryBuilder('rule')
      .where('rule.companyId = :companyId', { companyId })
      .andWhere('rule.status = :status', { status: 'ACTIVE' })
      .andWhere('rule.effectiveFrom <= :periodEnd', {
        periodEnd: period.endDate,
      })
      .andWhere(
        '(rule.effectiveTo IS NULL OR rule.effectiveTo >= :periodStart)',
        {
          periodStart: period.startDate,
        },
      )
      .orderBy('rule.effectiveFrom', 'DESC')
      .getMany();
    const rulesByType = new Map(
      rules.map((rule) => [rule.leaveTypeCode.toUpperCase(), rule]),
    );
    return leaves.reduce(
      (summary, leave) => {
        const type = leave.leave_type as unknown as {
          code?: string;
          name?: string;
          is_paid?: boolean;
          paid_percentage?: string;
          payroll_paid_percentage?: string;
          payroll_behavior?: string;
        };
        const start =
          leave.start_date > period.startDate
            ? leave.start_date
            : period.startDate;
        const end =
          leave.end_date < period.endDate ? leave.end_date : period.endDate;
        const days = daysInclusive(start, end);
        const rule = type?.code
          ? rulesByType.get(String(type.code).toUpperCase())
          : undefined;
        const split = this.leavePayrollSplit(days, type, rule);
        const paidPercentage =
          days > 0 ? (split.paidEquivalentDays / days) * 100 : 0;
        const paidEquivalent = split.paidEquivalentDays;
        const unpaidEquivalent = split.unpaidEquivalentDays;
        summary.paidDays += paidPercentage > 0 ? days : 0;
        summary.unpaidDays += paidPercentage <= 0 ? days : 0;
        summary.paidEquivalentDays += paidEquivalent;
        summary.unpaidEquivalentDays += unpaidEquivalent;
        summary.leaveRequestIds.push(leave.id);
        if (type?.code) {
          summary.byType[type.code] = (summary.byType[type.code] ?? 0) + days;
          summary.policyBreakdown[type.code] = {
            code: type.code,
            name: type.name ?? type.code,
            days: (summary.policyBreakdown[type.code]?.days ?? 0) + days,
            paid_percentage: paidPercentage,
            rule_id: rule?.id ?? null,
            paid_equivalent_days:
              (summary.policyBreakdown[type.code]?.paid_equivalent_days ?? 0) +
              paidEquivalent,
            unpaid_equivalent_days:
              (summary.policyBreakdown[type.code]?.unpaid_equivalent_days ??
                0) + unpaidEquivalent,
          };
        }
        return summary;
      },
      {
        paidDays: 0,
        unpaidDays: 0,
        paidEquivalentDays: 0,
        unpaidEquivalentDays: 0,
        leaveRequestIds: [] as number[],
        byType: {} as Record<string, number>,
        policyBreakdown: {} as Record<
          string,
          {
            code: string;
            name: string;
            days: number;
            paid_percentage: number;
            rule_id: number | null;
            paid_equivalent_days: number;
            unpaid_equivalent_days: number;
          }
        >,
      },
    );
  }

  private leavePayrollSplit(
    days: number,
    type:
      | {
          code?: string;
          is_paid?: boolean;
          paid_percentage?: string;
          payroll_paid_percentage?: string;
          payroll_behavior?: string;
        }
      | undefined,
    rule?: PayrollLeaveRule,
  ) {
    if (!rule) {
      const paidPercentage = this.leavePaidPercentage(type);
      const paidEquivalentDays = (days * paidPercentage) / 100;
      return {
        paidEquivalentDays,
        unpaidEquivalentDays: days - paidEquivalentDays,
      };
    }

    let remaining = days;
    let paidEquivalentDays = 0;
    const paidCap = Number(rule.paidDaysCap ?? '');
    const halfAfter = Number(rule.halfPayAfterDays ?? '');
    const unpaidAfter = Number(rule.unpaidAfterDays ?? '');
    const defaultPaidPercentage = Number(rule.paidPercentage ?? '100');

    if (
      Number.isFinite(unpaidAfter) &&
      unpaidAfter >= 0 &&
      days > unpaidAfter
    ) {
      remaining = unpaidAfter;
    }
    if (Number.isFinite(paidCap) && paidCap >= 0) {
      const fullPaidDays = Math.min(remaining, paidCap);
      paidEquivalentDays +=
        (fullPaidDays * Math.min(100, Math.max(0, defaultPaidPercentage))) /
        100;
      remaining -= fullPaidDays;
    }
    if (remaining > 0 && Number.isFinite(halfAfter) && halfAfter >= 0) {
      const fullBeforeHalfPay = Math.max(0, Math.min(remaining, halfAfter));
      paidEquivalentDays +=
        (fullBeforeHalfPay *
          Math.min(100, Math.max(0, defaultPaidPercentage))) /
        100;
      remaining -= fullBeforeHalfPay;
      paidEquivalentDays += remaining * 0.5;
      remaining = 0;
    }
    if (remaining > 0) {
      paidEquivalentDays +=
        (remaining * Math.min(100, Math.max(0, defaultPaidPercentage))) / 100;
    }

    return {
      paidEquivalentDays,
      unpaidEquivalentDays: days - paidEquivalentDays,
    };
  }

  private leavePaidPercentage(type?: {
    code?: string;
    is_paid?: boolean;
    paid_percentage?: string;
    payroll_paid_percentage?: string;
    payroll_behavior?: string;
  }) {
    if (!type) return 100;
    const configured = Number(
      type.payroll_paid_percentage ?? type.paid_percentage ?? '',
    );
    if (Number.isFinite(configured)) {
      return Math.min(100, Math.max(0, configured));
    }
    const behavior = String(type.payroll_behavior ?? '').toUpperCase();
    const code = String(type.code ?? '').toUpperCase();
    if (behavior.includes('UNPAID') || code.includes('LWP')) return 0;
    if (behavior.includes('HALF') || code.includes('HALF')) return 50;
    if (type.is_paid === false) return 0;
    return 100;
  }

  private async summarizeAttendance(
    companyId: number,
    employeeId: number,
    period: PayrollPeriod,
  ) {
    const summaries = await this.attendanceRepository
      .createQueryBuilder('summary')
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.employeeId = :employeeId', { employeeId })
      .andWhere('summary.attendanceDate >= :periodStart', {
        periodStart: period.startDate,
      })
      .andWhere('summary.attendanceDate <= :periodEnd', {
        periodEnd: period.endDate,
      })
      .getMany();
    const holidays = await this.holidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.companyId = :companyId', { companyId })
      .andWhere('holiday.date >= :periodStart', {
        periodStart: period.startDate,
      })
      .andWhere('holiday.date <= :periodEnd', { periodEnd: period.endDate })
      .getMany();
    const holidayDates = new Set(holidays.map((holiday) => holiday.date));
    return summaries.reduce(
      (acc, summary) => {
        const status = String(summary.attendanceStatus ?? '').toUpperCase();
        const flags = summary.flags ?? {};
        const isHoliday =
          Boolean(flags.isHoliday ?? flags.holiday) ||
          holidayDates.has(summary.attendanceDate);
        const day = new Date(
          `${summary.attendanceDate}T00:00:00.000Z`,
        ).getUTCDay();
        const isWeekend = day === 0 || day === 6 || Boolean(flags.isWeekend);
        const overtimeMinutes = summary.overtimeMinutes ?? 0;
        const overtimeApproved =
          flags.overtimeApproved === true ||
          flags.otApproved === true ||
          flags.payrollApproved === true;
        if (status.includes('ABSENT')) acc.absentDays += 1;
        if (
          summary.workMinutes > 0 ||
          ['PRESENT', 'LATE', 'HALF_DAY'].some((value) =>
            status.includes(value),
          )
        ) {
          acc.daysWorked += 1;
        }
        acc.lateMinutes += summary.lateMinutes ?? 0;
        acc.earlyDepartureMinutes += summary.earlyDepartureMinutes ?? 0;
        acc.workMinutes += summary.workMinutes ?? 0;
        acc.overtimeMinutes += overtimeMinutes;
        if (overtimeMinutes > 0 && !overtimeApproved) {
          acc.pendingOvertimeApprovalMinutes += overtimeMinutes;
        } else if (isHoliday) {
          acc.holidayOvertimeMinutes += overtimeMinutes;
          acc.payableOvertimeMinutes += overtimeMinutes;
        } else if (isWeekend) {
          acc.weekendOvertimeMinutes += overtimeMinutes;
          acc.payableOvertimeMinutes += overtimeMinutes;
        } else {
          acc.regularOvertimeMinutes += overtimeMinutes;
          acc.payableOvertimeMinutes += overtimeMinutes;
        }
        if (!summary.finalizedAt) acc.unfinalizedCount += 1;
        return acc;
      },
      {
        summaryCount: summaries.length,
        daysWorked: 0,
        absentDays: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        workMinutes: 0,
        overtimeMinutes: 0,
        payableOvertimeMinutes: 0,
        regularOvertimeMinutes: 0,
        weekendOvertimeMinutes: 0,
        holidayOvertimeMinutes: 0,
        pendingOvertimeApprovalMinutes: 0,
        unfinalizedCount: 0,
      },
    );
  }

  private activeOvertimePolicy(companyId: number, date: string) {
    return this.overtimePolicyRepository
      .createQueryBuilder('policy')
      .where('policy.companyId = :companyId', { companyId })
      .andWhere('policy.status = :status', { status: 'ACTIVE' })
      .andWhere('policy.effectiveFrom <= :date', { date })
      .andWhere('(policy.effectiveTo IS NULL OR policy.effectiveTo >= :date)', {
        date,
      })
      .orderBy('policy.effectiveFrom', 'DESC')
      .getOne();
  }

  private taxableAmount(amount: string, component?: PayrollComponent) {
    if (!component) return amount;
    switch (component.taxTreatment) {
      case PayrollTaxTreatmentEnum.NON_TAXABLE:
      case PayrollTaxTreatmentEnum.TAX_EXEMPT:
        return '0.00';
      case PayrollTaxTreatmentEnum.PARTIALLY_TAXABLE:
        return PayrollMoney.multiplyPercent(
          amount,
          component.taxablePercentage,
        );
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
        .reduce(
          (sum, item) => sum + PayrollMoney.toCents(item[field] ?? '0'),
          0n,
        ),
    );
  }

  private async applyFinanceDeductionCapacity(args: {
    gross: string;
    deductionsBeforeFinance: string;
    financeInstructions: Awaited<
      ReturnType<
        EmployeeFinancePayrollInstructionService['reserveForPayrollRun']
      >
    >;
  }) {
    const minimumNetPay = this.minimumNetPay(args.gross);
    let remainingCapacity = PayrollMoney.toCents(
      PayrollMoney.add(
        args.gross,
        PayrollMoney.fromCents(
          -PayrollMoney.toCents(args.deductionsBeforeFinance) -
            PayrollMoney.toCents(minimumNetPay),
        ),
      ),
    );
    if (remainingCapacity < 0n) remainingCapacity = 0n;

    const applied: Array<{
      instruction: (typeof args.financeInstructions)[number];
      appliedAmount: string;
    }> = [];
    const shortfalls: CalculatedPayrollEmployee['deductionShortfalls'] = [];
    const orderedInstructions = [...args.financeInstructions].sort((a, b) => {
      const priority = (code: string) => (code === 'SALARY_ADVANCE' ? 0 : 1);
      const priorityDiff =
        priority(a.componentCode) - priority(b.componentCode);
      return priorityDiff || a.id - b.id;
    });

    for (const instruction of orderedInstructions) {
      const requestedCents = PayrollMoney.toCents(instruction.amount);
      const appliedCents =
        remainingCapacity > requestedCents ? requestedCents : remainingCapacity;
      remainingCapacity -= appliedCents;

      const appliedAmount = PayrollMoney.fromCents(appliedCents);
      const deferredAmount = PayrollMoney.fromCents(
        requestedCents - appliedCents,
      );
      const updatedInstruction =
        await this.employeeFinancePayrollInstructionService.setReservedAmount(
          instruction,
          appliedAmount,
        );

      if (appliedCents > 0n) {
        applied.push({ instruction: updatedInstruction, appliedAmount });
      }
      if (requestedCents > appliedCents) {
        shortfalls.push({
          componentCode: instruction.componentCode,
          requestedAmount: instruction.amount,
          appliedAmount,
          deferredAmount,
          sourceReference: String(instruction.id),
        });
      }
    }

    return {
      applied,
      shortfalls,
      minimumNetPay,
      capacity: PayrollMoney.fromCents(
        PayrollMoney.toCents(args.gross) -
          PayrollMoney.toCents(args.deductionsBeforeFinance) -
          PayrollMoney.toCents(minimumNetPay),
      ),
    };
  }

  private minimumNetPay(gross: string) {
    const configuredAmount = String(
      this.configService.get<string | number>(
        'PAYROLL_MINIMUM_NET_PAY_AMOUNT',
        '0',
      ),
    );
    const configuredPercentage = String(
      this.configService.get<string | number>(
        'PAYROLL_MINIMUM_NET_PAY_PERCENTAGE',
        '0',
      ),
    );
    const amountFloor = PayrollMoney.toCents(configuredAmount);
    const percentageFloor = PayrollMoney.toCents(
      PayrollMoney.multiplyPercent(gross, configuredPercentage),
    );
    return PayrollMoney.fromCents(
      amountFloor > percentageFloor ? amountFloor : percentageFloor,
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
      warnings.push({
        code: 'UNFINALIZED_ATTENDANCE',
        count: unfinalizedAttendance,
      });
    }
    return warnings;
  }

  private buildCriticalErrors(args: {
    employee: Employee;
    profile: EmployeePayrollProfile;
    bank: EmployeeBankAccount | null;
    attendanceSummary: { summaryCount: number; unfinalizedCount: number };
    netPay: string;
  }) {
    const errors: Record<string, unknown>[] = [];
    if (!args.profile.taxpayerIdentificationNumber) {
      errors.push({
        code: 'MISSING_TAX_IDENTIFICATION_NUMBER',
        severity: 'BLOCKER',
      });
    }
    if (!args.profile.socialSecurityNumber) {
      errors.push({
        code: 'MISSING_PENSION_MEMBERSHIP_NUMBER',
        severity: 'BLOCKER',
      });
    }
    if (!args.bank) {
      errors.push({ code: 'MISSING_BANK_ACCOUNT', severity: 'BLOCKER' });
    } else if (args.bank.verification_status !== 'VERIFIED') {
      errors.push({ code: 'BANK_ACCOUNT_NOT_VERIFIED', severity: 'BLOCKER' });
    }
    if (PayrollMoney.toCents(args.netPay) < 0n) {
      errors.push({
        code: 'NEGATIVE_NET_PAY',
        severity: 'BLOCKER',
        net_pay: args.netPay,
      });
    }
    if (args.employee.exit_date) {
      errors.push({
        code: 'TERMINATED_EMPLOYEE_INCLUDED',
        severity: 'BLOCKER',
        exit_date: args.employee.exit_date,
      });
    }
    if (args.attendanceSummary.summaryCount === 0) {
      errors.push({ code: 'MISSING_ATTENDANCE', severity: 'BLOCKER' });
    }
    if (args.attendanceSummary.unfinalizedCount > 0) {
      errors.push({
        code: 'UNFINALIZED_ATTENDANCE',
        severity: 'BLOCKER',
        count: args.attendanceSummary.unfinalizedCount,
      });
    }
    if (!args.employee.cost_center_id) {
      errors.push({ code: 'MISSING_COST_CENTER', severity: 'BLOCKER' });
    }
    return errors;
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
    @InjectRepository(PayrollDeductionShortfall)
    private readonly shortfallRepository: Repository<PayrollDeductionShortfall>,
    @InjectRepository(PayrollGroup)
    private readonly groupRepository: Repository<PayrollGroup>,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreatePayrollRunDto) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: dto.payroll_period_id, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');
    const group = dto.payroll_group_id
      ? await this.groupRepository.findOne({
          where: { id: dto.payroll_group_id, companyId, status: 'ACTIVE' },
        })
      : null;
    if (dto.payroll_group_id && !group) {
      throw new NotFoundException('Payroll group not found.');
    }
    const count = await this.runRepository.count({ where: { companyId } });
    const run = await this.runRepository.save(
      this.runRepository.create({
        companyId,
        payrollPeriodId: period.id,
        payrollGroupId: group?.id ?? null,
        runNo: `PR-${companyId}-${String(count + 1).padStart(6, '0')}`,
        runType: dto.run_type ?? PayrollRunTypeEnum.REGULAR,
        parentRunId: dto.parent_run_id ?? null,
        offboardingRequestId: dto.offboarding_request_id ?? null,
        configurationSnapshot: group
          ? {
              payroll_group: {
                id: group.id,
                code: group.code,
                name: group.name,
                frequency: group.frequency,
                branch_id: group.branchId,
                department_id: group.departmentId,
                employee_category: group.employeeCategory,
                employment_type: group.employmentType,
                currency: group.currency,
              },
            }
          : null,
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
    if (query.payroll_period_id)
      where.payrollPeriodId = query.payroll_period_id;
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
    if (
      ![
        PayrollRunStatusEnum.DRAFT,
        PayrollRunStatusEnum.VALIDATION_FAILED,
      ].includes(run.status)
    ) {
      throw new ConflictException(
        'Payroll run cannot be processed in its current status.',
      );
    }
    const period = await this.periodRepository.findOne({
      where: { id: run.payrollPeriodId, companyId },
    });
    if (!period) throw new NotFoundException('Payroll period not found.');

    run.status = PayrollRunStatusEnum.PROCESSING;
    run.startedAt = new Date();
    await this.runRepository.save(run);

    const previousResults = await this.resultRepository.find({
      where: { payrollRunId: run.id, companyId },
      select: ['id'],
    });
    if (previousResults.length > 0) {
      await this.shortfallRepository.delete({
        companyId,
        employeePayrollResultId: In(previousResults.map((item) => item.id)),
      });
    }
    await this.lineItemRepository.delete({ payrollRunId: run.id, companyId });
    await this.resultRepository.delete({ payrollRunId: run.id, companyId });

    const calculated = await this.calculationService.calculateRun(
      companyId,
      period,
      run,
    );
    let gross = '0.00';
    let taxable = '0.00';
    let deductions = '0.00';
    let employerContributions = '0.00';
    let net = '0.00';
    let employerCost = '0.00';
    const resultHashes: string[] = [];
    let validationErrorCount = 0;

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
      if (item.deductionShortfalls.length > 0) {
        await this.shortfallRepository.save(
          item.deductionShortfalls.map((shortfall) =>
            this.shortfallRepository.create({
              companyId,
              employeePayrollResultId: savedResult.id,
              componentCode: shortfall.componentCode,
              requestedAmount: shortfall.requestedAmount,
              appliedAmount: shortfall.appliedAmount,
              deferredAmount: shortfall.deferredAmount,
              status: 'OPEN',
            }),
          ),
        );
      }
      if (savedResult.status === EmployeePayrollResultStatusEnum.ERROR) {
        validationErrorCount += 1;
      }
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
      !this.configService.get<boolean>(
        'PAYROLL_ALLOW_NEGATIVE_NET_PAY',
        false,
      ) &&
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
    run.status =
      validationErrorCount > 0
        ? PayrollRunStatusEnum.VALIDATION_FAILED
        : this.configService.get<boolean>('PAYROLL_REQUIRE_HR_APPROVAL', true)
          ? PayrollRunStatusEnum.PENDING_HR_APPROVAL
          : PayrollRunStatusEnum.APPROVED;
    await this.auditService.log({
      actor,
      action: 'payroll.run.calculated',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
      summary: {
        employee_count: run.employeeCount,
        net_pay_total: run.netPayTotal,
        validation_error_count: validationErrorCount,
      },
    });
    return this.runRepository.save(run);
  }

  async approve(
    actor: AuthenticatedUser,
    id: number,
    dto: ApprovePayrollRunDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (!run.calculationHash || run.calculationHash !== dto.calculation_hash) {
      throw new ConflictException(
        'Approval hash must match current payroll hash.',
      );
    }
    if (
      this.configService.get<boolean>('PAYROLL_REQUIRE_MAKER_CHECKER', true) &&
      run.createdByCompanyUserId === (actor.companyMembershipId ?? actor.id)
    ) {
      throw new ForbiddenException(
        'Payroll creator cannot approve the same run.',
      );
    }
    this.assertApprovalStage(run, dto.stage);
    const actorMembershipId = actor.companyMembershipId ?? actor.id;
    if (
      this.configService.get<boolean>(
        'PAYROLL_REQUIRE_DISTINCT_APPROVERS',
        true,
      )
    ) {
      const priorApproval = await this.approvalRepository.findOne({
        where: {
          companyId,
          payrollRunId: run.id,
          approvedByCompanyUserId: actorMembershipId,
        },
      });
      if (priorApproval) {
        throw new ForbiddenException(
          'Payroll approver cannot approve multiple stages for the same run.',
        );
      }
    }

    await this.approvalRepository.save(
      this.approvalRepository.create({
        companyId,
        payrollRunId: run.id,
        stage: dto.stage,
        decision: PayrollApprovalDecisionEnum.APPROVED,
        calculationHash: dto.calculation_hash,
        approvedByCompanyUserId: actorMembershipId,
        comments: dto.comments ?? null,
      }),
    );

    run.status = this.nextApprovalStatus(dto.stage);
    if (run.status === PayrollRunStatusEnum.APPROVED)
      run.approvedAt = new Date();
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

  async validate(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    const results = await this.resultRepository.find({
      where: { companyId, payrollRunId: run.id },
      order: { employeeId: 'ASC' },
    });
    const issues = results.flatMap((result) => [
      ...((result.errors ?? []).map((issue) => ({
        employee_id: result.employeeId,
        payroll_result_id: result.id,
        severity: issue.severity ?? 'BLOCKER',
        ...issue,
      })) as Record<string, unknown>[]),
      ...((result.warnings ?? []).map((issue) => ({
        employee_id: result.employeeId,
        payroll_result_id: result.id,
        severity: issue.severity ?? 'WARNING',
        ...issue,
      })) as Record<string, unknown>[]),
    ]);
    return {
      payroll_run_id: run.id,
      status: run.status,
      blocker_count: issues.filter((issue) => issue.severity === 'BLOCKER')
        .length,
      warning_count: issues.filter((issue) => issue.severity === 'WARNING')
        .length,
      info_count: issues.filter((issue) => issue.severity === 'INFO').length,
      issues,
    };
  }

  async markPaid(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (
      ![
        PayrollRunStatusEnum.LOCKED,
        PayrollRunStatusEnum.PAYMENT_FILE_GENERATED,
      ].includes(run.status)
    ) {
      throw new ConflictException('Only locked payroll can be marked paid.');
    }
    run.status = PayrollRunStatusEnum.PAID;
    await this.resultRepository.update(
      { payrollRunId: run.id, companyId },
      { status: EmployeePayrollResultStatusEnum.PAID },
    );
    await this.periodRepository.update(
      { id: run.payrollPeriodId, companyId },
      { status: PayrollPeriodStatusEnum.PAID },
    );
    await this.auditService.log({
      actor,
      action: 'payroll.run.paid',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
    });
    return this.runRepository.save(run);
  }

  async close(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.PAID) {
      throw new ConflictException('Only paid payroll can be closed.');
    }
    run.status = PayrollRunStatusEnum.CLOSED;
    await this.periodRepository.update(
      { id: run.payrollPeriodId, companyId },
      { status: PayrollPeriodStatusEnum.CLOSED },
    );
    await this.auditService.log({
      actor,
      action: 'payroll.run.closed',
      entityType: 'PAYROLL_RUN',
      entityId: run.id,
    });
    return this.runRepository.save(run);
  }

  private assertApprovalStage(
    run: PayrollRun,
    stage: PayrollApprovalStageEnum,
  ) {
    const expected =
      run.status === PayrollRunStatusEnum.PENDING_HR_APPROVAL
        ? PayrollApprovalStageEnum.HR
        : run.status === PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL
          ? PayrollApprovalStageEnum.FINANCE
          : run.status === PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL
            ? PayrollApprovalStageEnum.MANAGEMENT
            : null;
    if (expected !== stage) {
      throw new ConflictException(
        'Payroll run is not waiting for this approval stage.',
      );
    }
  }

  private nextApprovalStatus(stage: PayrollApprovalStageEnum) {
    if (stage === PayrollApprovalStageEnum.HR) {
      if (
        this.configService.get<boolean>(
          'PAYROLL_REQUIRE_FINANCE_APPROVAL',
          true,
        )
      ) {
        return PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL;
      }
      return this.configService.get<boolean>(
        'PAYROLL_REQUIRE_MANAGEMENT_APPROVAL',
        true,
      )
        ? PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL
        : PayrollRunStatusEnum.APPROVED;
    }
    if (stage === PayrollApprovalStageEnum.FINANCE) {
      return this.configService.get<boolean>(
        'PAYROLL_REQUIRE_MANAGEMENT_APPROVAL',
        true,
      )
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
    @InjectRepository(EmployeePayrollProfile)
    private readonly profileRepository: Repository<EmployeePayrollProfile>,
    @InjectRepository(EmployeeBankAccount)
    private readonly bankRepository: Repository<EmployeeBankAccount>,
    @InjectRepository(EmployeeCompensationVersion)
    private readonly compensationRepository: Repository<EmployeeCompensationVersion>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
  ) {}

  async generateForRun(actor: AuthenticatedUser, payrollRunId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({
      where: { id: payrollRunId, companyId },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (
      ![
        PayrollRunStatusEnum.LOCKED,
        PayrollRunStatusEnum.PAYMENT_FILE_GENERATED,
        PayrollRunStatusEnum.PAID,
      ].includes(run.status)
    ) {
      throw new ConflictException(
        'Payslips can be generated only from locked, bank-file generated, or paid payroll.',
      );
    }
    const results = await this.resultRepository.find({
      where: { payrollRunId, companyId },
    });
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
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
    return this.payslipRepository.find({
      where: { companyId, employeeId: actor.employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async getMine(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
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

  async summaryMine(actor: AuthenticatedUser, year?: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId)
      throw new ForbiddenException('Employee profile is required.');
    const targetYear = year ?? new Date().getUTCFullYear();
    const periods = await this.periodRepository.find({
      where: { companyId, periodYear: targetYear },
      select: { id: true },
    });
    const periodIds = periods.map((period) => period.id);
    const [payslips, profile, compensations, results] = await Promise.all([
      this.listMine(actor),
      this.profileRepository.findOne({
        where: { companyId, employeeId: actor.employeeId },
      }),
      this.compensationRepository.find({
        where: { companyId, employeeId: actor.employeeId },
        order: { effectiveFrom: 'DESC' },
      }),
      periodIds.length
        ? this.resultRepository.find({
            where: {
              companyId,
              employeeId: actor.employeeId,
              payrollPeriodId: In(periodIds),
            },
            order: { payrollPeriodId: 'ASC' },
          })
        : Promise.resolve([]),
    ]);
    const resultIds = results.map((result) => result.id);
    const lines = resultIds.length
      ? await this.lineRepository.find({
          where: { companyId, employeePayrollResultId: In(resultIds) },
          order: { payrollRunId: 'ASC', calculationOrder: 'ASC' },
        })
      : [];
    const bank = profile?.primaryBankAccountId
      ? await this.bankRepository.findOne({
          where: { id: profile.primaryBankAccountId },
        })
      : null;
    const ytd = results.reduce(
      (summary, result) => ({
        gross_pay: PayrollMoney.add(summary.gross_pay, result.grossPay),
        taxable_pay: PayrollMoney.add(summary.taxable_pay, result.taxablePay),
        deductions: PayrollMoney.add(
          summary.deductions,
          result.employeeDeductions,
        ),
        employer_contributions: PayrollMoney.add(
          summary.employer_contributions,
          result.employerContributions,
        ),
        net_pay: PayrollMoney.add(summary.net_pay, result.netPay),
      }),
      {
        gross_pay: '0.00',
        taxable_pay: '0.00',
        deductions: '0.00',
        employer_contributions: '0.00',
        net_pay: '0.00',
      },
    );
    const componentTotals = lines.reduce<Record<string, string>>(
      (acc, line) => {
        const amount =
          PayrollMoney.toCents(line.employerAmount) > 0n
            ? line.employerAmount
            : line.amount;
        acc[line.componentCode] = PayrollMoney.add(
          acc[line.componentCode] ?? '0.00',
          amount,
        );
        return acc;
      },
      {},
    );
    return {
      year: targetYear,
      payslips,
      salary_history: compensations.map((item) => ({
        id: item.id,
        base_salary: item.baseSalary,
        currency: item.currency,
        salary_structure_code: item.salaryStructureCode,
        pay_frequency: item.payFrequency,
        effective_from: item.effectiveFrom,
        effective_to: item.effectiveTo,
        status: item.status,
        revision_reference: item.revisionReference,
      })),
      ytd,
      tax_summary: this.pickComponentTotals(componentTotals, ['PAYE', 'TAX']),
      pension_summary: this.pickComponentTotals(componentTotals, [
        'PENSION',
        'NSSF',
        'PSSSF',
      ]),
      earnings: lines.filter((line) =>
        [
          PayrollComponentTypeEnum.EARNING,
          PayrollComponentTypeEnum.REIMBURSEMENT,
          PayrollComponentTypeEnum.TAXABLE_BENEFIT,
        ].includes(String(line.componentType) as PayrollComponentTypeEnum),
      ),
      deductions: lines.filter(
        (line) =>
          String(line.componentType) === PayrollComponentTypeEnum.DEDUCTION,
      ),
      bank_details: bank ? this.maskBank(bank) : null,
      payroll_documents: payslips.map((payslip) => ({
        id: payslip.id,
        payslip_no: payslip.payslipNo,
        status: payslip.status,
        created_at: payslip.createdAt,
      })),
    };
  }

  private pickComponentTotals(
    totals: Record<string, string>,
    markers: string[],
  ) {
    return Object.entries(totals)
      .filter(([code]) =>
        markers.some((marker) => code.toUpperCase().includes(marker)),
      )
      .map(([component_code, amount]) => ({ component_code, amount }));
  }

  private maskBank(bank: EmployeeBankAccount) {
    return {
      id: bank.id,
      bank_name: bank.bank_name,
      bank_code: bank.bank_code,
      bank_branch_code: bank.bank_branch_code,
      account_name: bank.account_name,
      account_number_masked: bank.account_number
        ? `${'*'.repeat(Math.max(bank.account_number.length - 4, 0))}${bank.account_number.slice(-4)}`
        : null,
      verification_status: bank.verification_status,
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
    @InjectRepository(PayrollPaymentReconciliation)
    private readonly reconciliationRepository: Repository<PayrollPaymentReconciliation>,
  ) {}

  async generate(actor: AuthenticatedUser, payrollRunId: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const existing = await this.batchRepository.findOne({
      where: { companyId, payrollRunId },
    });
    if (existing) return existing;
    const run = await this.runRepository.findOne({
      where: { id: payrollRunId, companyId },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.LOCKED) {
      throw new ConflictException(
        'Bank files can be generated only from locked payroll.',
      );
    }
    const results = await this.resultRepository.find({
      where: {
        companyId,
        payrollRunId,
        status: EmployeePayrollResultStatusEnum.LOCKED,
      },
      order: { employeeId: 'ASC' },
    });
    const invalid = results.filter(
      (result) =>
        !result.bankAccountSnapshot ||
        result.bankAccountSnapshot.verification_status !== 'VERIFIED',
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        'All bank-transfer employees need verified bank accounts.',
      );
    }
    const rows = [
      'employee_id,account_name,bank_code,branch_code,account_number_masked,amount',
      ...results.map((result) => {
        const bank = result.bankAccountSnapshot!;
        return [
          result.employeeId,
          bank.account_name,
          bank.bank_code,
          bank.bank_branch_code,
          bank.account_number_masked,
          result.netPay,
        ]
          .map((value) =>
            typeof value === 'string'
              ? value
              : typeof value === 'number' || typeof value === 'bigint'
                ? String(value)
                : '',
          )
          .join(',');
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
      summary: {
        record_count: batch.recordCount,
        total_amount: batch.totalAmount,
      },
    });
    if (run.status === PayrollRunStatusEnum.LOCKED) {
      run.status = PayrollRunStatusEnum.PAYMENT_FILE_GENERATED;
      await this.runRepository.save(run);
    }
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
      summary: {
        record_count: batch.recordCount,
        total_amount: batch.totalAmount,
      },
    });
    return {
      file_name: `${batch.batchNo}.csv`,
      mime_type: 'text/csv',
      content: batch.fileContent,
      file_hash: batch.fileHash,
    };
  }

  async reconcile(
    actor: AuthenticatedUser,
    payrollRunId: number,
    dto: ReconcilePayrollPaymentDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const run = await this.runRepository.findOne({
      where: { id: payrollRunId, companyId },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    const expectedAmount = run.netPayTotal;
    const varianceAmount = PayrollMoney.add(
      dto.paid_amount,
      PayrollMoney.fromCents(-PayrollMoney.toCents(expectedAmount)),
    );
    const status =
      PayrollMoney.toCents(varianceAmount) === 0n ? 'MATCHED' : 'VARIANCE';
    const reconciliation = await this.reconciliationRepository.save(
      this.reconciliationRepository.create({
        companyId,
        payrollRunId: run.id,
        bankBatchId: dto.bank_batch_id ?? null,
        paymentReference: dto.payment_reference.trim(),
        paymentDate: dto.payment_date,
        expectedAmount,
        paidAmount: dto.paid_amount,
        varianceAmount,
        status,
        snapshot: dto.snapshot ?? null,
        reconciledByCompanyUserId: actor.companyMembershipId ?? actor.id,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'payroll.payment.reconciled',
      entityType: 'PAYROLL_PAYMENT_RECONCILIATION',
      entityId: reconciliation.id,
      summary: {
        payroll_run_id: run.id,
        status,
        paid_amount: dto.paid_amount,
        variance_amount: varianceAmount,
      },
    });
    return reconciliation;
  }
}

@Injectable()
export class PayrollAccountingService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PayrollRun)
    private readonly runRepository: Repository<PayrollRun>,
    @InjectRepository(EmployeePayrollResult)
    private readonly resultRepository: Repository<EmployeePayrollResult>,
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
    const run = await this.runRepository.findOne({
      where: { id: payrollRunId, companyId },
    });
    if (!run) throw new NotFoundException('Payroll run not found.');
    if (run.status !== PayrollRunStatusEnum.LOCKED) {
      throw new ConflictException(
        'Journals can be generated only from locked payroll.',
      );
    }
    const lines = await this.lineRepository.find({
      where: { companyId, payrollRunId },
    });
    const results = await this.resultRepository.find({
      where: { companyId, payrollRunId },
    });
    const resultMap = new Map(
      results.map((result) => [result.employeeId, result]),
    );
    const mappings = await this.mappingRepository.find({
      where: { companyId },
    });
    const mappingMap = new Map(
      mappings.map((item) => [item.componentCode, item]),
    );
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
      const result = resultMap.get(line.employeeId);
      const context = this.accountingContext(run, line, result);
      const debitAccount = this.resolveMappedAccount(mapping, 'debit', context);
      const creditAccount = this.resolveMappedAccount(
        mapping,
        'credit',
        context,
      );
      entries.push({
        employee_id: line.employeeId,
        component_code: line.componentCode,
        debit_account: debitAccount,
        credit_account: creditAccount,
        amount,
        dimensions: context,
      });
      debit = PayrollMoney.add(debit, amount);
      credit = PayrollMoney.add(credit, amount);
    }
    if (PayrollMoney.toCents(debit) !== PayrollMoney.toCents(credit)) {
      throw new ConflictException(
        'Payroll journal debit and credit totals do not balance.',
      );
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

  private accountingContext(
    run: PayrollRun,
    line: EmployeePayrollLineItem,
    result?: EmployeePayrollResult,
  ) {
    const employeeSnapshot = result?.employeeSnapshot ?? {};
    const calculationSnapshot = line.calculationSnapshot ?? {};
    return {
      payroll_group_id: run.payrollGroupId,
      branch_id: employeeSnapshot.branch_id ?? null,
      department_id: employeeSnapshot.department_id ?? null,
      cost_center_id: employeeSnapshot.cost_center_id ?? null,
      employee_category:
        employeeSnapshot.employee_category ??
        employeeSnapshot.employment_type ??
        null,
      project_id:
        calculationSnapshot.project_id ?? calculationSnapshot.projectId ?? null,
      source_type: line.sourceType,
    };
  }

  private resolveMappedAccount(
    mapping: PayrollAccountingMapping,
    side: 'debit' | 'credit',
    context: Record<string, unknown>,
  ) {
    const dimensions = mapping.dimensions ?? {};
    const base =
      side === 'debit' ? mapping.debitAccountCode : mapping.creditAccountCode;
    const mapKeys = [
      `${side}_accounts_by_project`,
      `${side}_accounts_by_cost_center`,
      `${side}_accounts_by_employee_category`,
      `${side}_accounts_by_branch`,
      `${side}_accounts_by_department`,
      `${side}_accounts_by_payroll_group`,
    ];
    const contextKeys = [
      'project_id',
      'cost_center_id',
      'employee_category',
      'branch_id',
      'department_id',
      'payroll_group_id',
    ];
    for (let index = 0; index < mapKeys.length; index += 1) {
      const value = dimensions[mapKeys[index]];
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const rawLookupKey = context[contextKeys[index]];
      const lookupKey =
        typeof rawLookupKey === 'string' || typeof rawLookupKey === 'number'
          ? String(rawLookupKey)
          : '';
      const account = (value as Record<string, unknown>)[lookupKey];
      if (typeof account === 'string' && account.trim()) {
        return account.trim();
      }
    }
    return base;
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
    @InjectRepository(EmployeePayrollLineItem)
    private readonly lineRepository: Repository<EmployeePayrollLineItem>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollDeductionShortfall)
    private readonly shortfallRepository: Repository<PayrollDeductionShortfall>,
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
      latest_locked_cost:
        latestRun?.status === PayrollRunStatusEnum.LOCKED
          ? latestRun.totalEmployerCost
          : null,
      latest_locked_net_pay:
        latestRun?.status === PayrollRunStatusEnum.LOCKED
          ? latestRun.netPayTotal
          : null,
      payroll_ready: Boolean(latestRun),
    };
  }

  async variance(
    actor: AuthenticatedUser,
    payrollRunId: number,
    comparisonRunId?: number,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const current = await this.resultRepository.find({
      where: { companyId, payrollRunId },
    });
    const comparison = comparisonRunId
      ? await this.resultRepository.find({
          where: { companyId, payrollRunId: comparisonRunId },
        })
      : [];
    const comparisonMap = new Map(
      comparison.map((item) => [item.employeeId, item]),
    );
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

  catalog() {
    return [
      'payroll-register',
      'payroll-summary',
      'employee-payroll-history',
      'department-payroll',
      'branch-payroll',
      'cost-centre-payroll',
      'gross-to-net',
      'allowances',
      'deductions',
      'deduction-shortfalls',
      'overtime',
      'loan',
      'advance',
      'employer-contributions',
      'tax',
      'pension',
      'wcf',
      'bank-payment',
      'payroll-journal',
      'payroll-cost',
      'headcount-vs-payroll',
      'ytd-earnings',
      'ytd-tax',
      'ytd-contributions',
    ].map((code) => ({ code, name: code.replace(/-/g, ' ') }));
  }

  async report(
    actor: AuthenticatedUser,
    code: string,
    query: PayrollReportQueryDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const runIds = await this.resolveReportRunIds(companyId, query);
    const results = runIds.length
      ? await this.resultRepository.find({
          where: { companyId, payrollRunId: In(runIds) },
          order: { employeeId: 'ASC' },
        })
      : [];
    const lines = runIds.length
      ? await this.lineRepository.find({
          where: { companyId, payrollRunId: In(runIds) },
          order: { employeeId: 'ASC', calculationOrder: 'ASC' },
        })
      : [];
    const normalizedCode = code.trim().toLowerCase();
    if (normalizedCode === 'deduction-shortfalls') {
      return {
        code: normalizedCode,
        run_ids: runIds,
        row_count: runIds.length,
        rows: await this.buildShortfallRows(companyId, results),
      };
    }
    const rows =
      normalizedCode.includes('ytd') || query.year
        ? await this.buildYtdRows(companyId, normalizedCode, query)
        : this.buildReportRows(normalizedCode, results, lines);
    return {
      code: normalizedCode,
      run_ids: runIds,
      row_count: rows.length,
      rows,
    };
  }

  private buildReportRows(
    code: string,
    results: EmployeePayrollResult[],
    lines: EmployeePayrollLineItem[],
  ) {
    if (code === 'payroll-register' || code === 'gross-to-net') {
      return results.map((result) => ({
        employee_id: result.employeeId,
        gross_pay: result.grossPay,
        taxable_pay: result.taxablePay,
        deductions: result.employeeDeductions,
        employer_contributions: result.employerContributions,
        net_pay: result.netPay,
        employer_cost: result.employerCost,
        status: result.status,
      }));
    }
    if (code === 'payroll-summary' || code === 'payroll-cost') {
      return [
        results.reduce(
          (summary, result) => ({
            employees: summary.employees + 1,
            gross_pay: PayrollMoney.add(summary.gross_pay, result.grossPay),
            deductions: PayrollMoney.add(
              summary.deductions,
              result.employeeDeductions,
            ),
            employer_contributions: PayrollMoney.add(
              summary.employer_contributions,
              result.employerContributions,
            ),
            net_pay: PayrollMoney.add(summary.net_pay, result.netPay),
            employer_cost: PayrollMoney.add(
              summary.employer_cost,
              result.employerCost,
            ),
          }),
          {
            employees: 0,
            gross_pay: '0.00',
            deductions: '0.00',
            employer_contributions: '0.00',
            net_pay: '0.00',
            employer_cost: '0.00',
          },
        ),
      ];
    }
    if (
      [
        'department-payroll',
        'branch-payroll',
        'cost-centre-payroll',
        'headcount-vs-payroll',
      ].includes(code)
    ) {
      const dimension =
        code === 'department-payroll'
          ? 'department_id'
          : code === 'branch-payroll'
            ? 'branch_id'
            : 'cost_center_id';
      const grouped = new Map<string, Record<string, unknown>>();
      for (const result of results) {
        const snapshot = result.employeeSnapshot ?? {};
        const rawKey = snapshot[dimension];
        const key =
          typeof rawKey === 'string' || typeof rawKey === 'number'
            ? String(rawKey)
            : 'unassigned';
        const current =
          grouped.get(key) ??
          ({
            dimension,
            dimension_value: key,
            employees: 0,
            gross_pay: '0.00',
            deductions: '0.00',
            employer_contributions: '0.00',
            net_pay: '0.00',
            employer_cost: '0.00',
          } as Record<string, unknown>);
        current.employees = Number(current.employees) + 1;
        current.gross_pay = PayrollMoney.add(
          current.gross_pay as string,
          result.grossPay,
        );
        current.deductions = PayrollMoney.add(
          current.deductions as string,
          result.employeeDeductions,
        );
        current.employer_contributions = PayrollMoney.add(
          current.employer_contributions as string,
          result.employerContributions,
        );
        current.net_pay = PayrollMoney.add(
          current.net_pay as string,
          result.netPay,
        );
        current.employer_cost = PayrollMoney.add(
          current.employer_cost as string,
          result.employerCost,
        );
        grouped.set(key, current);
      }
      return [...grouped.values()];
    }
    if (code === 'bank-payment') {
      return results.map((result) => {
        const bank = result.bankAccountSnapshot ?? {};
        return {
          employee_id: result.employeeId,
          bank_name: bank.bank_name ?? null,
          bank_code: bank.bank_code ?? null,
          branch_code: bank.bank_branch_code ?? null,
          account_name: bank.account_name ?? null,
          account_number: bank.account_number_masked ?? null,
          net_pay: result.netPay,
          status: result.status,
        };
      });
    }
    const matchers: Record<string, (line: EmployeePayrollLineItem) => boolean> =
      {
        allowances: (line) =>
          String(line.componentType) === PayrollComponentTypeEnum.EARNING,
        deductions: (line) =>
          String(line.componentType) === PayrollComponentTypeEnum.DEDUCTION,
        overtime: (line) => line.sourceType === 'ATTENDANCE_OVERTIME',
        loan: (line) => line.componentCode === 'STAFF_LOAN',
        advance: (line) => line.componentCode === 'SALARY_ADVANCE',
        'employer-contributions': (line) =>
          [
            PayrollComponentTypeEnum.EMPLOYER_CONTRIBUTION,
            PayrollComponentTypeEnum.EMPLOYER_LEVY,
          ].includes(String(line.componentType) as PayrollComponentTypeEnum),
        tax: (line) => line.componentCode.includes('PAYE'),
        pension: (line) =>
          line.componentCode.includes('PENSION') ||
          line.componentCode.includes('NSSF') ||
          line.componentCode.includes('PSSSF'),
        wcf: (line) => line.componentCode.includes('WCF'),
        'bank-payment': () => false,
        'payroll-journal': () => true,
        'headcount-vs-payroll': () => false,
      };
    const matcher = matchers[code] ?? (() => true);
    return lines.filter(matcher).map((line) => ({
      employee_id: line.employeeId,
      component_code: line.componentCode,
      component_name: line.componentName,
      component_type: line.componentType,
      amount: line.amount,
      employer_amount: line.employerAmount,
      source_type: line.sourceType,
      source_reference: line.sourceReference,
    }));
  }

  private async buildShortfallRows(
    companyId: number,
    results: EmployeePayrollResult[],
  ) {
    if (results.length === 0) return [];
    const resultMap = new Map(results.map((result) => [result.id, result]));
    const rows = await this.shortfallRepository.find({
      where: {
        companyId,
        employeePayrollResultId: In(results.map((result) => result.id)),
      },
      order: { employeePayrollResultId: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => ({
      employee_id:
        resultMap.get(row.employeePayrollResultId)?.employeeId ?? null,
      payroll_run_id:
        resultMap.get(row.employeePayrollResultId)?.payrollRunId ?? null,
      payroll_result_id: row.employeePayrollResultId,
      component_code: row.componentCode,
      requested_amount: row.requestedAmount,
      applied_amount: row.appliedAmount,
      deferred_amount: row.deferredAmount,
      status: row.status,
    }));
  }

  private async buildYtdRows(
    companyId: number,
    code: string,
    query: PayrollReportQueryDto,
  ) {
    const year = query.year ?? new Date().getUTCFullYear();
    const periods = await this.periodRepository.find({
      where: { companyId, periodYear: year },
      select: ['id'],
    });
    const periodIds = periods.map((period) => period.id);
    if (periodIds.length === 0) return [];
    const results = await this.resultRepository.find({
      where: {
        companyId,
        payrollPeriodId: In(periodIds),
        ...(query.employee_id ? { employeeId: query.employee_id } : {}),
      },
      order: { employeeId: 'ASC' },
    });
    const grouped = new Map<number, Record<string, unknown>>();
    for (const result of results) {
      const current =
        grouped.get(result.employeeId) ??
        ({
          employee_id: result.employeeId,
          gross_pay: '0.00',
          taxable_pay: '0.00',
          deductions: '0.00',
          employer_contributions: '0.00',
          net_pay: '0.00',
          employer_cost: '0.00',
        } as Record<string, unknown>);
      current.gross_pay = PayrollMoney.add(
        current.gross_pay as string,
        result.grossPay,
      );
      current.taxable_pay = PayrollMoney.add(
        current.taxable_pay as string,
        result.taxablePay,
      );
      current.deductions = PayrollMoney.add(
        current.deductions as string,
        result.employeeDeductions,
      );
      current.employer_contributions = PayrollMoney.add(
        current.employer_contributions as string,
        result.employerContributions,
      );
      current.net_pay = PayrollMoney.add(
        current.net_pay as string,
        result.netPay,
      );
      current.employer_cost = PayrollMoney.add(
        current.employer_cost as string,
        result.employerCost,
      );
      grouped.set(result.employeeId, current);
    }
    return [...grouped.values()].map((row) => ({
      ...row,
      report_code: code,
      year,
    }));
  }

  private async resolveReportRunIds(
    companyId: number,
    query: PayrollReportQueryDto,
  ) {
    if (query.payroll_run_id) return [query.payroll_run_id];
    const runs = await this.runRepository.find({
      where: {
        companyId,
        ...(query.payroll_period_id
          ? { payrollPeriodId: query.payroll_period_id }
          : {}),
      },
      order: { id: 'DESC' },
      take: query.payroll_period_id ? 20 : 1,
    });
    return runs.map((run) => run.id);
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
    @InjectRepository(EmployeeFinancePayrollInstruction)
    private readonly financeInstructionRepository: Repository<EmployeeFinancePayrollInstruction>,
    @InjectRepository(EmployeeFinanceLedgerEntry)
    private readonly financeLedgerRepository: Repository<EmployeeFinanceLedgerEntry>,
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
    return this.reconcileCompany(
      this.hrAccessService.ensureActorCompanyId(actor),
      actor,
    );
  }

  private async reconcileCompany(companyId: number, actor?: AuthenticatedUser) {
    const issues: Record<string, unknown>[] = [];
    const activeEmployees = await this.employeeRepository.find({
      where: {
        company_id: companyId,
        employment_status: EmploymentStatusEnum.ACTIVE,
      },
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
      const profileEmployeeIds = new Set(
        profiles.map((profile) => profile.employeeId),
      );
      for (const employee of activeEmployees) {
        if (!profileEmployeeIds.has(employee.id)) {
          issues.push({
            code: 'EMPLOYEE_PAYROLL_PROFILE_MISSING',
            employee_id: employee.id,
          });
        }
      }

      const compensations = await this.compensationRepository.find({
        where: {
          companyId,
          employeeId: In(employeeIds),
          status: 'ACTIVE' as never,
        },
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
      where: {
        companyId,
        status: In([
          PayrollRunStatusEnum.CALCULATED,
          PayrollRunStatusEnum.PENDING_HR_APPROVAL,
          PayrollRunStatusEnum.PENDING_FINANCE_APPROVAL,
          PayrollRunStatusEnum.PENDING_MANAGEMENT_APPROVAL,
          PayrollRunStatusEnum.APPROVED,
          PayrollRunStatusEnum.LOCKED,
        ]),
      },
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
      if (
        PayrollMoney.toCents(resultNet) !==
        PayrollMoney.toCents(run.netPayTotal)
      ) {
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
        if (
          PayrollMoney.toCents(gross) !== PayrollMoney.toCents(result.grossPay)
        ) {
          issues.push({
            code: 'EMPLOYEE_GROSS_DIFFERS_FROM_LINE_ITEMS',
            payroll_result_id: result.id,
          });
        }
        const deductions = lines
          .filter(
            (line) =>
              String(line.componentType) === PayrollComponentTypeEnum.DEDUCTION,
          )
          .reduce((sum, line) => PayrollMoney.add(sum, line.amount), '0.00');
        if (
          PayrollMoney.toCents(deductions) !==
          PayrollMoney.toCents(result.employeeDeductions)
        ) {
          issues.push({
            code: 'EMPLOYEE_DEDUCTIONS_DIFFER_FROM_LINE_ITEMS',
            payroll_result_id: result.id,
          });
        }
        const net = PayrollMoney.add(
          gross,
          PayrollMoney.fromCents(-PayrollMoney.toCents(deductions)),
        );
        if (PayrollMoney.toCents(net) !== PayrollMoney.toCents(result.netPay)) {
          issues.push({
            code: 'EMPLOYEE_NET_DIFFERS_FROM_LINE_ITEMS',
            payroll_result_id: result.id,
          });
        }
        await this.reconcileEmployeeFinanceDeductions({
          companyId,
          run,
          result,
          lines,
          issues,
        });
      }
      await this.reconcileFinanceInstructionsHavePayrollLines({
        companyId,
        run,
        issues,
      });
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

  private async reconcileEmployeeFinanceDeductions(args: {
    companyId: number;
    run: PayrollRun;
    result: EmployeePayrollResult;
    lines: EmployeePayrollLineItem[];
    issues: Record<string, unknown>[];
  }) {
    const financeLines = args.lines.filter(
      (line) => line.sourceType === 'EMPLOYEE_FINANCE',
    );
    for (const line of financeLines) {
      const instructionId = Number(line.sourceReference);
      if (!Number.isFinite(instructionId)) {
        args.issues.push({
          code: 'EMPLOYEE_FINANCE_LINE_MISSING_INSTRUCTION',
          payroll_result_id: args.result.id,
          line_item_id: line.id,
        });
        continue;
      }
      const instruction = await this.financeInstructionRepository.findOne({
        where: {
          id: instructionId,
          companyId: args.companyId,
          payrollRunId: args.run.id,
        },
      });
      if (!instruction) {
        args.issues.push({
          code: 'EMPLOYEE_FINANCE_INSTRUCTION_NOT_FOUND',
          payroll_result_id: args.result.id,
          line_item_id: line.id,
          instruction_id: instructionId,
        });
        continue;
      }
      if (
        PayrollMoney.toCents(instruction.reservedAmount) !==
        PayrollMoney.toCents(line.amount)
      ) {
        args.issues.push({
          code: 'EMPLOYEE_FINANCE_LINE_DIFFERS_FROM_RESERVED_AMOUNT',
          payroll_result_id: args.result.id,
          instruction_id: instruction.id,
          line_amount: line.amount,
          reserved_amount: instruction.reservedAmount,
        });
      }
      if (args.run.status === PayrollRunStatusEnum.LOCKED) {
        if (
          instruction.status !==
          EmployeeFinancePayrollInstructionStatusEnum.POSTED
        ) {
          args.issues.push({
            code: 'LOCKED_PAYROLL_FINANCE_INSTRUCTION_NOT_POSTED',
            payroll_run_id: args.run.id,
            instruction_id: instruction.id,
            instruction_status: instruction.status,
          });
        }
        const ledger = await this.financeLedgerRepository.findOne({
          where: {
            companyId: args.companyId,
            accountId: instruction.accountId,
            idempotencyKey: `payroll:${args.run.id}:${instruction.id}`,
          },
        });
        if (!ledger) {
          args.issues.push({
            code: 'LOCKED_PAYROLL_FINANCE_LEDGER_ENTRY_MISSING',
            payroll_run_id: args.run.id,
            instruction_id: instruction.id,
          });
        } else if (
          PayrollMoney.toCents(ledger.totalAmount) !==
          PayrollMoney.toCents(line.amount)
        ) {
          args.issues.push({
            code: 'LOCKED_PAYROLL_FINANCE_LEDGER_AMOUNT_MISMATCH',
            payroll_run_id: args.run.id,
            instruction_id: instruction.id,
            line_amount: line.amount,
            ledger_amount: ledger.totalAmount,
          });
        }
      }
    }
  }

  private async reconcileFinanceInstructionsHavePayrollLines(args: {
    companyId: number;
    run: PayrollRun;
    issues: Record<string, unknown>[];
  }) {
    const instructions = await this.financeInstructionRepository.find({
      where: { companyId: args.companyId, payrollRunId: args.run.id },
      order: { id: 'ASC' },
    });
    if (instructions.length === 0) return;
    const financeLines = await this.lineRepository.find({
      where: {
        companyId: args.companyId,
        payrollRunId: args.run.id,
        sourceType: 'EMPLOYEE_FINANCE',
      },
    });
    const lineByInstructionId = new Map(
      financeLines.map((line) => [Number(line.sourceReference), line]),
    );
    for (const instruction of instructions) {
      if (PayrollMoney.toCents(instruction.reservedAmount) <= 0n) continue;
      if (!lineByInstructionId.has(instruction.id)) {
        args.issues.push({
          code: 'EMPLOYEE_FINANCE_INSTRUCTION_MISSING_PAYROLL_LINE',
          payroll_run_id: args.run.id,
          instruction_id: instruction.id,
          reserved_amount: instruction.reservedAmount,
        });
      }
    }
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
    if (!offboarding)
      throw new NotFoundException('Offboarding request not found.');
    if (
      ![
        OffboardingRequestStatusEnum.READY_FOR_FINALIZATION,
        OffboardingRequestStatusEnum.COMPLETED,
      ].includes(offboarding.status)
    ) {
      throw new ConflictException(
        'Approved offboarding is required for final settlement.',
      );
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
