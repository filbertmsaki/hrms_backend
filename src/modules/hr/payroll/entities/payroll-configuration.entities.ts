import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import {
  PayrollCalculationMethodEnum,
  PayrollComponentFrequencyEnum,
  PayrollComponentTypeEnum,
  PayrollPeriodStatusEnum,
  PayrollTaxTreatmentEnum,
  StatutorySchemeTypeEnum,
} from '../payroll.enums';

@Entity('payroll_components')
@Unique('UQ_payroll_component_company_code', ['companyId', 'code'])
@Index('IDX_payroll_component_company_status', ['companyId', 'status'])
export class PayrollComponent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({
    name: 'component_type',
    type: 'enum',
    enum: PayrollComponentTypeEnum,
  })
  componentType: PayrollComponentTypeEnum;

  @Column({
    name: 'frequency',
    type: 'enum',
    enum: PayrollComponentFrequencyEnum,
    default: PayrollComponentFrequencyEnum.RECURRING,
  })
  frequency: PayrollComponentFrequencyEnum;

  @Column({
    name: 'calculation_method',
    type: 'enum',
    enum: PayrollCalculationMethodEnum,
  })
  calculationMethod: PayrollCalculationMethodEnum;

  @Column({
    name: 'tax_treatment',
    type: 'enum',
    enum: PayrollTaxTreatmentEnum,
    default: PayrollTaxTreatmentEnum.TAXABLE,
  })
  taxTreatment: PayrollTaxTreatmentEnum;

  @Column({
    name: 'taxable_percentage',
    type: 'decimal',
    precision: 7,
    scale: 4,
    default: '100',
  })
  taxablePercentage: string;

  @Column({ default: false })
  pensionable: boolean;

  @Column({ name: 'health_insurance_applicable', default: false })
  healthInsuranceApplicable: boolean;

  @Column({ name: 'included_in_gross', default: true })
  includedInGross: boolean;

  @Column({ name: 'included_in_net', default: true })
  includedInNet: boolean;

  @Column({ name: 'included_in_employer_cost', default: true })
  includedInEmployerCost: boolean;

  @Column({ name: 'subject_to_proration', default: true })
  subjectToProration: boolean;

  @Column({ name: 'allow_manual_input', default: false })
  allowManualInput: boolean;

  @Column({ name: 'allow_negative_amount', default: false })
  allowNegativeAmount: boolean;

  @Column({ name: 'calculation_order', type: 'int', default: 100 })
  calculationOrder: number;

  @Column({ name: 'calculation_configuration', type: 'jsonb', nullable: true })
  calculationConfiguration: Record<string, unknown> | null;

  @Column({
    name: 'general_ledger_account_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  generalLedgerAccountCode: string | null;

  @Column({
    name: 'liability_account_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  liabilityAccountCode: string | null;

  @Column({
    name: 'expense_account_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  expenseAccountCode: string | null;

  @Column({ name: 'is_system_component', default: false })
  isSystemComponent: boolean;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;
}

@Entity('salary_structures')
@Unique('UQ_salary_structure_company_code_version', [
  'companyId',
  'code',
  'versionNumber',
])
export class SalaryStructure {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'version_number', type: 'int', default: 1 })
  versionNumber: number;

  @Column({ type: 'varchar', length: 3, default: 'TZS' })
  currency: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('salary_structure_components')
@Unique('UQ_salary_structure_component', ['salaryStructureId', 'componentId'])
export class SalaryStructureComponent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'salary_structure_id' })
  salaryStructureId: number;

  @Column({ name: 'component_id' })
  componentId: number;

  @Column({ name: 'default_amount', type: 'decimal', precision: 18, scale: 2, default: '0' })
  defaultAmount: string;

  @Column({ name: 'default_rate', type: 'decimal', precision: 12, scale: 6, nullable: true })
  defaultRate: string | null;

  @Column({ name: 'calculation_order', type: 'int', default: 100 })
  calculationOrder: number;

  @Column({ type: 'jsonb', nullable: true })
  configuration: Record<string, unknown> | null;

  @ManyToOne(() => SalaryStructure, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salary_structure_id' })
  salaryStructure: SalaryStructure;

  @ManyToOne(() => PayrollComponent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'component_id' })
  component: PayrollComponent;
}

@Entity('payroll_calendars')
@Unique('UQ_payroll_calendar_company_code', ['companyId', 'code'])
export class PayrollCalendar {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 60, default: 'MONTHLY' })
  frequency: string;

  @Column({ name: 'cutoff_day', type: 'int', default: 20 })
  cutoffDay: number;

  @Column({ name: 'payment_day', type: 'int', default: 28 })
  paymentDay: number;

  @Column({ type: 'varchar', length: 100, default: 'Africa/Dar_es_Salaam' })
  timezone: string;

  @Column({ type: 'varchar', length: 3, default: 'TZS' })
  currency: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;
}

