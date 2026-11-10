import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { Company } from '../../companies/entities/company.entity';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { ContractSignatory } from './entities/contract-signatory.entity';

/** Company legal details printed in the contract header (companies.metadata.legal). */
export type CompanyLegalDetails = {
  legal_name: string | null;
  address: string | null;
  registration_number: string | null;
  tin: string | null;
  phone: string | null;
  email: string | null;
};

export type SignatoryRule = {
  signatory_id: number;
  /** Matches when the employee's grade is one of these. */
  grade_ids: number[];
  /** Matches when the employee's primary position is one of these. */
  position_ids: number[];
  label: string | null;
};

/** Contract settings (companies.metadata.contract_settings). */
export type ContractSettings = {
  digital_signing_enabled: boolean;
  paper_signing_enabled: boolean;
  default_signatory_id: number | null;
  backup_signatory_id: number | null;
  signatory_rules: SignatoryRule[];
  annual_leave_days: number;
  notice_period: string;
  governing_law: string;
};

export const DEFAULT_CONTRACT_SETTINGS: ContractSettings = {
  digital_signing_enabled: true,
  paper_signing_enabled: true,
  default_signatory_id: null,
  backup_signatory_id: null,
  signatory_rules: [],
  annual_leave_days: 28,
  notice_period:
    'as provided by the Employment and Labour Relations Act, 2004 (s.41)',
  governing_law: 'the laws of the United Republic of Tanzania',
};

const EMPTY_LEGAL: CompanyLegalDetails = {
  legal_name: null,
  address: null,
  registration_number: null,
  tin: null,
  phone: null,
  email: null,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function ids(value: unknown): number[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.map(Number).filter((n) => Number.isInteger(n) && n > 0),
        ),
      ]
    : [];
}

function idOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function readLegal(metadata: unknown): CompanyLegalDetails {
  const legal = record(record(metadata).legal);
  return {
    legal_name: text(legal.legal_name, 200),
    address: text(legal.address, 500),
    registration_number: text(legal.registration_number, 100),
    tin: text(legal.tin, 50),
    phone: text(legal.phone, 50),
    email: text(legal.email, 150),
  };
}

export function readContractSettings(metadata: unknown): ContractSettings {
  const raw = record(record(metadata).contract_settings);
  const days = Number(raw.annual_leave_days);
  return {
    digital_signing_enabled:
      typeof raw.digital_signing_enabled === 'boolean'
        ? raw.digital_signing_enabled
        : DEFAULT_CONTRACT_SETTINGS.digital_signing_enabled,
    paper_signing_enabled:
      typeof raw.paper_signing_enabled === 'boolean'
        ? raw.paper_signing_enabled
        : DEFAULT_CONTRACT_SETTINGS.paper_signing_enabled,
    default_signatory_id: idOrNull(raw.default_signatory_id),
    backup_signatory_id: idOrNull(raw.backup_signatory_id),
    signatory_rules: (Array.isArray(raw.signatory_rules)
      ? raw.signatory_rules
      : []
    )
      .map((rule) => record(rule))
      .map((rule) => ({
        signatory_id: idOrNull(rule.signatory_id) ?? 0,
        grade_ids: ids(rule.grade_ids),
        position_ids: ids(rule.position_ids),
        label: text(rule.label, 120),
      }))
      .filter((rule) => rule.signatory_id > 0),
    annual_leave_days:
      Number.isInteger(days) && days > 0 && days <= 365
        ? days
        : DEFAULT_CONTRACT_SETTINGS.annual_leave_days,
    notice_period:
      text(raw.notice_period, 300) ?? DEFAULT_CONTRACT_SETTINGS.notice_period,
    governing_law:
      text(raw.governing_law, 300) ?? DEFAULT_CONTRACT_SETTINGS.governing_law,
  };
}

export type ResolvedSignatory = {
  signatory: ContractSignatory;
  source: 'rule' | 'default' | 'hr_manager';
  rule_label?: string | null;
};

