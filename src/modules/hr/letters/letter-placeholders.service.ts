import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { brandingFromCompanyMetadata } from '../../../common/pdf/hr-document-kit';
import { Company } from '../../companies/entities/company.entity';
import { Employee } from '../employees/entities/employee.entity';
import { IdentificationTypeEnum } from '../employees/enums/identification-type.enum';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../employee-movements/entities/employee-compensation-version.entity';
import { RecruitmentCandidate } from '../recruitment/entities/recruitment-candidate.entity';
import { RecruitmentRequest } from '../recruitment/entities/recruitment-request.entity';
import { Position } from '../positions/entities/position.entity';
import { Department } from '../departments/entities/department.entity';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from '../contracts/entities/employment-contract.entity';
import {
  CONFIDENTIAL_KEYS,
  EXTRA_FIELD_KEYS,
  LetterTypeEnum,
  extraFieldDef,
} from './letter-catalogue';
import {
  DEFAULT_LETTER_TIMEZONE,
  amountInWords,
  formatLetterDate,
  formatLetterMoney,
  humanizeEnum,
  isoDateInTimezone,
  yearsOfService,
} from './letter-rules';

export type LetterRecipientRef =
  | { kind: 'employee'; id: number }
  | { kind: 'candidate'; id: number };

export type CompanyLetterContext = {
  companyId: number;
  companyName: string;
  timezone: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export type ResolvedRecipient = {
  kind: 'employee' | 'candidate';
  id: number;
  name: string;
  employeeNo: string | null;
  email: string | null;
  address: string | null;
  companyUserId: number | null;
  /** Employee record for access checks (employees only). */
  employee: Employee | null;
  /** Placeholder values from HRMS data (raw keys, formatted strings). */
  values: Record<string, string>;
  /** Raw amount + currency for money extras. */
  currency: string;
};

const SAMPLE_VALUES: Record<string, string> = {
  employee_name: 'Asha Juma Mwinyi',
  employee_first_name: 'Asha',
  employee_title: 'Ms',
  employee_number: 'EMP-0042',
  employee_email: 'asha.mwinyi@example.co.tz',
  employee_phone: '+255 712 000 000',
  employee_address: 'P.O. Box 1234, Dar es Salaam',
  national_id: '19900101-12345-00001-12',
  gender: 'Female',
  position: 'Senior Accountant',
  department: 'Finance',
  branch: 'Head Office',
  hire_date: '1 March 2019',
  employment_type: 'Full time',
  grade: 'G5',
  manager_name: 'Juma Said',
  probation_start_date: '1 March 2019',
  probation_end_date: '31 August 2019',
  confirmation_date: '1 September 2019',
  years_of_service: '7 years',
  salary: 'TZS 2,500,000',
  currency: 'TZS',
  pay_frequency: 'Monthly',
  salary_in_words: 'two million five hundred thousand',
  contract_type: 'Fixed term',
  contract_start_date: '1 January 2026',
  contract_end_date: '31 December 2027',
  offer_start_date: '1 January 2027',
  offer_salary: 'TZS 2,500,000',
  offer_expiry_date: '15 December 2026',
  effective_date: '1 January 2027',
  new_position: 'Finance Manager',
  new_department: 'Finance',
  new_branch: 'Arusha Branch',
  previous_salary: 'TZS 2,500,000',
  new_salary: 'TZS 2,800,000',
  increment_percentage: '12',
  extension_end_date: '28 February 2027',
  extension_reason:
    'Additional time is needed to demonstrate the agreed performance objectives.',
  acting_position: 'Head of Finance',
  acting_start_date: '1 December 2026',
  acting_end_date: '28 February 2027',
  renewal_start_date: '1 January 2027',
  renewal_end_date: '31 December 2028',
  warning_reason: 'Repeated late reporting to work without permission.',
  warning_level: 'First written warning',
  incident_date: '20 November 2026',
  termination_date: '31 December 2026',
  last_working_day: '31 December 2026',
  termination_reason:
    'Gross misconduct established at the disciplinary hearing.',
  notice_period: 'One month',
  verification_purpose: 'a bank loan application',
  addressee: 'The Branch Manager, Example Bank',
  custom_note: 'Additional note for the employee.',
};

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return (
    typeof value === 'object'
      ? JSON.stringify(value)
      : String(value as string | number | boolean)
  ).trim();
}

