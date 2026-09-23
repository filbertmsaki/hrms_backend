import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import {
  EmployeeFinanceApplicationStatusEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceDecisionEnum,
  EmployeeFinanceProductTypeEnum,
} from '../employee-finance.enums';

@Entity('employee_finance_applications')
@Unique('UQ_employee_finance_application_company_no', [
  'companyId',
  'applicationNo',
])
@Index('IDX_employee_finance_application_employee_status', [
  'companyId',
  'employeeId',
  'status',
])
export class EmployeeFinanceApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'product_id' })
  productId: number;

  @Column({ name: 'application_no', type: 'varchar', length: 60 })
  applicationNo: string;

  @Column({
    name: 'product_type',
    type: 'enum',
    enum: EmployeeFinanceProductTypeEnum,
    enumName: 'employee_finance_product_type_enum',
  })
  productType: EmployeeFinanceProductTypeEnum;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceApplicationStatusEnum,
    enumName: 'employee_finance_application_status_enum',
    default: EmployeeFinanceApplicationStatusEnum.DRAFT,
  })
  status: EmployeeFinanceApplicationStatusEnum;

  @Column({
    name: 'requested_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  requestedAmount: string;

  @Column({ name: 'requested_term_months', type: 'int' })
  requestedTermMonths: number;

  @Column({ type: 'text' })
  purpose: string;

  @Column({
    name: 'approved_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  approvedAmount: string | null;

  @Column({ name: 'approved_term_months', type: 'int', nullable: true })
  approvedTermMonths: number | null;

  @Column({
    name: 'approved_interest_rate',
    type: 'decimal',
    precision: 9,
    scale: 6,
    nullable: true,
  })
  approvedInterestRate: string | null;

  @Column({
    name: 'estimated_installment',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  estimatedInstallment: string | null;

  @Column({ name: 'eligibility_snapshot', type: 'jsonb' })
  eligibilitySnapshot: Record<string, unknown>;

  @Column({ name: 'eligibility_snapshot_hash', type: 'varchar', length: 128 })
  eligibilitySnapshotHash: string;

  @Column({ name: 'product_snapshot', type: 'jsonb' })
  productSnapshot: Record<string, unknown>;

  @Column({ name: 'product_snapshot_hash', type: 'varchar', length: 128 })
  productSnapshotHash: string;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'employee_accepted_at', type: 'timestamptz', nullable: true })
  employeeAcceptedAt: Date | null;

  @Column({ name: 'sanction_document_id', type: 'int', nullable: true })
  sanctionDocumentId: number | null;

  @Column({ name: 'created_by_company_user_id' })
  createdByCompanyUserId: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('employee_finance_application_documents')
export class EmployeeFinanceApplicationDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'application_id' })
  applicationId: number;

  @Column({ name: 'document_type', type: 'varchar', length: 80 })
  documentType: string;

  @Column({ name: 'document_id', type: 'int', nullable: true })
  documentId: number | null;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string | null;

  @Column({ name: 'uploaded_by_company_user_id', type: 'int', nullable: true })
  uploadedByCompanyUserId: number | null;

  @Column({ type: 'varchar', length: 30, default: 'UPLOADED' })
  status: string;

  @Column({ name: 'verified_by_company_user_id', type: 'int', nullable: true })
  verifiedByCompanyUserId: number | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_application_guarantors')
@Unique('UQ_employee_finance_guarantor_employee', [
  'applicationId',
  'guarantorEmployeeId',
])
export class EmployeeFinanceApplicationGuarantor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'application_id' })
  applicationId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'guarantor_employee_id' })
  guarantorEmployeeId: number;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({
    name: 'decided_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  decidedByCompanyUserId: number | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  snapshot: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_sanction_letters')
@Unique('UQ_employee_finance_sanction_application', ['applicationId'])
export class EmployeeFinanceSanctionLetter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'application_id' })
  applicationId: number;

  @Column({ name: 'account_id', type: 'int', nullable: true })
  accountId: number | null;

  @Column({ name: 'letter_no', type: 'varchar', length: 80 })
  letterNo: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'snapshot_hash', type: 'varchar', length: 128 })
  snapshotHash: string;

  @Column({ name: 'generated_by_company_user_id', type: 'int', nullable: true })
  generatedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'generated_at' })
  generatedAt: Date;
}

@Entity('employee_finance_application_approvals')
@Unique('UQ_employee_finance_application_approval_stage', [
  'applicationId',
  'stage',
])
export class EmployeeFinanceApplicationApproval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'application_id' })
  applicationId: number;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceApprovalStageEnum,
    enumName: 'employee_finance_approval_stage_enum',
  })
  stage: EmployeeFinanceApprovalStageEnum;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceDecisionEnum,
    enumName: 'employee_finance_decision_enum',
  })
  decision: EmployeeFinanceDecisionEnum;

  @Column({ name: 'snapshot_hash', type: 'varchar', length: 128 })
  snapshotHash: string;

  @Column({
    name: 'approved_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  approvedAmount: string | null;

  @Column({ name: 'approved_term_months', type: 'int', nullable: true })
  approvedTermMonths: number | null;

  @Column({ name: 'created_by_company_user_id' })
  createdByCompanyUserId: number;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
