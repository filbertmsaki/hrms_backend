import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Company } from '../../companies/entities/company.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeAddress } from '../employees/entities/employee-address.entity';
import { EmployeeContact } from '../employees/entities/employee-contact.entity';
import { EmployeeIdentification } from '../employees/entities/employee-identification.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { readContractSettings, readLegal } from './contract-settings.service';
import { ageOn, isLiveMode } from './contract-live-values';
import {
  ContractLiveValuesService,
  LiveResolution,
} from './contract-live-values.service';
import {
  ContractSection,
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
} from './entities/employment-contract.entity';
import { ContractSignatory } from './entities/contract-signatory.entity';
import {
  EmploymentLetterTemplate,
  EmploymentLetterType,
} from './entities/employment-letter-template.entity';

/** Every placeholder a contract template may use. */
export const CONTRACT_TOKENS = [
  'company_legal_name',
  'company_address',
  'company_registration_number',
  'company_tin',
  'employee_name',
  'employee_number',
  'employee_dob',
  'employee_age',
  'employee_sex',
  'employee_address',
  'employee_id_number',
  'employee_phone',
  'employee_email',
  'place_of_recruitment',
  'work_location',
  'job_title',
  'department',
  'reporting_manager',
  'job_description',
  'contract_type',
  'start_date',
  'end_date',
  'task_description',
  'probation_months',
  'hours_of_work',
  'salary',
  'currency',
  'pay_frequency',
  'remuneration_method',
  'benefits',
  'annual_leave_days',
  'notice_period',
  'governing_law',
  'reference_no',
  'signatory_name',
  'signatory_title',
  'issue_date',
  'grade',
  'employment_basis',
] as const;
export type ContractToken = (typeof CONTRACT_TOKENS)[number];

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Identifies invalid placeholders without modifying stored clause text. */
export function invalidContractTokens(sections: ContractSection[]): string[] {
  const allowed = new Set<string>(CONTRACT_TOKENS);
  const errors = new Set<string>();
  for (const section of sections.filter((item) => item.enabled !== false)) {
    for (const text of [section.heading, section.body]) {
      const remainder = text.replace(
        /\{\{([^{}]*?)\}\}/g,
        (_match, value: string) => {
          const key = value.trim();
          if (!/^[a-z_]+$/.test(key) || !allowed.has(key))
            errors.add(key || '{{ }}');
          return '';
        },
      );
      if (remainder.includes('{{') || remainder.includes('}}'))
        errors.add('{{…}}');
    }
  }
  return [...errors];
}

export const CONTRACT_TYPE_LABELS: Record<EmploymentContractType, string> = {
  [EmploymentContractType.UNSPECIFIED]: 'Contract for an unspecified period',
  [EmploymentContractType.FIXED_TERM]: 'Fixed-term contract',
  [EmploymentContractType.SPECIFIC_TASK]: 'Contract for a specific task',
};

/**
 * Built-in clauses used until HR saves a template. Wording is a starting
 * point only and must be reviewed by HR/legal (ELRA 2004 s.14–15).
 */
/**
 * "particulars" wording (redesigned drafts): the Particulars table is the
 * single place for job, place, dates, probation, hours and pay, so these
 * clauses refer to it instead of repeating each value.
 */
const PARTICULARS_WORDING: Record<string, string> = {
  position:
    'The Employee is employed in the position, department and reporting line set out in the Particulars of employment. Duties: {{job_description}}. The Employee shall perform such other lawful duties as may reasonably be assigned.',
  place:
    'The place of recruitment and the place of work are set out in the Particulars of employment. The Employer may reasonably require the Employee to work at another place.',
  probation:
    'The probationary period set out in the Particulars of employment applies. Confirmation in employment is subject to satisfactory performance and conduct, communicated in writing.',
  hours:
    'Normal hours of work are set out in the Particulars of employment, in accordance with the shift or timetable assigned by the Employer.',
  remuneration:
    'The Employee shall be paid the basic salary set out in the Particulars of employment, by {{remuneration_method}}. Benefits: {{benefits}}.',
};

export type DefaultClauseStyle = 'classic' | 'particulars';