function fullName(...parts: Array<string | null | undefined>): string {
  return parts.map(clean).filter(Boolean).join(' ');
}

function titleFromGender(gender: string | null | undefined): string {
  const g = clean(gender).toLowerCase();
  if (g.startsWith('m')) return 'Mr';
  if (g.startsWith('f')) return 'Ms';
  return '';
}

@Injectable()
export class LetterPlaceholdersService {
  constructor(private readonly dataSource: DataSource) {}

  sampleValues(): Record<string, string> {
    return { ...SAMPLE_VALUES };
  }

  async companyContext(
    companyId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<CompanyLetterContext> {
    const company = await manager
      .getRepository(Company)
      .findOneBy({ id: companyId });
    if (!company) throw new NotFoundException('Company not found');
    const brand = brandingFromCompanyMetadata(company.name, company.metadata);
    return {
      companyId,
      companyName: company.name,
      timezone: brand.timezone || DEFAULT_LETTER_TIMEZONE,
      logoUrl: brand.logoUrl,
      address: brand.address ?? null,
      phone: brand.phone ?? null,
      email: brand.email ?? null,
      website: brand.website ?? null,
    };
  }

  companyValues(context: CompanyLetterContext): Record<string, string> {
    return {
      company_name: context.companyName,
      company_address: clean(context.address),
      company_phone: clean(context.phone),
      company_email: clean(context.email),
      company_website: clean(context.website),
    };
  }

  async resolveRecipient(
    companyId: number,
    ref: LetterRecipientRef,
    context: CompanyLetterContext,
    manager: EntityManager = this.dataSource.manager,
    now = new Date(),
  ): Promise<ResolvedRecipient> {
    return ref.kind === 'employee'
      ? this.resolveEmployee(companyId, ref.id, context, manager, now)
      : this.resolveCandidate(companyId, ref.id, context, manager);
  }

  private async resolveEmployee(
    companyId: number,
    employeeId: number,
    context: CompanyLetterContext,
    manager: EntityManager,
    now: Date,
  ): Promise<ResolvedRecipient> {
    const employee = await manager.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: companyId },
      relations: {
        company_user: { user: true },
        primary_position: true,
        primary_department: true,
        primary_branch: true,
        grade: true,
        manager: true,
        contacts: true,
        addresses: true,
        identifications: true,
        department_assignments: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const [compensation, contract] = await Promise.all([
      manager.getRepository(EmployeeCompensationVersion).findOne({
        where: {
          companyId,
          employeeId,
          status: EmployeeCompensationVersionStatusEnum.ACTIVE,
        },
        order: { effectiveFrom: 'DESC' },
      }),
      manager.getRepository(EmploymentContract).findOne({
        where: {
          companyId,
          employeeId,
          status: In([
            EmploymentContractStatus.SIGNED,
            EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
            EmploymentContractStatus.PENDING_HR_SIGNATURE,
            EmploymentContractStatus.PENDING_VERIFICATION,
          ]),
        },
        order: { startDate: 'DESC' },
      }),
    ]);

    const tz = context.timezone;
    const date = (value: string | Date | null | undefined) =>
      formatLetterDate(value ?? null, tz);
    const primary = <T extends { is_primary: boolean }>(
      rows: T[] | undefined,
    ) => (rows ?? []).find((row) => row.is_primary) ?? (rows ?? [])[0] ?? null;
    const contact = primary(employee.contacts);
    const emailContact =
      (employee.contacts ?? []).find((row) => row.is_primary && row.email) ??
      (employee.contacts ?? []).find((row) => row.email) ??
      null;
    const phoneContact =
      (employee.contacts ?? []).find(
        (row) => row.is_primary && row.phone_number,
      ) ??
      (employee.contacts ?? []).find((row) => row.phone_number) ??
      null;
    const address = primary(employee.addresses);
    const addressText = address
      ? [
          address.address_line_1,
          address.address_line_2,
          address.city,
          address.state,
          address.country,
        ]
          .map(clean)
          .filter(Boolean)
          .join(', ')
      : '';
    const nationalId = (employee.identifications ?? []).find(
      (row) => row.identification_type === IdentificationTypeEnum.NATIONAL_ID,
    );
    const currency = clean(compensation?.currency) || 'TZS';
    const email =
      clean(emailContact?.email ?? contact?.email) ||
      clean(employee.company_user?.user?.email);
    const today = isoDateInTimezone(now, tz);

    const values: Record<string, string> = {
      employee_name: fullName(
        employee.first_name,
        employee.middle_name,
        employee.last_name,
      ),
      employee_first_name:
        clean(employee.preferred_name) || clean(employee.first_name),
      employee_title: titleFromGender(employee.gender),
      employee_number: clean(employee.employee_no),
      employee_email: email,
      employee_phone:
        clean(phoneContact?.phone_number) ||
        clean(employee.company_user?.user?.phone),
      employee_address: addressText,
      national_id: clean(nationalId?.identification_number),
      gender: humanizeEnum(employee.gender),
      position: clean(employee.primary_position?.name),
      department: clean(employee.primary_department?.name),
      branch: clean(employee.primary_branch?.name),
      hire_date: date(employee.hire_date),
      employment_type: humanizeEnum(employee.employment_type),
      grade: clean(employee.grade?.name),
      manager_name: employee.manager
        ? fullName(employee.manager.first_name, employee.manager.last_name)
        : '',
      probation_start_date: date(employee.probation_start_date),
      probation_end_date: date(employee.probation_end_date),
      confirmation_date: date(employee.confirmation_date),
      years_of_service: yearsOfService(employee.hire_date, today),
      salary: compensation
        ? formatLetterMoney(compensation.baseSalary, currency)
        : '',
      currency: compensation ? currency : '',
      pay_frequency: humanizeEnum(compensation?.payFrequency),
      salary_in_words: compensation
        ? amountInWords(compensation.baseSalary)
        : '',
      contract_type: contract ? humanizeEnum(contract.contractType) : '',
      contract_start_date: contract ? date(contract.startDate) : '',
      contract_end_date: contract
        ? contract.endDate
          ? date(contract.endDate)
          : 'Open-ended'
        : '',
    };

    return {
      kind: 'employee',
      id: employee.id,
      name: values.employee_name,
      employeeNo: employee.employee_no,
      email: email || null,
      address: addressText || null,
      companyUserId: employee.company_user_id ?? null,
      employee,
      values,
      currency,
    };
  }

  private async resolveCandidate(
    companyId: number,
    candidateId: number,
    context: CompanyLetterContext,
    manager: EntityManager,
  ): Promise<ResolvedRecipient> {
    const candidate = await manager
      .getRepository(RecruitmentCandidate)
      .findOneBy({ id: candidateId, companyId });
    if (!candidate)
      throw new NotFoundException('Recruitment candidate not found');
    const request = await manager
      .getRepository(RecruitmentRequest)
      .findOneBy({ id: candidate.requestId, companyId });
    const position = request?.positionId
      ? await manager
          .getRepository(Position)
          .findOneBy({ id: request.positionId, company_id: companyId })
      : null;
    const department = position?.department_id
      ? await manager
          .getRepository(Department)
          .findOneBy({ id: position.department_id, company_id: companyId })
      : null;
    const tz = context.timezone;
    const name = fullName(candidate.firstName, candidate.lastName);
    const values: Record<string, string> = {
      employee_name: name,
      employee_first_name: clean(candidate.firstName),
      employee_title: titleFromGender(candidate.gender),
      employee_email: clean(candidate.email),
      employee_phone: clean(candidate.phone),
      gender: humanizeEnum(candidate.gender),
      position: clean(position?.name) || clean(request?.jobTitle),
      department: clean(department?.name),
      // Offer defaults from the recruitment offer; extra values override them.
      offer_start_date: formatLetterDate(candidate.offerStartDate, tz),
      offer_salary: candidate.offerSalary
        ? formatLetterMoney(candidate.offerSalary, 'TZS')
        : '',
    };
    return {
      kind: 'candidate',
      id: candidate.id,
      name,
      employeeNo: null,
      email: clean(candidate.email) || null,
      address: null,
      companyUserId: null,
      employee: null,
      values,
      currency: 'TZS',
    };
  }

  /**
   * Validates and formats letter extra values (dates → "27 November 2026",
   * money → "TZS 1,250,000"). Unknown keys are rejected.
   */
  formatExtraValues(
    extra: Record<string, unknown> | null | undefined,
    timezone: string,
    currency: string,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, raw] of Object.entries(extra ?? {})) {
      const def = extraFieldDef(key);
      if (!def) continue;
      const value = clean(raw);
      if (!value) continue;
      if (def.kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        result[key] = formatLetterDate(value.slice(0, 10), timezone);
      } else if (def.kind === 'money' && /^[\d,]+(\.\d+)?$/.test(value)) {
        result[key] = formatLetterMoney(value, currency);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** Rejects extra keys that are not letter extra fields; returns trimmed strings. */
  sanitizeExtraValues(extra: Record<string, unknown> | null | undefined) {
    const result: Record<string, string> = {};
    for (const [key, raw] of Object.entries(extra ?? {})) {
      if (!EXTRA_FIELD_KEYS.includes(key)) {
        throw new BadRequestException(`Unknown letter field: ${key}`);
      }
      if (raw !== null && raw !== undefined && typeof raw === 'object') {
        throw new BadRequestException(`Letter field ${key} must be text`);
      }
      const value = clean(raw);
      if (value.length > 5000) {
        throw new BadRequestException(`Letter field ${key} is too long`);
      }
      if (value) result[key] = value;
    }
    return result;
  }

  /**
   * Final value map for a letter: recipient data, company, dates, signatory
   * and formatted extras (extras win over recipient defaults).
   */
  composeValues(input: {
    context: CompanyLetterContext;
    recipient: Pick<ResolvedRecipient, 'values' | 'currency'>;
    extraValues: Record<string, unknown> | null | undefined;
    signatoryName: string | null | undefined;
    signatoryTitle: string | null | undefined;
    issueDate: Date;
    overrides?: Record<string, string>;
  }): Record<string, string> {
    const tz = input.context.timezone;
    const issue = formatLetterDate(isoDateInTimezone(input.issueDate, tz), tz);
    return {
      ...input.recipient.values,
      ...this.companyValues(input.context),
      issue_date: issue,
      today: issue,
      signatory_name: clean(input.signatoryName),
      signatory_title: clean(input.signatoryTitle),
      ...this.formatExtraValues(
        input.extraValues,
        tz,
        input.recipient.currency,
      ),
      ...(input.overrides ?? {}),
    };
  }

  /** Removes salary / national ID values for actors who may not see them. */
  maskConfidential(values: Record<string, string>): Record<string, string> {
    const copy = { ...values };
    for (const key of CONFIDENTIAL_KEYS) delete copy[key];
    return copy;
  }

  isLetterTypeForCandidate(type: string) {
    return (type as LetterTypeEnum) === LetterTypeEnum.OFFER;
  }
}
