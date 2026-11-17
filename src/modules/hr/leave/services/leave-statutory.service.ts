import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../../common/utils/permission.util';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { EmployeeCompensationVersion } from '../../employee-movements/entities/employee-compensation-version.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { PayrollComponent } from '../../payroll/entities/payroll-configuration.entities';
import { PayrollPeriod } from '../../payroll/entities/payroll-configuration.entities';
import { PayrollInput } from '../../payroll/entities/payroll-run.entities';
import {
  PayrollInputStatusEnum,
  PayrollPeriodStatusEnum,
} from '../../payroll/payroll.enums';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatutoryCompanySettings } from '../entities/leave-statutory-company-settings.entity';
import {
  AnnualLeaveStatutorySettings,
  LeaveStatutoryRule,
  LeaveStatutoryRuleType,
  MaternityLeaveStatutorySettings,
  PaternityLeaveStatutorySettings,
  PublicHolidayStatutorySettings,
  SickLeaveStatutorySettings,
  TerminationSettlementStatutorySettings,
} from '../entities/leave-statutory-rule.entity';
import {
  LeaveLegalReference,
  LeaveStatutoryRuleSet,
} from '../entities/leave-statutory-rule-set.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { splitPayTiers } from '../utils/leave-policy-calculations.util';
import { dayBefore } from '../utils/leave-policy-version.util';
import { LeaveAuditService } from './leave-audit.service';

export const STATUTORY_RULE_TYPES: LeaveStatutoryRuleType[] = [
  'annual_leave',
  'sick_leave',
  'maternity_leave',
  'paternity_leave',
  'public_holiday',
  'termination_settlement',
];

export type StatutoryRuleInput = {
  rule_type: LeaveStatutoryRuleType;
  leave_type_id?: number | null;
  settings: Record<string, unknown>;
  legal_reference?: string | null;
};

export type StatutoryRuleSetInput = {
  jurisdiction_code: string;
  name: string;
  legal_authority?: string | null;
  legal_references?: LeaveLegalReference[];
  is_test_configuration?: boolean;
  change_reason?: string | null;
  rules: StatutoryRuleInput[];
};

type EmployeeLike = Pick<Employee, 'id' | 'company_id'> &
  Partial<Pick<Employee, 'primary_branch_id' | 'hire_date' | 'gender'>>;

const isPositive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isNonNegative = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isPercent = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1000;

/**
 * Jurisdiction statutory leave rules inside the single leave engine.
 * Company policies add benefits on top; this service supplies the floors and
 * protections they may not go below (minimum annual leave, protected unused
 * days, sick pay stages, family leave limits, public-holiday work pay,
 * termination payout settings). Nothing applies until a rule set has been
 * legally verified and activated.
 */