export function defaultContractSections(
  contractType: EmploymentContractType,
  style: DefaultClauseStyle = 'classic',
): ContractSection[] {
  if (style === 'particulars') {
    const duration =
      contractType === EmploymentContractType.FIXED_TERM
        ? 'This is a fixed-term contract for the period set out in the Particulars of employment, unless terminated earlier in accordance with this contract.'
        : contractType === EmploymentContractType.SPECIFIC_TASK
          ? 'This contract is for a specific task. It starts on the date set out in the Particulars of employment and ends on completion of the task.'
          : 'This contract is for an unspecified period starting on the date set out in the Particulars of employment.';
    return defaultContractSections(contractType, 'classic').map((section) => ({
      ...section,
      body:
        section.id === 'duration'
          ? duration
          : (PARTICULARS_WORDING[section.id] ?? section.body),
      // Built-in clauses are required; HR marks clauses optional in Templates.
      optional: false,
    }));
  }
  const duration =
    contractType === EmploymentContractType.FIXED_TERM
      ? 'This is a fixed-term contract commencing on {{start_date}} and ending on {{end_date}}, unless terminated earlier in accordance with this contract.'
      : contractType === EmploymentContractType.SPECIFIC_TASK
        ? 'This contract is for a specific task commencing on {{start_date}} and ends on completion of the task, expected by {{end_date}}.'
        : 'This contract is for an unspecified period commencing on {{start_date}}.';
  return [
    {
      id: 'parties',
      heading: 'Parties',
      body: 'This contract of employment is made between {{company_legal_name}} of {{company_address}} (registration no. {{company_registration_number}}, TIN {{company_tin}}) ("the Employer") and {{employee_name}}, employee no. {{employee_number}}, of {{employee_address}} ("the Employee").',
    },
    {
      id: 'position',
      heading: 'Position and duties',
      body: 'The Employee is employed as {{job_title}} in the {{department}} department, reporting to {{reporting_manager}}. Duties: {{job_description}}. The Employee shall perform such other lawful duties as may reasonably be assigned.',
    },
    {
      id: 'place',
      heading: 'Place of recruitment and place of work',
      body: 'The Employee was recruited at {{place_of_recruitment}} and will work at {{work_location}}, or at such other place as the Employer may reasonably require.',
    },
    {
      id: 'duration',
      heading: 'Type and duration of contract',
      body: duration,
    },
    {
      id: 'probation',
      heading: 'Probation',
      body: 'The first {{probation_months}} month(s) of employment are a probationary period. Confirmation in employment is subject to satisfactory performance and conduct, communicated in writing.',
    },
    {
      id: 'hours',
      heading: 'Hours of work',
      body: 'Normal hours of work are {{hours_of_work}}, in accordance with the shift or timetable assigned by the Employer.',
    },
    {
      id: 'remuneration',
      heading: 'Remuneration',
      body: 'The Employee shall be paid a basic salary of {{currency}} {{salary}}, paid {{pay_frequency}} by {{remuneration_method}}. Benefits: {{benefits}}.',
    },
    {
      id: 'deductions',
      heading: 'Statutory deductions and contributions',
      body: 'The Employer shall deduct income tax (PAYE) and make the statutory social security and other contributions required by law from the Employee’s remuneration.',
    },
    {
      id: 'leave',
      heading: 'Leave',
      body: 'The Employee is entitled to {{annual_leave_days}} days of paid annual leave per leave cycle, and to sick, maternity, paternity and compassionate leave in accordance with the law and the Employer’s leave policy.',
    },
    {
      id: 'termination',
      heading: 'Notice and termination',
      body: 'Either party may terminate this contract by giving notice {{notice_period}}. Termination shall be for a fair reason and in accordance with a fair procedure as required by law.',
    },
    {
      id: 'confidentiality',
      heading: 'Confidentiality and data protection',
      body: 'The Employee shall keep confidential all information of the Employer and its clients, during and after employment, and shall process personal data only as authorised and in line with the Personal Data Protection Act, 2022.',
    },
    {
      id: 'conduct',
      heading: 'Conflict of interest and code of conduct',
      body: 'The Employee shall disclose any conflict of interest and shall comply with the Employer’s code of conduct and policies as amended from time to time.',
    },
    {
      id: 'discipline',
      heading: 'Disciplinary and grievance procedures',
      body: 'The Employer’s disciplinary and grievance procedures, which form part of this contract, apply to the Employee.',
    },
    {
      id: 'law',
      heading: 'Governing law and disputes',
      body: 'This contract is governed by {{governing_law}}. Disputes shall be referred to the Commission for Mediation and Arbitration or other competent authority.',
    },
  ];
}

