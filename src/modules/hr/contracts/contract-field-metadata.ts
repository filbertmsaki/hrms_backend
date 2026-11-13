import type { ContractToken } from './contract-templates.service';
import { EmploymentContractType } from './entities/employment-contract.entity';

type Metadata = {
  labelKey: string;
  group: string;
  inputKind: string;
  owner: string;
  overridePolicy: 'none' | 'with-reason' | 'reference-only';
  referenceKey?: string;
};
const field = (
  token: ContractToken,
  group: string,
  inputKind: string,
  owner: string,
  overridePolicy: Metadata['overridePolicy'],
  referenceKey?: string,
): Metadata => ({
  labelKey: `contracts.fields.${token}`,
  group,
  inputKind,
  owner,
  overridePolicy,
  ...(referenceKey ? { referenceKey } : {}),
});
export const CONTRACT_FIELD_METADATA: Record<ContractToken, Metadata> = {
  company_legal_name: field(
    'company_legal_name',
    'Parties',
    'text',
    'company',
    'none',
  ),
  company_address: field(
    'company_address',
    'Parties',
    'longtext',
    'company',
    'none',
  ),
  company_registration_number: field(
    'company_registration_number',
    'Parties',
    'text',
    'company',
    'none',
  ),
  company_tin: field('company_tin', 'Parties', 'text', 'company', 'none'),
  signatory_name: field(
    'signatory_name',
    'Parties',
    'text',
    'signatory',
    'none',
  ),
  signatory_title: field(
    'signatory_title',
    'Parties',
    'text',
    'signatory',
    'none',
  ),
  employee_name: field('employee_name', 'Parties', 'text', 'employee', 'none'),
  employee_number: field(
    'employee_number',
    'Parties',
    'text',
    'employee',
    'none',
  ),
  employee_dob: field('employee_dob', 'Parties', 'date', 'employee', 'none'),
  employee_age: field('employee_age', 'Parties', 'number', 'computed', 'none'),
  employee_sex: field('employee_sex', 'Parties', 'text', 'employee', 'none'),
  employee_address: field(
    'employee_address',
    'Parties',
    'longtext',
    'employee',
    'with-reason',
  ),
  employee_id_number: field(
    'employee_id_number',
    'Parties',
    'text',
    'employee',
    'none',
  ),
  employee_phone: field(
    'employee_phone',
    'Parties',
    'text',
    'employee',
    'with-reason',
  ),
  employee_email: field(
    'employee_email',
    'Parties',
    'text',
    'employee',
    'with-reason',
  ),
  place_of_recruitment: field(
    'place_of_recruitment',
    'Role',
    'text',
    'contract',
    'none',
  ),
  work_location: field(
    'work_location',
    'Role',
    'reference',
    'employee',
    'reference-only',
    'branch_id',
  ),
  job_title: field(
    'job_title',
    'Role',
    'reference',
    'position',
    'reference-only',
    'position_id',
  ),
  department: field(
    'department',
    'Role',
    'reference',
    'employee',
    'reference-only',
    'department_id',
  ),
  reporting_manager: field(
    'reporting_manager',
    'Role',
    'reference',
    'employee',
    'reference-only',
    'reports_to_id',
  ),
  job_description: field(
    'job_description',
    'Role',
    'longtext',
    'contract',
    'none',
  ),
  grade: field(
    'grade',
    'Role',
    'reference',
    'employee',
    'reference-only',
    'grade_id',
  ),
  contract_type: field('contract_type', 'Terms', 'enum', 'contract', 'none'),
  start_date: field('start_date', 'Terms', 'date', 'contract', 'none'),
  end_date: field('end_date', 'Terms', 'date', 'contract', 'none'),
  task_description: field(
    'task_description',
    'Terms',
    'longtext',
    'contract',
    'none',
  ),
  probation_months: field(
    'probation_months',
    'Terms',
    'number',
    'policy',
    'with-reason',
  ),
  hours_of_work: field(
    'hours_of_work',
    'Terms',
    'text',
    'policy',
    'with-reason',
  ),
  annual_leave_days: field(
    'annual_leave_days',
    'Terms',
    'number',
    'policy',
    'with-reason',
  ),
  notice_period: field(
    'notice_period',
    'Terms',
    'longtext',
    'policy',
    'with-reason',
  ),
  governing_law: field(
    'governing_law',
    'Terms',
    'text',
    'policy',
    'with-reason',
  ),
  employment_basis: field(
    'employment_basis',
    'Terms',
    'enum',
    'contract',
    'none',
  ),
  salary: field(
    'salary',
    'Pay & benefits',
    'money',
    'compensation',
    'with-reason',
  ),
  currency: field(
    'currency',
    'Pay & benefits',
    'enum',
    'compensation',
    'with-reason',
  ),
  pay_frequency: field(
    'pay_frequency',
    'Pay & benefits',
    'enum',
    'compensation',
    'with-reason',
  ),
  remuneration_method: field(
    'remuneration_method',
    'Pay & benefits',
    'enum',
    'payroll',
    'with-reason',
  ),
  benefits: field('benefits', 'Pay & benefits', 'longtext', 'contract', 'none'),
  reference_no: field('reference_no', 'Review', 'text', 'computed', 'none'),
  issue_date: field('issue_date', 'Review', 'date', 'computed', 'none'),
};

export function addressOverrideWarning(
  override: string | undefined,
  companyAddress: string | undefined,
): string | null {
  const normalize = (value: string | undefined) =>
    (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return normalize(override) &&
    normalize(override) === normalize(companyAddress)
    ? 'The employee address override matches the company address. Check that it is correct.'
    : null;
}
export function taskDescriptionError(
  type: EmploymentContractType,
  value: unknown,
): string | null {
  return type === EmploymentContractType.SPECIFIC_TASK &&
    (typeof value !== 'string' || !value.trim())
    ? 'Enter a description of the specific task.'
    : null;
}