@Injectable()
export class LeaveStatutoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly leaveAuditService: LeaveAuditService,
  ) {}

  private get isProduction(): boolean {
    return [
      this.configService.get<string>('APP_ENV'),
      this.configService.get<string>('NODE_ENV'),
    ].some((value) => value?.trim().toLowerCase() === 'production');
  }

  // ------------------------------------------------------------- validation

  /** Throws with every problem found in a rule's settings. */
  validateRuleSettings(rule: StatutoryRuleInput): void {
    const s = rule.settings ?? {};
    const problems: string[] = [];
    const need = (key: string, ok: (v: unknown) => boolean, label: string) => {
      if (!ok(s[key])) problems.push(`${rule.rule_type}.${key} ${label}`);
    };
    const optional = (
      key: string,
      ok: (v: unknown) => boolean,
      label: string,
    ) => {
      if (s[key] !== undefined && s[key] !== null && !ok(s[key])) {
        problems.push(`${rule.rule_type}.${key} ${label}`);
      }
    };
    switch (rule.rule_type) {
      case 'annual_leave':
        need('minimum_days_per_cycle', isPositive, 'must be a positive number');
        optional('cycle_months', isPositive, 'must be a positive number');
        optional('eligibility_months', isNonNegative, 'must be 0 or more');
        optional('protected_unused_days', isNonNegative, 'must be 0 or more');
        break;
      case 'sick_leave': {
        need(
          'reference_period_months',
          isPositive,
          'must be a positive number',
        );
        const stages = s.stages;
        if (!Array.isArray(stages) || !stages.length) {
          problems.push('sick_leave.stages needs at least one pay stage');
        } else {
          stages.forEach((stage: Record<string, unknown>, index) => {
            if (!isPositive(stage?.days))
              problems.push(
                `sick_leave.stages[${index}].days must be positive`,
              );
            if (
              !isPercent(stage?.pay_percent) ||
              Number(stage?.pay_percent) > 100
            )
              problems.push(
                `sick_leave.stages[${index}].pay_percent must be between 0 and 100`,
              );
          });
        }
        optional(
          'certificate_required_after_days',
          isNonNegative,
          'must be 0 or more',
        );
        optional('eligibility_months', isNonNegative, 'must be 0 or more');
        break;
      }
      case 'maternity_leave':
        need('standard_days', isPositive, 'must be a positive number');
        optional(
          'multiple_birth_days',
          isPositive,
          'must be a positive number',
        );
        optional('pay_percent', isPercent, 'must be between 0 and 100');
        optional('eligibility_months', isNonNegative, 'must be 0 or more');
        optional('max_occurrences', isPositive, 'must be a positive number');
        optional('period_months', isPositive, 'must be a positive number');
        break;
      case 'paternity_leave':
        need('days', isPositive, 'must be a positive number');
        optional(
          'within_days_of_birth',
          isPositive,
          'must be a positive number',
        );
        optional('pay_percent', isPercent, 'must be between 0 and 100');
        optional('eligibility_months', isNonNegative, 'must be 0 or more');
        break;
      case 'public_holiday':
        need('premium_rate_percent', isPercent, 'must be between 0 and 1000');
        optional(
          'standard_hours_per_day',
          isPositive,
          'must be a positive number',
        );
        optional(
          'monthly_hours_divisor',
          isPositive,
          'must be a positive number',
        );
        break;
      case 'termination_settlement':
        if (typeof s.pay_unused_annual_leave !== 'boolean')
          problems.push(
            'termination_settlement.pay_unused_annual_leave must be true or false',
          );
        if (typeof s.include_carried_forward !== 'boolean')
          problems.push(
            'termination_settlement.include_carried_forward must be true or false',
          );
        need('daily_rate_divisor', isPositive, 'must be a positive number');
        break;
      default:
        problems.push(`Unknown rule type ${String(rule.rule_type)}`);
    }
    if (
      [
        'annual_leave',
        'sick_leave',
        'maternity_leave',
        'paternity_leave',
      ].includes(rule.rule_type) &&
      !rule.leave_type_id
    ) {
      problems.push(`${rule.rule_type} must be linked to a company leave type`);
    }
    if (problems.length) throw new BadRequestException(problems.join('; '));
  }

  private normalizeJurisdiction(code: string): string {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z]{2}(-[A-Z0-9]{2,24})?$/.test(normalized)) {
      throw new BadRequestException(
        'jurisdiction_code must look like TZ-MAINLAND or TZ-ZANZIBAR',
      );
    }
    return normalized;
  }

  // ---------------------------------------------------------------- reading

  async listRuleSets(companyId: number, jurisdiction?: string) {
    return this.dataSource.getRepository(LeaveStatutoryRuleSet).find({
      where: {
        company_id: companyId,
        ...(jurisdiction
          ? { jurisdiction_code: this.normalizeJurisdiction(jurisdiction) }
          : {}),
      },
      relations: { rules: true },
      order: { jurisdiction_code: 'ASC', version_no: 'DESC' },
    });
  }

  async getRuleSet(
    companyId: number,
    id: number,
    manager?: EntityManager,
  ): Promise<LeaveStatutoryRuleSet> {
    const set = await (manager ?? this.dataSource.manager)
      .getRepository(LeaveStatutoryRuleSet)
      .findOne({
        where: { id, company_id: companyId },
        relations: { rules: true },
      });
    if (!set) throw new NotFoundException('Statutory rule set not found');
    return set;
  }

  // ---------------------------------------------------------------- writing

  async createRuleSet(
    companyId: number,
    dto: StatutoryRuleSetInput,
    actor: AuthenticatedUser,
    supersedes?: LeaveStatutoryRuleSet,
  ) {
    const jurisdiction = this.normalizeJurisdiction(dto.jurisdiction_code);
    this.validateRules(dto.rules);
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveStatutoryRuleSet);
      const open = await repository.findOne({
        where: {
          company_id: companyId,
          jurisdiction_code: jurisdiction,
          status: In(['draft', 'pending_approval']),
        },
      });
      if (open) {
        throw new ConflictException(
          `Version ${open.version_no} for ${jurisdiction} is still ${open.status}. Finish or discard it first.`,
        );
      }
      const { max } = (await repository
        .createQueryBuilder('set')
        .select('MAX(set.version_no)', 'max')
        .where('set.company_id = :companyId', { companyId })
        .andWhere('set.jurisdiction_code = :jurisdiction', { jurisdiction })
        .getRawOne<{ max: string | number | null }>()) ?? { max: null };
      const set = await repository.save(
        repository.create({
          company_id: companyId,
          jurisdiction_code: jurisdiction,
          name: dto.name.trim(),
          version_no: Number(max ?? 0) + 1,
          status: 'draft',
          legal_authority: dto.legal_authority?.trim() || null,
          legal_references: dto.legal_references ?? [],
          is_test_configuration: dto.is_test_configuration ?? false,
          change_reason: dto.change_reason?.trim() || null,
          supersedes_rule_set_id: supersedes?.id ?? null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
          verification_status: 'unverified',
        }),
      );
      await this.replaceRules(manager, set.id, dto.rules);
      return this.getRuleSet(companyId, set.id, manager);
    });
    await this.audit(
      companyId,
      'leave_statutory.rule_set_created',
      saved,
      actor,
    );
    return saved;
  }

  async updateRuleSet(
    companyId: number,
    id: number,
    dto: Partial<StatutoryRuleSetInput>,
    actor: AuthenticatedUser,
  ) {
    if (dto.rules) this.validateRules(dto.rules);
    const saved = await this.dataSource.transaction(async (manager) => {
      const set = await this.getRuleSet(companyId, id, manager);
      if (!['draft', 'pending_approval'].includes(set.status)) {
        throw new BadRequestException(
          'Approved statutory rule sets cannot be edited; create a new version.',
        );
      }
      if (dto.name !== undefined) set.name = dto.name.trim();
      if (dto.legal_authority !== undefined)
        set.legal_authority = dto.legal_authority?.trim() || null;
      if (dto.legal_references !== undefined)
        set.legal_references = dto.legal_references;
      if (dto.is_test_configuration !== undefined)
        set.is_test_configuration = dto.is_test_configuration;
      if (dto.change_reason !== undefined)
        set.change_reason = dto.change_reason?.trim() || null;
      // Any edit invalidates an earlier verification and sends it back.
      set.status = 'draft';
      set.verification_status = 'unverified';
      set.verified_at = null;
      set.verified_by_company_user_id = null;
      await manager.getRepository(LeaveStatutoryRuleSet).save(set);
      if (dto.rules) await this.replaceRules(manager, set.id, dto.rules);
      return this.getRuleSet(companyId, set.id, manager);
    });
    await this.audit(
      companyId,
      'leave_statutory.rule_set_updated',
      saved,
      actor,
    );
    return saved;
  }

  /** New draft version copied from an approved set. */
  async reviseRuleSet(companyId: number, id: number, actor: AuthenticatedUser) {
    const source = await this.getRuleSet(companyId, id);
    if (!['active', 'superseded'].includes(source.status)) {
      throw new BadRequestException(
        'Only an approved rule set can be revised.',
      );
    }
    return this.createRuleSet(
      companyId,
      {
        jurisdiction_code: source.jurisdiction_code,
        name: source.name,
        legal_authority: source.legal_authority,
        legal_references: source.legal_references,
        is_test_configuration: source.is_test_configuration,
        rules: source.rules.map((rule) => ({
          rule_type: rule.rule_type,
          leave_type_id: rule.leave_type_id,
          settings: rule.settings,
          legal_reference: rule.legal_reference,
        })),
      },
      actor,
      source,
    );
  }

  async submitRuleSet(companyId: number, id: number, actor: AuthenticatedUser) {
    const repository = this.dataSource.getRepository(LeaveStatutoryRuleSet);
    const set = await this.getRuleSet(companyId, id);
    if (set.status !== 'draft') {
      throw new BadRequestException('Only a draft rule set can be submitted.');
    }
    set.status = 'pending_approval';
    await repository.save(set);
    await this.audit(
      companyId,
      'leave_statutory.rule_set_submitted',
      set,
      actor,
    );
    return set;
  }

  /**
   * Records the legal verification (who checked which sources, and notes).
   * Required before activation unless the set is a test configuration.
   */
  async verifyRuleSet(
    companyId: number,
    id: number,
    dto: {
      verified: boolean;
      notes: string;
      legal_references?: LeaveLegalReference[];
    },
    actor: AuthenticatedUser,
  ) {
    this.assertCanApprove(actor);
    const repository = this.dataSource.getRepository(LeaveStatutoryRuleSet);
    const set = await this.getRuleSet(companyId, id);
    if (!['draft', 'pending_approval'].includes(set.status)) {
      throw new BadRequestException(
        'Only a draft or submitted rule set can be verified.',
      );
    }
    const references = dto.legal_references ?? set.legal_references;
    if (dto.verified && !references.length) {
      throw new BadRequestException(
        'Add at least one legal reference (title and citation) before marking the rule set verified.',
      );
    }
    if (!dto.notes || dto.notes.trim().length < 10) {
      throw new BadRequestException(
        'Verification notes (at least 10 characters) are required.',
      );
    }
    set.legal_references = references;
    set.verification_status = dto.verified ? 'verified' : 'rejected';
    set.verification_notes = dto.notes.trim();
    set.verified_by_company_user_id = actor.companyMembershipId ?? null;
    set.verified_at = new Date();
    await repository.save(set);
    await this.audit(
      companyId,
      'leave_statutory.rule_set_verified',
      set,
      actor,
      {
        verified: dto.verified,
        notes: set.verification_notes,
        references,
      },
    );
    return set;
  }

  /**
   * Activates a verified set from effective_from; the previous active set
   * for the jurisdiction ends the day before. Test configurations can be
   * activated without verification only outside production.
   */
  async activateRuleSet(
    companyId: number,
    id: number,
    dto: { effective_from: string; change_reason?: string },
    actor: AuthenticatedUser,
  ) {
    this.assertCanApprove(actor);
    const from = dto.effective_from?.slice(0, 10);
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException('effective_from (YYYY-MM-DD) is required.');
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveStatutoryRuleSet);
      const set = await repository.findOne({
        where: { id, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!set) throw new NotFoundException('Statutory rule set not found');
      if (!['draft', 'pending_approval'].includes(set.status)) {
        throw new BadRequestException(
          'Only a draft or submitted rule set can be activated.',
        );
      }
      if (set.is_test_configuration) {
        if (this.isProduction) {
          throw new ForbiddenException(
            'Test statutory configurations cannot be activated in production.',
          );
        }
      } else if (set.verification_status !== 'verified') {
        throw new BadRequestException(
          'Record a legal verification (sources and notes) before activating this rule set.',
        );
      }
      const previous = await repository.find({
        where: {
          company_id: companyId,
          jurisdiction_code: set.jurisdiction_code,
          status: In(['active', 'superseded']),
        },
        lock: { mode: 'pessimistic_write' },
      });
      for (const other of previous) {
        const otherFrom = other.effective_from
          ? String(other.effective_from).slice(0, 10)
          : null;
        const otherTo = other.effective_to
          ? String(other.effective_to).slice(0, 10)
          : null;
        if (otherTo && otherTo < from) continue;
        if (otherFrom && otherFrom >= from) {
          other.status = 'archived';
        } else {
          other.effective_to = dayBefore(from);
          other.status = 'superseded';
        }
        await repository.save(other);
      }
      set.status = 'active';
      set.effective_from = from;
      set.effective_to = null;
      set.approved_by_company_user_id = actor.companyMembershipId ?? null;
      set.approved_at = new Date();
      if (dto.change_reason) set.change_reason = dto.change_reason.trim();
      await repository.save(set);
      return this.getRuleSet(companyId, set.id, manager);
    });
    await this.audit(
      companyId,
      'leave_statutory.rule_set_activated',
      saved,
      actor,
      {
        effective_from: from,
        is_test_configuration: saved.is_test_configuration,
      },
    );
    return saved;
  }

  async discardRuleSet(
    companyId: number,
    id: number,
    actor: AuthenticatedUser,
  ) {
    const repository = this.dataSource.getRepository(LeaveStatutoryRuleSet);
    const set = await this.getRuleSet(companyId, id);
    if (!['draft', 'pending_approval'].includes(set.status)) {
      throw new BadRequestException(
        'Approved statutory rule sets are history and cannot be discarded.',
      );
    }
    set.status = 'archived';
    await repository.save(set);
    await this.audit(
      companyId,
      'leave_statutory.rule_set_discarded',
      set,
      actor,
    );
    return set;
  }

  private validateRules(rules: StatutoryRuleInput[]) {
    const seen = new Set<string>();
    for (const rule of rules) {
      if (seen.has(rule.rule_type)) {
        throw new BadRequestException(`Rule ${rule.rule_type} appears twice.`);
      }
      seen.add(rule.rule_type);
      this.validateRuleSettings(rule);
    }
  }

  private async replaceRules(
    manager: EntityManager,
    ruleSetId: number,
    rules: StatutoryRuleInput[],
  ) {
    const repository = manager.getRepository(LeaveStatutoryRule);
    await repository.delete({ rule_set_id: ruleSetId });
    await repository.save(
      rules.map((rule) =>
        repository.create({
          rule_set_id: ruleSetId,
          rule_type: rule.rule_type,
          leave_type_id: rule.leave_type_id ?? null,
          settings: rule.settings,
          legal_reference: rule.legal_reference?.trim() || null,
        }),
      ),
    );
  }

  private assertCanApprove(actor: AuthenticatedUser) {
    if (!hasPermission(actor.permissions, 'leave_statutory:approve')) {
      throw new ForbiddenException(
        'Verifying or activating statutory rules needs leave_statutory:approve.',
      );
    }
  }

  private async audit(
    companyId: number,
    action: string,
    set: LeaveStatutoryRuleSet,
    actor: AuthenticatedUser,
    extra: Record<string, unknown> = {},
  ) {
    await this.leaveAuditService.log({
      company_id: companyId,
      action,
      entity_name: 'leave_statutory_rule_set',
      entity_id: set.id,
      actor,
      payload: {
        jurisdiction_code: set.jurisdiction_code,
        version_no: set.version_no,
        status: set.status,
        verification_status: set.verification_status,
        ...extra,
      },
    });
  }

  // ----------------------------------------------------- jurisdiction setup

  async getCompanySettings(companyId: number) {
    const settings = await this.dataSource
      .getRepository(LeaveStatutoryCompanySettings)
      .findOne({ where: { company_id: companyId } });
    const branches = await this.dataSource.getRepository(Branch).find({
      where: { company_id: companyId },
      select: ['id', 'name', 'statutory_jurisdiction_code'],
      order: { name: 'ASC' },
    });
    return {
      default_jurisdiction_code: settings?.default_jurisdiction_code ?? null,
      branches,
    };
  }

  async updateCompanySettings(
    companyId: number,
    dto: {
      default_jurisdiction_code?: string | null;
      branches?: Array<{ branch_id: number; jurisdiction_code: string | null }>;
    },
    actor: AuthenticatedUser,
  ) {
    await this.dataSource.transaction(async (manager) => {
      if (dto.default_jurisdiction_code !== undefined) {
        await manager.getRepository(LeaveStatutoryCompanySettings).save({
          company_id: companyId,
          default_jurisdiction_code: dto.default_jurisdiction_code
            ? this.normalizeJurisdiction(dto.default_jurisdiction_code)
            : null,
          updated_by_company_user_id: actor.companyMembershipId ?? null,
        });
      }
      for (const entry of dto.branches ?? []) {
        const result = await manager.getRepository(Branch).update(
          { id: entry.branch_id, company_id: companyId },
          {
            statutory_jurisdiction_code: entry.jurisdiction_code
              ? this.normalizeJurisdiction(entry.jurisdiction_code)
              : null,
          },
        );
        if (!result.affected) {
          throw new NotFoundException(`Branch ${entry.branch_id} not found`);
        }
      }
    });
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_statutory.jurisdictions_updated',
      entity_name: 'leave_statutory_company_settings',
      entity_id: companyId,
      actor,
      payload: dto as Record<string, unknown>,
    });
    return this.getCompanySettings(companyId);
  }

  // -------------------------------------------------------------- resolution

  /** The employee's jurisdiction: their branch's, else the company default. */
  async jurisdictionFor(
    companyId: number,
    employee: EmployeeLike,
    manager?: EntityManager,
  ): Promise<string | null> {
    const em = manager ?? this.dataSource.manager;
    if (employee.primary_branch_id) {
      const branch = await em.getRepository(Branch).findOne({
        where: { id: employee.primary_branch_id, company_id: companyId },
        select: ['id', 'statutory_jurisdiction_code'],
      });
      if (branch?.statutory_jurisdiction_code) {
        return branch.statutory_jurisdiction_code;
      }
    }
    const settings = await em
      .getRepository(LeaveStatutoryCompanySettings)
      .findOne({ where: { company_id: companyId } });
    return settings?.default_jurisdiction_code ?? null;
  }

  /** The activated rule set covering `asOf` for the employee, if any. */
  async ruleSetFor(
    companyId: number,
    employee: EmployeeLike,
    asOf: string,
    manager?: EntityManager,
  ): Promise<LeaveStatutoryRuleSet | null> {
    const jurisdiction = await this.jurisdictionFor(
      companyId,
      employee,
      manager,
    );
    if (!jurisdiction) return null;
    const sets = await (manager ?? this.dataSource.manager)
      .getRepository(LeaveStatutoryRuleSet)
      .find({
        where: {
          company_id: companyId,
          jurisdiction_code: jurisdiction,
          status: In(['active', 'superseded']),
          effective_from: LessThanOrEqual(asOf),
        },
        relations: { rules: true },
        order: { effective_from: 'DESC' },
      });
    const set = sets.find(
      (item) =>
        !item.effective_to || String(item.effective_to).slice(0, 10) >= asOf,
    );
    if (!set) return null;
    if (set.is_test_configuration && this.isProduction) return null;
    return set;
  }

  async ruleFor<T>(
    companyId: number,
    employee: EmployeeLike,
    ruleType: LeaveStatutoryRuleType,
    asOf: string,
    manager?: EntityManager,
  ): Promise<{
    set: LeaveStatutoryRuleSet;
    rule: LeaveStatutoryRule;
    settings: T;
  } | null> {
    const set = await this.ruleSetFor(companyId, employee, asOf, manager);
    const rule = set?.rules.find((item) => item.rule_type === ruleType);
    return set && rule
      ? { set, rule, settings: rule.settings as unknown as T }
      : null;
  }

  private serviceMonths(employee: EmployeeLike, asOf: string): number {
    if (!employee.hire_date) return Number.POSITIVE_INFINITY;
    const hire = new Date(String(employee.hire_date).slice(0, 10));
    const at = new Date(asOf);
    return (
      (at.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
      (at.getUTCMonth() - hire.getUTCMonth()) -
      (at.getUTCDate() < hire.getUTCDate() ? 1 : 0)
    );
  }

  /** Statutory minimum annual leave for this employee and leave type. */
  async annualMinimum(
    companyId: number,
    employee: EmployeeLike,
    leaveTypeId: number,
    asOf: string,
    manager?: EntityManager,
  ): Promise<{ days: number; ruleSetId: number } | null> {
    const found = await this.ruleFor<AnnualLeaveStatutorySettings>(
      companyId,
      employee,
      'annual_leave',
      asOf,
      manager,
    );
    if (!found || found.rule.leave_type_id !== leaveTypeId) return null;
    if (
      found.settings.eligibility_months &&
      this.serviceMonths(employee, asOf) < found.settings.eligibility_months
    ) {
      return null;
    }
    return {
      days: found.settings.minimum_days_per_cycle,
      ruleSetId: found.set.id,
    };
  }

  /** Unused days that may never lapse for this employee and leave type. */
  async protectedUnusedDays(
    companyId: number,
    employee: EmployeeLike,
    leaveTypeId: number,
    asOf: string,
    manager?: EntityManager,
  ): Promise<{ days: number; ruleSetId: number } | null> {
    const found = await this.ruleFor<AnnualLeaveStatutorySettings>(
      companyId,
      employee,
      'annual_leave',
      asOf,
      manager,
    );
    if (!found || found.rule.leave_type_id !== leaveTypeId) return null;
    return {
      days: found.settings.protected_unused_days ?? 0,
      ruleSetId: found.set.id,
    };
  }

  /** Impact-preview warning when a proposed quota is below the statutory minimum. */
  async entitlementWarning(
    companyId: number,
    employee: Employee,
    leaveTypeId: number,
    proposedQuota: number,
    asOf: string,
  ): Promise<string | null> {
    const minimum = await this.annualMinimum(
      companyId,
      employee,
      leaveTypeId,
      asOf,
    );
    if (!minimum || proposedQuota >= minimum.days) return null;
    return `Proposed entitlement ${proposedQuota} is below the statutory minimum of ${minimum.days} day(s); the statutory minimum will apply.`;
  }

  /**
   * Sick-leave pay stages for a request: earlier approved sick days in the
   * reference period count first, then this request's days fall into the
   * remaining full/partial pay stages (unpaid beyond the last stage).
   */
  async sickPayBreakdown(
    companyId: number,
    employee: EmployeeLike,
    leaveTypeId: number,
    request: Pick<LeaveRequest, 'id' | 'start_date' | 'total_days'>,
    manager?: EntityManager,
  ): Promise<LeaveRequest['pay_breakdown']> {
    const startDate = String(request.start_date).slice(0, 10);
    const found = await this.ruleFor<SickLeaveStatutorySettings>(
      companyId,
      employee,
      'sick_leave',
      startDate,
      manager,
    );
    if (!found || found.rule.leave_type_id !== leaveTypeId) return null;
    const windowStart = new Date(startDate);
    windowStart.setUTCMonth(
      windowStart.getUTCMonth() - found.settings.reference_period_months,
    );
    const earlier = await (manager ?? this.dataSource.manager)
      .getRepository(LeaveRequest)
      .createQueryBuilder('request')
      .select('COALESCE(SUM(request.total_days), 0)', 'days')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', {
        employeeId: employee.id,
      })
      .andWhere('request.leave_type_id = :leaveTypeId', { leaveTypeId })
      .andWhere('request.status = :status', {
        status: LeaveStatusEnum.APPROVED,
      })
      .andWhere('request.id != :id', { id: request.id ?? 0 })
      .andWhere('request.start_date >= :from', {
        from: windowStart.toISOString().slice(0, 10),
      })
      .andWhere('request.start_date < :to', { to: startDate })
      .getRawOne<{ days: string }>();
    let through = 0;
    const tiers = found.settings.stages.map((stage) => {
      through += stage.days;
      return { throughDays: through, payRate: stage.pay_percent / 100 };
    });
    const bands = splitPayTiers(
      Number(earlier?.days ?? 0),
      Number(request.total_days),
      tiers,
    ).map((band) => ({
      days: band.days,
      pay_percent: Math.round(band.payRate * 10000) / 100,
    }));
    return {
      rule_set_id: found.set.id,
      rule_type: 'sick_leave',
      bands,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Maternity/paternity checks for a request. Returns blocking problems;
   * an empty list means the statutory limits are met (or no rule applies).
   */
  async familyLeaveIssues(
    companyId: number,
    employee: EmployeeLike,
    leaveTypeId: number,
    request: {
      id?: number;
      start_date: string;
      total_days: number;
      event_date?: string | null;
    },
    manager?: EntityManager,
  ): Promise<string[]> {
    const issues: string[] = [];
    const asOf = request.start_date.slice(0, 10);
    const maternity = await this.ruleFor<MaternityLeaveStatutorySettings>(
      companyId,
      employee,
      'maternity_leave',
      asOf,
      manager,
    );
    if (maternity && maternity.rule.leave_type_id === leaveTypeId) {
      const s = maternity.settings;
      const limit = Math.max(s.standard_days, s.multiple_birth_days ?? 0);
      if (request.total_days > limit) {
        issues.push(
          `Maternity leave is limited to ${limit} day(s) under ${maternity.set.name}.`,
        );
      }
      if (
        s.eligibility_months &&
        this.serviceMonths(employee, asOf) < s.eligibility_months
      ) {
        issues.push(
          `Maternity leave needs ${s.eligibility_months} month(s) of service under ${maternity.set.name}.`,
        );
      }
      if (s.max_occurrences && s.period_months) {
        const from = new Date(asOf);
        from.setUTCMonth(from.getUTCMonth() - s.period_months);
        const count = await (manager ?? this.dataSource.manager)
          .getRepository(LeaveRequest)
          .createQueryBuilder('request')
          .where('request.company_id = :companyId', { companyId })
          .andWhere('request.employee_id = :employeeId', {
            employeeId: employee.id,
          })
          .andWhere('request.leave_type_id = :leaveTypeId', { leaveTypeId })
          .andWhere('request.status = :status', {
            status: LeaveStatusEnum.APPROVED,
          })
          .andWhere('request.id != :id', { id: request.id ?? 0 })
          .andWhere('request.start_date >= :from', {
            from: from.toISOString().slice(0, 10),
          })
          .getCount();
        if (count >= s.max_occurrences) {
          issues.push(
            `Maternity leave may be taken at most ${s.max_occurrences} time(s) in ${s.period_months} months under ${maternity.set.name}.`,
          );
        }
      }
    }
    const paternity = await this.ruleFor<PaternityLeaveStatutorySettings>(
      companyId,
      employee,
      'paternity_leave',
      asOf,
      manager,
    );
    if (paternity && paternity.rule.leave_type_id === leaveTypeId) {
      const s = paternity.settings;
      if (request.total_days > s.days) {
        issues.push(
          `Paternity leave is limited to ${s.days} day(s) under ${paternity.set.name}.`,
        );
      }
      if (s.within_days_of_birth) {
        if (!request.event_date) {
          issues.push(
            'Enter the date of birth (event_date) for paternity leave.',
          );
        } else {
          const days =
            (Date.parse(`${asOf}T00:00:00Z`) -
              Date.parse(`${request.event_date.slice(0, 10)}T00:00:00Z`)) /
            86_400_000;
          if (days < 0 || days > s.within_days_of_birth) {
            issues.push(
              `Paternity leave must start within ${s.within_days_of_birth} day(s) of the birth under ${paternity.set.name}.`,
            );
          }
        }
      }
      if (
        s.eligibility_months &&
        this.serviceMonths(employee, asOf) < s.eligibility_months
      ) {
        issues.push(
          `Paternity leave needs ${s.eligibility_months} month(s) of service under ${paternity.set.name}.`,
        );
      }
    }
    return issues;
  }

  /** Statutory termination-payout settings for the employee on a date. */
  async terminationSettings(
    companyId: number,
    employee: EmployeeLike,
    asOf: string,
    manager?: EntityManager,
  ) {
    const found = await this.ruleFor<TerminationSettlementStatutorySettings>(
      companyId,
      employee,
      'termination_settlement',
      asOf,
      manager,
    );
    return found ? { ruleSetId: found.set.id, ...found.settings } : null;
  }

  // ---------------------------------------------------- public holiday pay

  /**
   * Statutory pay for work on public holidays in a period, from finalized
   * attendance: hours worked × hourly rate (monthly basic ÷ monthly hours) ×
   * premium %. With post=true, draft payroll inputs are created (once per
   * employee and date) for payroll to approve; the PUBLIC_HOLIDAY_WORK
   * component must be active and confirmed by Finance.
   */
  async publicHolidayCompensation(
    companyId: number,
    dto: {
      from_date: string;
      to_date: string;
      payroll_period_code?: string;
      post?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const from = dto.from_date.slice(0, 10);
    const to = dto.to_date.slice(0, 10);
    if (to < from) throw new BadRequestException('to_date is before from_date');
    const rows = await this.dataSource
      .getRepository(AttendanceDailySummary)
      .createQueryBuilder('summary')
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.attendanceDate BETWEEN :from AND :to', { from, to })
      .andWhere('summary.workMinutes > 0')
      .andWhere(
        "(summary.attendanceStatus = 'HOLIDAY' OR (summary.flags ->> 'is_holiday') = 'true')",
      )
      .orderBy('summary.employeeId', 'ASC')
      .addOrderBy('summary.attendanceDate', 'ASC')
      .getMany();
    const employees = new Map(
      (
        await this.dataSource.getRepository(Employee).find({
          where: {
            company_id: companyId,
            id: In([...new Set(rows.map((row) => row.employeeId))].concat(0)),
          },
        })
      ).map((employee) => [employee.id, employee]),
    );
    const lines: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const employee = employees.get(row.employeeId);
      if (!employee) continue;
      const found = await this.ruleFor<PublicHolidayStatutorySettings>(
        companyId,
        employee,
        'public_holiday',
        row.attendanceDate,
      );
      if (!found) {
        lines.push({
          employee_id: employee.id,
          date: row.attendanceDate,
          hours: Math.round((row.workMinutes / 60) * 100) / 100,
          status: 'no_rule',
          message: 'No active public-holiday statutory rule for this employee.',
        });
        continue;
      }
      const compensation = await this.dataSource
        .getRepository(EmployeeCompensationVersion)
        .createQueryBuilder('version')
        .where('version.companyId = :companyId', { companyId })
        .andWhere('version.employeeId = :employeeId', {
          employeeId: employee.id,
        })
        .andWhere("version.status IN ('ACTIVE','SUPERSEDED')")
        .andWhere('version.effectiveFrom <= :date', {
          date: row.attendanceDate,
        })
        .andWhere(
          '(version.effectiveTo IS NULL OR version.effectiveTo >= :date)',
          {
            date: row.attendanceDate,
          },
        )
        .orderBy('version.effectiveFrom', 'DESC')
        .getOne();
      const hours = Math.round((row.workMinutes / 60) * 100) / 100;
      if (!compensation) {
        lines.push({
          employee_id: employee.id,
          date: row.attendanceDate,
          hours,
          status: 'no_salary',
          message: 'No effective compensation version.',
        });
        continue;
      }
      const divisor = found.settings.monthly_hours_divisor;
      if (!divisor) {
        lines.push({
          employee_id: employee.id,
          date: row.attendanceDate,
          hours,
          status: 'no_rule',
          message: 'The public-holiday rule has no monthly_hours_divisor.',
        });
        continue;
      }
      const hourly = Number(compensation.baseSalary) / divisor;
      const amount =
        Math.round(
          hourly * hours * (found.settings.premium_rate_percent / 100) * 100,
        ) / 100;
      lines.push({
        employee_id: employee.id,
        employee_no: employee.employee_no ?? null,
        date: row.attendanceDate,
        hours,
        hourly_rate: Math.round(hourly * 10000) / 10000,
        premium_rate_percent: found.settings.premium_rate_percent,
        amount,
        currency: compensation.currency,
        rule_set_id: found.set.id,
        status: 'calculated',
      });
    }
    let posted = 0;
    if (dto.post) {
      if (!dto.payroll_period_code) {
        throw new BadRequestException(
          'payroll_period_code is required to post.',
        );
      }
      posted = await this.postPublicHolidayInputs(
        companyId,
        dto.payroll_period_code,
        lines,
        actor,
      );
    }
    return {
      from_date: from,
      to_date: to,
      total_amount:
        Math.round(
          lines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0) * 100,
        ) / 100,
      posted_inputs: posted,
      data: lines,
    };
  }

  private async postPublicHolidayInputs(
    companyId: number,
    periodCode: string,
    lines: Array<Record<string, unknown>>,
    actor: AuthenticatedUser,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const component = await manager.getRepository(PayrollComponent).findOne({
        where: { companyId, code: 'PUBLIC_HOLIDAY_WORK' },
      });
      assertFinanceReady(component, 'PUBLIC_HOLIDAY_WORK', this.isProduction);
      const period = await manager.getRepository(PayrollPeriod).findOne({
        where: { companyId, periodCode: periodCode.trim() },
      });
      if (!period)
        throw new BadRequestException(
          `Payroll period ${periodCode} was not found.`,
        );
      if (
        [
          PayrollPeriodStatusEnum.LOCKED,
          PayrollPeriodStatusEnum.CLOSED,
        ].includes(period.status)
      ) {
        throw new ConflictException(
          `Payroll period ${periodCode} is locked; choose an open period.`,
        );
      }
      const repository = manager.getRepository(PayrollInput);
      let created = 0;
      for (const line of lines) {
        if (line.status !== 'calculated') continue;
        const reference = `public-holiday:${String(line.employee_id)}:${String(line.date)}`;
        const exists = await repository.findOne({
          where: { companyId, sourceReference: reference },
        });
        if (exists) continue;
        await repository.save(
          repository.create({
            companyId,
            payrollPeriodId: period.id,
            employeeId: Number(line.employee_id),
            componentCode: 'PUBLIC_HOLIDAY_WORK',
            sourceModule: 'LEAVE_STATUTORY',
            sourceReference: reference,
            amount: Number(line.amount).toFixed(2),
            quantity: String(line.hours),
            rate: String(line.hourly_rate),
            currency: String(line.currency),
            status: PayrollInputStatusEnum.DRAFT,
            payload: {
              ...line,
              created_by_company_user_id: actor.companyMembershipId ?? null,
            },
          }),
        );
        created += 1;
      }
      return created;
    });
  }
}

/**
 * A payroll component may receive leave money only once Finance has
 * confirmed its treatment (calculation_configuration.finance_verified), or
 * when it is marked as a test configuration outside production.
 */
export function assertFinanceReady(
  component: PayrollComponent | null,
  code: string,
  isProduction: boolean,
): void {
  if (!component || component.status !== 'ACTIVE') {
    throw new ConflictException(
      `Payroll component ${code} is not set up or not active. Ask payroll to configure it first.`,
    );
  }
  const config = component.calculationConfiguration ?? {};
  const verified = config.finance_verified === true;
  const testOnly = config.test_configuration === true && !isProduction;
  if (!verified && !testOnly) {
    throw new ConflictException(
      `Payroll component ${code} is waiting for Finance to confirm its GL account, tax and pension treatment.`,
    );
  }
}