export function tokensIn(textValue: string): string[] {
  return [...textValue.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
}

export function assertKnownTokens(
  sections: { body: string; heading: string }[],
) {
  for (const section of sections) {
    for (const token of tokensIn(`${section.heading} ${section.body}`)) {
      if (!(CONTRACT_TOKENS as readonly string[]).includes(token))
        throw new BadRequestException(`Unknown contract field: {{${token}}}`);
    }
  }
}

/**
 * Fills placeholders. Missing values are reported; in preview they are shown
 * as "[field]" so HR can see what is still needed.
 */
export function renderSections(
  sections: ContractSection[],
  values: Partial<Record<ContractToken, string>>,
): { sections: ContractSection[]; missing: string[] } {
  const missing = new Set<string>();
  const fill = (textValue: string) =>
    textValue.replace(TOKEN_PATTERN, (_, key: string) => {
      const value = values[key as ContractToken]?.trim();
      if (value) return value;
      missing.add(key);
      return `[${key.replace(/_/g, ' ')}]`;
    });
  return {
    // Switched-off clauses are left out of the PDF and of the frozen text.
    sections: sections
      .filter((section) => section.enabled !== false)
      .map((section) => ({
        ...section,
        heading: fill(section.heading),
        body: fill(section.body),
      })),
    missing: [...missing],
  };
}

export type ContractRenderContext = {
  values: Partial<Record<ContractToken, string>>;
  /** Values before HR overrides. */
  automatic: Partial<Record<ContractToken, string>>;
  overrides: Record<string, string>;
  companyName: string;
  legal: ReturnType<typeof readLegal>;
  employeeName: string;
  employeeNo: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  /** Where each live value came from (live drafts only). */
  sources: Partial<Record<string, string>>;
  /** Values HR must look at, e.g. probation not in whole months. */
  warnings: Partial<Record<string, string>>;
  /** Assignment IDs the live draft resolved (override or current). */
  liveRefs: LiveResolution['refs'];
  automaticRefs?: LiveResolution['automaticRefs'];
  /** true once the contract was sent: values come from the frozen snapshot. */
  frozen: boolean;
};

/** Frozen render context saved on send; never rebuilt from current data. */
export type ContractSnapshot = {
  values: Partial<Record<ContractToken, string>>;
  automatic: Partial<Record<ContractToken, string>>;
  overrides: Record<string, string>;
  override_reasons: Record<string, string>;
  company_name: string;
  legal: ReturnType<typeof readLegal>;
  employee_name: string;
  employee_no: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  frozen_at: string;
};

export function snapshotFromContext(
  context: ContractRenderContext,
  overrideReasons: Record<string, string>,
  frozenAt: Date,
): ContractSnapshot {
  return {
    values: { ...context.values },
    automatic: { ...context.automatic },
    overrides: { ...context.overrides },
    override_reasons: { ...overrideReasons },
    company_name: context.companyName,
    legal: context.legal,
    employee_name: context.employeeName,
    employee_no: context.employeeNo,
    signatory_name: context.signatoryName,
    signatory_title: context.signatoryTitle,
    frozen_at: frozenAt.toISOString(),
  };
}

export function readSnapshot(particulars: unknown): ContractSnapshot | null {
  const snapshot =
    particulars && typeof particulars === 'object'
      ? (particulars as Record<string, unknown>).snapshot
      : null;
  return snapshot &&
    typeof snapshot === 'object' &&
    typeof (snapshot as ContractSnapshot).values === 'object'
    ? (snapshot as ContractSnapshot)
    : null;
}

function contextFromSnapshot(
  snapshot: ContractSnapshot,
): ContractRenderContext {
  return {
    values: { ...snapshot.values },
    automatic: { ...snapshot.automatic },
    overrides: { ...snapshot.overrides },
    companyName: snapshot.company_name,
    legal: snapshot.legal,
    employeeName: snapshot.employee_name,
    employeeNo: snapshot.employee_no,
    signatoryName: snapshot.signatory_name,
    signatoryTitle: snapshot.signatory_title,
    sources: {},
    warnings: {},
    liveRefs: {},
    frozen: true,
  };
}

/** Values a live draft takes from HR records instead of stored copies. */
const LIVE_TOKENS = [
  'department',
  'job_title',
  'grade',
  'work_location',
  'reporting_manager',
  'salary',
  'currency',
  'pay_frequency',
  'remuneration_method',
  'hours_of_work',
  'probation_months',
  'annual_leave_days',
  'employment_basis',
] as const;

@Injectable()
export class ContractTemplatesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmploymentLetterTemplate)
    private readonly templates: Repository<EmploymentLetterTemplate>,
    private readonly access: HrAccessService,
    @Optional() private readonly live?: ContractLiveValuesService,
  ) {}

  async list(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const saved = await this.templates.find({
      where: { companyId, letterType: EmploymentLetterType.CONTRACT },
    });
    return Object.values(EmploymentContractType).map((contractType) => {
      const template = saved.find((row) => row.contractType === contractType);
      return {
        contract_type: contractType,
        label: CONTRACT_TYPE_LABELS[contractType],
        id: template?.id ?? null,
        title: template?.title ?? 'Contract of Employment',
        sections: template?.sections ?? defaultContractSections(contractType),
        version: template?.version ?? 0,
        is_default: !template,
        updated_at: template?.updatedAt ?? null,
      };
    });
  }

  async upsert(
    actor: AuthenticatedUser,
    input: {
      contract_type: EmploymentContractType;
      title: string;
      sections: ContractSection[];
    },
  ) {
    const companyId = this.access.ensureActorCompanyId(actor);
    if (!input.sections.length)
      throw new BadRequestException('A contract template needs clauses');
    assertKnownTokens(input.sections);
    const current = await this.templates.findOneBy({
      companyId,
      letterType: EmploymentLetterType.CONTRACT,
      contractType: input.contract_type,
    });
    const company = await this.dataSource
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    return this.templates.save(
      this.templates.create({
        id: current?.id,
        companyId,
        letterType: EmploymentLetterType.CONTRACT,
        contractType: input.contract_type,
        title: input.title.trim() || 'Contract of Employment',
        body: '',
        sections: input.sections.map((section) => ({
          id: section.id,
          heading: section.heading.trim(),
          body: section.body.trim(),
          // Saved templates always say whether a clause is optional, so
          // drafts made from them keep required clauses.
          optional: section.optional === true,
          ...(section.optional && section.enabled === false
            ? { enabled: false }
            : {}),
          ...(section.editable === false ? { editable: false } : {}),
        })),
        signatoryName: company.name,
        signatoryTitle: 'Authorized signatory',
        updatedByCompanyUserId: actor.companyMembershipId!,
        version: (current?.version ?? 0) + 1,
      }),
    );
  }

  /** Template clauses for a new draft (saved template, else built-in). */
  async sectionsFor(
    companyId: number,
    contractType: EmploymentContractType,
    manager: EntityManager = this.dataSource.manager,
    style: DefaultClauseStyle = 'classic',
  ): Promise<{
    sections: ContractSection[];
    templateId: number | null;
    templateVersion: number | null;
    title: string | null;
  }> {
    const template = await manager
      .getRepository(EmploymentLetterTemplate)
      .findOneBy({
        companyId,
        letterType: EmploymentLetterType.CONTRACT,
        contractType,
      });
    return template
      ? {
          sections: template.sections,
          templateId: template.id,
          templateVersion: template.version,
          title: template.title,
        }
      : {
          sections: defaultContractSections(contractType, style),
          templateId: null,
          templateVersion: null,
          title: null,
        };
  }

  /** All values that placeholders resolve to for this contract. */
  async buildContext(
    contract: EmploymentContract,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ContractRenderContext> {
    // A sent contract is rendered only from what was frozen at send.
    const snapshot = readSnapshot(contract.particulars);
    if (snapshot) return contextFromSnapshot(snapshot);
    const companyId = contract.companyId;
    const [company, employee] = await Promise.all([
      manager.getRepository(Company).findOneByOrFail({ id: companyId }),
      manager.getRepository(Employee).findOneByOrFail({
        id: contract.employeeId,
        company_id: companyId,
      }),
    ]);
    const [address, identification, contact, signatory] = await Promise.all([
      manager.getRepository(EmployeeAddress).findOne({
        where: { employee_id: employee.id },
        order: { is_primary: 'DESC', updated_at: 'DESC' },
      }),
      manager.getRepository(EmployeeIdentification).findOne({
        where: { employee_id: employee.id },
        order: { is_primary: 'DESC', id: 'DESC' },
      }),
      manager.getRepository(EmployeeContact).findOne({
        where: { employee_id: employee.id },
        order: { is_primary: 'DESC', id: 'DESC' },
      }),
      contract.assignedSignatoryId
        ? manager
            .getRepository(ContractSignatory)
            .findOneBy({ id: contract.assignedSignatoryId, companyId })
        : Promise.resolve(null),
    ]);
    const legal = readLegal(company.metadata);
    const settings = readContractSettings(company.metadata);
    const particulars = contract.particulars ?? {};
    const str = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : '';
    const addressText = address
      ? [
          address.address_line_1,
          address.address_line_2,
          address.city,
          address.state,
          address.country,
        ]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(', ')
      : '';
    const employeeName = `${employee.first_name} ${employee.last_name}`.trim();
    const values: Partial<Record<ContractToken, string>> = {
      company_legal_name: legal.legal_name ?? company.name,
      company_address: str(legal.address),
      company_registration_number: str(legal.registration_number),
      company_tin: str(legal.tin),
      employee_name: employeeName,
      employee_number: str(employee.employee_no),
      employee_dob: str(employee.date_of_birth),
      employee_age: str(particulars.employee_age),
      employee_sex: str(employee.gender),
      employee_address: str(particulars.permanent_address) || addressText,
      employee_id_number: str(identification?.identification_number),
      employee_phone: str(contact?.phone_number),
      employee_email: str(contact?.email),
      place_of_recruitment: str(particulars.place_of_recruitment),
      work_location: str(contract.workLocation),
      job_title: str(contract.jobTitle),
      department: str(contract.departmentName),
      reporting_manager: str(contract.reportingManagerName),
      job_description:
        str(particulars.job_description) || str(contract.jobTitle),
      contract_type: CONTRACT_TYPE_LABELS[contract.contractType] ?? '',
      start_date: str(contract.startDate),
      end_date: str(contract.endDate),
      task_description: str(particulars.task_description),
      probation_months:
        contract.probationMonths != null
          ? String(contract.probationMonths)
          : '',
      hours_of_work: str(contract.hoursOfWork),
      salary: str(contract.salaryAmount),
      currency: str(contract.salaryCurrency),
      pay_frequency: str(contract.payFrequency).toLowerCase(),
      remuneration_method: str(particulars.remuneration_method),
      benefits: str(contract.benefits) || 'none',
      annual_leave_days: String(settings.annual_leave_days),
      notice_period: settings.notice_period,
      governing_law: settings.governing_law,
      reference_no: str(contract.referenceNo),
      signatory_name: str(signatory?.displayName),
      signatory_title: str(signatory?.jobTitle),
      issue_date: new Date().toISOString().slice(0, 10),
      grade: '',
      employment_basis: '',
    };
    let live: LiveResolution | null = null;
    if (
      isLiveMode(particulars) &&
      contract.status === EmploymentContractStatus.DRAFT &&
      this.live
    ) {
      // Live draft: current HR data, never stored copies.
      live = await this.live.resolve(
        contract,
        employee,
        settings.annual_leave_days,
        manager,
      );
      for (const token of LIVE_TOKENS) values[token] = live.values[token] ?? '';
      values.employee_age = str(
        ageOn(employee.date_of_birth, contract.startDate),
      );
      values.employee_address = addressText;
      if (!values.job_description) values.job_description = values.job_title;
    }
    // HR's per-contract values win over the automatic ones.
    const automatic = { ...values };
    const overrides =
      particulars.field_overrides &&
      typeof particulars.field_overrides === 'object'
        ? (particulars.field_overrides as Record<string, unknown>)
        : {};
    for (const token of CONTRACT_TOKENS) {
      const override = overrides[token];
      if (typeof override === 'string' && override.trim())
        values[token] = override.trim();
    }
    return {
      values,
      automatic,
      overrides: Object.fromEntries(
        Object.entries(overrides).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
      companyName: legal.legal_name ?? company.name,
      legal,
      employeeName,
      employeeNo: employee.employee_no ?? null,
      signatoryName: signatory?.displayName ?? null,
      signatoryTitle: signatory?.jobTitle ?? null,
      sources: live
        ? {
            ...live.sources,
            employee_name: 'Employee record',
            employee_number: 'Employee record',
            employee_dob: 'Employee record',
            employee_sex: 'Employee record',
            employee_address: 'Primary address',
            employee_id_number: 'Identification',
            employee_phone: 'Primary contact',
            employee_email: 'Primary contact',
            company_legal_name: 'Company settings',
            company_address: 'Company settings',
            company_registration_number: 'Company settings',
            company_tin: 'Company settings',
            signatory_name: 'Company signatory',
            signatory_title: 'Company signatory',
          }
        : {},
      warnings: live?.warnings ?? {},
      liveRefs: live?.refs ?? {},
      automaticRefs:
        live?.automaticRefs ??
        (contract.status === EmploymentContractStatus.DRAFT && this.live
          ? await this.live.automaticReferences(employee, companyId, manager)
          : {}),
      frozen: false,
    };
  }
}
