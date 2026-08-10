import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import {
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
} from '../employee-finance.enums';

@Entity('employee_finance_products')
@Unique('UQ_employee_finance_product_company_code', ['companyId', 'code'])
@Index('IDX_employee_finance_product_company_status', ['companyId', 'status'])
export class EmployeeFinanceProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({
    name: 'product_type',
    type: 'enum',
    enum: EmployeeFinanceProductTypeEnum,
    enumName: 'employee_finance_product_type_enum',
  })
  productType: EmployeeFinanceProductTypeEnum;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'interest_method',
    type: 'enum',
    enum: EmployeeFinanceInterestMethodEnum,
    enumName: 'employee_finance_interest_method_enum',
    default: EmployeeFinanceInterestMethodEnum.ZERO_INTEREST,
  })
  interestMethod: EmployeeFinanceInterestMethodEnum;

  @Column({
    name: 'annual_interest_rate',
    type: 'decimal',
    precision: 9,
    scale: 6,
    default: '0',
  })
  annualInterestRate: string;

  @Column({
    name: 'processing_fee_method',
    type: 'varchar',
    length: 40,
    default: 'NONE',
  })
  processingFeeMethod: string;

  @Column({
    name: 'processing_fee_value',
    type: 'decimal',
    precision: 18,
    scale: 4,
    default: '0',
  })
  processingFeeValue: string;

  @Column({ name: 'minimum_amount', type: 'decimal', precision: 18, scale: 2 })
  minimumAmount: string;

  @Column({
    name: 'maximum_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  maximumAmount: string | null;

  @Column({
    name: 'maximum_salary_multiple',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  maximumSalaryMultiple: string | null;

  @Column({ name: 'minimum_term_months', type: 'int', default: 1 })
  minimumTermMonths: number;

  @Column({ name: 'maximum_term_months', type: 'int' })
  maximumTermMonths: number;

  @Column({ name: 'minimum_service_months', type: 'int', default: 0 })
  minimumServiceMonths: number;

  @Column({
    name: 'maximum_installment_percentage',
    type: 'decimal',
    precision: 7,
    scale: 4,
  })
  maximumInstallmentPercentage: string;

  @Column({ name: 'maximum_active_accounts', type: 'int', default: 1 })
  maximumActiveAccounts: number;

  @Column({ name: 'requires_confirmation', default: false })
  requiresConfirmation: boolean;

  @Column({ name: 'allow_during_probation', default: false })
  allowDuringProbation: boolean;

  @Column({ name: 'allow_rescheduling', default: true })
  allowRescheduling: boolean;

  @Column({ name: 'allow_deferment', default: true })
  allowDeferment: boolean;

  @Column({ name: 'allow_early_settlement', default: true })
  allowEarlySettlement: boolean;

  @Column({ name: 'allow_additional_repayment', default: true })
  allowAdditionalRepayment: boolean;

  @Column({ name: 'required_document_types', type: 'jsonb', nullable: true })
  requiredDocumentTypes: string[] | null;

  @Column({ name: 'eligibility_configuration', type: 'jsonb' })
  eligibilityConfiguration: Record<string, unknown>;

  @Column({ name: 'approval_configuration', type: 'jsonb' })
  approvalConfiguration: Record<string, unknown>;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @VersionColumn()
  version: number;
}

@Entity('employee_finance_product_applicability')
export class EmployeeFinanceProductApplicability {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'product_id' })
  productId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'grade_id', type: 'int', nullable: true })
  gradeId: number | null;

  @Column({
    name: 'employment_type',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  employmentType: string | null;

  @Column({ name: 'specific_employee_id', type: 'int', nullable: true })
  specificEmployeeId: number | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;
}