@Entity('payroll_periods')
@Unique('UQ_payroll_period_company_calendar_month', [
  'companyId',
  'payrollCalendarId',
  'periodYear',
  'periodMonth',
])
export class PayrollPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_calendar_id' })
  payrollCalendarId: number;

  @Column({ name: 'period_code', type: 'varchar', length: 30 })
  periodCode: string;

  @Column({ name: 'period_year', type: 'int' })
  periodYear: number;

  @Column({ name: 'period_month', type: 'int' })
  periodMonth: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'cutoff_date', type: 'date' })
  cutoffDate: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({
    type: 'enum',
    enum: PayrollPeriodStatusEnum,
    default: PayrollPeriodStatusEnum.OPEN,
  })
  status: PayrollPeriodStatusEnum;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @ManyToOne(() => PayrollCalendar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payroll_calendar_id' })
  calendar: PayrollCalendar;
}

@Entity('statutory_schemes')
@Unique('UQ_statutory_scheme_company_code', ['companyId', 'code'])
export class StatutoryScheme {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({
    name: 'scheme_type',
    type: 'enum',
    enum: StatutorySchemeTypeEnum,
  })
  schemeType: StatutorySchemeTypeEnum;

  @Column({ type: 'varchar', length: 80, default: 'TZ' })
  jurisdiction: string;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;
}

@Entity('statutory_rule_versions')
@Index('IDX_statutory_rule_effective', [
  'companyId',
  'schemeId',
  'effectiveFrom',
  'effectiveTo',
])
export class StatutoryRuleVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'scheme_id' })
  schemeId: number;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({
    name: 'calculation_method',
    type: 'enum',
    enum: PayrollCalculationMethodEnum,
  })
  calculationMethod: PayrollCalculationMethodEnum;

  @Column({ name: 'employee_rate', type: 'decimal', precision: 12, scale: 6, nullable: true })
  employeeRate: string | null;

  @Column({ name: 'employer_rate', type: 'decimal', precision: 12, scale: 6, nullable: true })
  employerRate: string | null;

  @Column({ name: 'maximum_basis', type: 'decimal', precision: 18, scale: 2, nullable: true })
  maximumBasis: string | null;

  @Column({ name: 'minimum_basis', type: 'decimal', precision: 18, scale: 2, nullable: true })
  minimumBasis: string | null;

  @Column({ name: 'deduct_employee_before_tax', default: false })
  deductEmployeeBeforeTax: boolean;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  configuration: Record<string, unknown> | null;

  @ManyToOne(() => StatutoryScheme, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheme_id' })
  scheme: StatutoryScheme;
}

@Entity('statutory_tax_bands')
export class StatutoryTaxBand {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'rule_version_id' })
  ruleVersionId: number;

  @Column({ name: 'lower_limit', type: 'decimal', precision: 18, scale: 2 })
  lowerLimit: string;

  @Column({ name: 'upper_limit', type: 'decimal', precision: 18, scale: 2, nullable: true })
  upperLimit: string | null;

  @Column({ name: 'base_tax', type: 'decimal', precision: 18, scale: 2, default: '0' })
  baseTax: string;

  @Column({ name: 'rate_percent', type: 'decimal', precision: 12, scale: 6 })
  ratePercent: string;

  @Column({ name: 'sort_order', type: 'int', default: 1 })
  sortOrder: number;

  @ManyToOne(() => StatutoryRuleVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_version_id' })
  ruleVersion: StatutoryRuleVersion;
}

@Entity('payroll_accounting_mappings')
@Unique('UQ_payroll_accounting_mapping_component', ['companyId', 'componentCode'])
export class PayrollAccountingMapping {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  @Column({ name: 'debit_account_code', type: 'varchar', length: 100 })
  debitAccountCode: string;

  @Column({ name: 'credit_account_code', type: 'varchar', length: 100 })
  creditAccountCode: string;

  @Column({ type: 'jsonb', nullable: true })
  dimensions: Record<string, unknown> | null;
}