@Injectable()
export class ContractSettingsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly access: HrAccessService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async get(companyId: number) {
    const company = await this.companies.findOneByOrFail({ id: companyId });
    return {
      company_name: company.name,
      legal: readLegal(company.metadata),
      contract_settings: readContractSettings(company.metadata),
    };
  }

  async getForActor(actor: AuthenticatedUser) {
    return this.get(this.access.ensureActorCompanyId(actor));
  }

  async updateLegal(
    actor: AuthenticatedUser,
    input: Partial<CompanyLegalDetails>,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    return this.patchMetadata(actor, companyId, 'legal', (current) => {
      const legal = { ...EMPTY_LEGAL, ...readLegal(current) };
      for (const key of Object.keys(EMPTY_LEGAL) as Array<
        keyof CompanyLegalDetails
      >) {
        if (input[key] !== undefined) legal[key] = text(input[key], 500);
      }
      return legal;
    });
  }

  async updateContractSettings(
    actor: AuthenticatedUser,
    input: Partial<ContractSettings>,
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const next = await this.patchMetadata(
      actor,
      companyId,
      'contract_settings',
      (current) => {
        const settings = readContractSettings(current);
        const merged = readContractSettings({
          contract_settings: { ...settings, ...input },
        });
        if (!merged.digital_signing_enabled && !merged.paper_signing_enabled)
          throw new BadRequestException(
            'At least one signing method (digital or paper) must stay enabled',
          );
        return merged;
      },
      async (settings: ContractSettings, manager) => {
        const referenced = [
          settings.default_signatory_id,
          settings.backup_signatory_id,
          ...settings.signatory_rules.map((rule) => rule.signatory_id),
        ].filter((id): id is number => !!id);
        if (!referenced.length) return;
        const found = await manager
          .getRepository(ContractSignatory)
          .createQueryBuilder('s')
          .where('s.companyId = :companyId AND s.id IN (:...ids)', {
            companyId,
            ids: [...new Set(referenced)],
          })
          .getMany();
        if (found.length !== new Set(referenced).size)
          throw new BadRequestException(
            'Signatory settings reference an unknown signatory',
          );
      },
    );
    return next;
  }

  private async patchMetadata<T>(
    actor: AuthenticatedUser,
    companyId: number,
    key: 'legal' | 'contract_settings',
    build: (metadata: unknown) => T,
    validate?: (value: T, manager: EntityManager) => Promise<void>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Company);
      const company = await repository
        .createQueryBuilder('company')
        .setLock('pessimistic_write')
        .where('company.id = :companyId', { companyId })
        .getOneOrFail();
      const before = record(company.metadata)[key] ?? null;
      const value = build(company.metadata);
      if (validate) await validate(value, manager);
      // Write only this key so other metadata (modules, timezone…) is kept.
      await manager.query(
        // metadata is a json column: edit as jsonb, store back as json.
        `UPDATE "companies" SET "metadata" = jsonb_set(COALESCE("metadata"::jsonb, '{}'::jsonb), $2, $3::jsonb, true)::json WHERE "id" = $1`,
        [companyId, `{${key}}`, JSON.stringify(value)],
      );
      await this.securityEvents.log({
        eventType: SecurityEventType.EMPLOYEE_UPDATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        companyId,
        resourceType: 'company_contract_settings',
        resourceId: companyId,
        metadata: { section: key, before, after: value },
        context: resolveAuditContext(),
      });
      return { ...(await this.get(companyId)) };
    });
  }

  /**
   * Who signs for the company: the first matching rule (grade or position),
   * then the configured default, then an active signatory holding the
   * HR Manager role. Never the employee on the contract.
   */
  async resolveSignatory(
    companyId: number,
    employee: Pick<Employee, 'id' | 'grade_id' | 'primary_position_id'>,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ResolvedSignatory | null> {
    const company = await manager
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    const settings = readContractSettings(company.metadata);
    const repository = manager.getRepository(ContractSignatory);
    const usable = async (id: number | null) => {
      if (!id) return null;
      const signatory = await repository.findOneBy({ id, companyId });
      return signatory?.isActive && signatory.employeeId !== employee.id
        ? signatory
        : null;
    };
    for (const rule of settings.signatory_rules) {
      const matches =
        (employee.grade_id != null &&
          rule.grade_ids.includes(employee.grade_id)) ||
        (employee.primary_position_id != null &&
          rule.position_ids.includes(employee.primary_position_id));
      if (!matches) continue;
      const signatory = await usable(rule.signatory_id);
      if (signatory)
        return { signatory, source: 'rule', rule_label: rule.label };
    }
    const fallback = await usable(settings.default_signatory_id);
    if (fallback) return { signatory: fallback, source: 'default' };
    const rows: Array<{ id: number }> = await manager.query(
      `SELECT s.id FROM "contract_signatories" s
         JOIN "employees" e ON e.id = s.employee_id
         JOIN "company_user_roles" cur ON cur.company_user_id = e.company_user_id
         JOIN "roles" r ON r.id = cur.role_id
        WHERE s.company_id = $1 AND s.is_active = true AND r.name = 'HR_MANAGER'
          AND s.employee_id <> $2
        ORDER BY s.id LIMIT 1`,
      [companyId, employee.id],
    );
    const hrManager = await usable(rows[0]?.id ?? null);
    return hrManager ? { signatory: hrManager, source: 'hr_manager' } : null;
  }

  /** The configured backup may sign when the assigned signatory cannot. */
  async backupSignatoryId(
    companyId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<number | null> {
    const company = await manager
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    return readContractSettings(company.metadata).backup_signatory_id;
  }
}
