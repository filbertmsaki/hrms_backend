import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EmploymentContractType {
  UNSPECIFIED = 'UNSPECIFIED',
  FIXED_TERM = 'FIXED_TERM',
  SPECIFIC_TASK = 'SPECIFIC_TASK',
}

/**
 * Signing lifecycle. `SIGNED` is displayed as "Completed" and keeps its value
 * because onboarding readiness and expiry reminders depend on it.
 * Validity (active / expiring / expired) is derived, never stored.
 */
export enum EmploymentContractStatus {
  DRAFT = 'DRAFT',
  PENDING_HR_SIGNATURE = 'PENDING_HR_SIGNATURE',
  PENDING_EMPLOYEE_SIGNATURE = 'PENDING_EMPLOYEE_SIGNATURE',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  SIGNED = 'SIGNED',
  CANCELLED = 'CANCELLED',
  SUPERSEDED = 'SUPERSEDED',
  /** @deprecated Pre-workflow status. Migrated away; never written by the service. */
  ISSUED = 'ISSUED',
}

export type ContractSection = { id: string; heading: string; body: string };

const numericTransformer = {
  to: (value: string | null | undefined) => value ?? null,
  from: (value: string | null) => value,
};

@Entity('employment_contracts')
@Index(
  'UQ_employment_contract_version',
  ['companyId', 'employeeId', 'version'],
  { unique: true },
)
@Index('UQ_employment_contract_reference', ['companyId', 'referenceNo'], {
  unique: true,
})
@Index('IDX_employment_contract_company_status', ['companyId', 'status'])
export class EmploymentContract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column()
  version: number;

  /** Final EC-YYYY-NNNNN is set by the service; direct inserts get a TMP- default. */
  @Column({
    name: 'reference_no',
    type: 'varchar',
    length: 40,
    default: () => "('TMP-'|| (gen_random_uuid()))",
  })
  referenceNo: string;

  @Column({ type: 'varchar', length: 180, default: 'Contract of Employment' })
  title: string;

  @Column({ name: 'contract_type', type: 'varchar', length: 30 })
  contractType: EmploymentContractType;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /** ELRA s.15 written particulars snapshot (kept for backward compatibility). */
  @Column({ type: 'jsonb' })
  particulars: Record<string, unknown>;

  @Column({ name: 'job_title', type: 'varchar', length: 200, nullable: true })
  jobTitle: string | null;

  @Column({
    name: 'department_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  departmentName: string | null;

  @Column({
    name: 'work_location',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  workLocation: string | null;

  @Column({
    name: 'reporting_manager_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  reportingManagerName: string | null;

  @Column({ name: 'probation_months', type: 'smallint', nullable: true })
  probationMonths: number | null;

  @Column({
    name: 'hours_of_work',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  hoursOfWork: string | null;

  @Column({
    name: 'salary_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  salaryAmount: string | null;

  @Column({
    name: 'salary_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  salaryCurrency: string | null;

  @Column({
    name: 'pay_frequency',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  payFrequency: string | null;

  @Column({ type: 'text', nullable: true })
  benefits: string | null;

  @Column({ name: 'template_id', type: 'int', nullable: true })
  templateId: number | null;

  @Column({ name: 'template_version', type: 'int', nullable: true })
  templateVersion: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  sections: ContractSection[];

  @Column({
    type: 'varchar',
    length: 30,
    default: EmploymentContractStatus.DRAFT,
  })
  status: EmploymentContractStatus;

  @Column({ name: 'assigned_signatory_id', type: 'int', nullable: true })
  assignedSignatoryId: number | null;

  /** Current file pointer, kept for legacy readers (latest file in the chain). */
  @Column({ name: 'document_id', type: 'int', nullable: true })
  documentId: number | null;

  @Column({ name: 'base_document_id', type: 'int', nullable: true })
  baseDocumentId: number | null;

  @Column({
    name: 'base_document_sha256',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  baseDocumentSha256: string | null;

  @Column({ name: 'company_signed_document_id', type: 'int', nullable: true })
  companySignedDocumentId: number | null;

  @Column({
    name: 'company_signed_sha256',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  companySignedSha256: string | null;

  @Column({ name: 'final_document_id', type: 'int', nullable: true })
  finalDocumentId: number | null;

  @Column({ name: 'final_sha256', type: 'varchar', length: 64, nullable: true })
  finalSha256: string | null;

  @Column({ name: 'pending_upload_document_id', type: 'int', nullable: true })
  pendingUploadDocumentId: number | null;

  @Column({ name: 'issued_by_company_user_id', type: 'int' })
  issuedByCompanyUserId: number;

  @Column({ name: 'signed_by_user_id', type: 'int', nullable: true })
  signedByUserId: number | null;

  @Column({ name: 'signed_name', type: 'varchar', length: 200, nullable: true })
  signedName: string | null;

  @Column({ name: 'signed_ip', type: 'varchar', length: 64, nullable: true })
  signedIp: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by_company_user_id', type: 'int', nullable: true })
  cancelledByCompanyUserId: number | null;

  @Column({
    name: 'cancel_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cancelReason: string | null;

  @Column({
    name: 'last_rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  lastRejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
