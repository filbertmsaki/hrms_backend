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

/**
 * Per-company bank and ERP connection settings. File exchange is the
 * default; direct connections stay off until credentials are entered and
 * tested. Credentials are stored encrypted and never returned by the API.
 */
@Entity('employee_finance_integration_settings')
@Unique('UQ_employee_finance_integration_company', ['companyId'])
export class EmployeeFinanceIntegrationSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  /** OFF, FILE (journal export), or DIRECT (post to the ERP adapter). */
  @Column({ name: 'erp_mode', type: 'varchar', length: 20, default: 'FILE' })
  erpMode: string;

  @Column({
    name: 'erp_provider',
    type: 'varchar',
    length: 40,
    default: 'GENERIC_WEBHOOK',
  })
  erpProvider: string;

  @Column({
    name: 'erp_environment',
    type: 'varchar',
    length: 20,
    default: 'SANDBOX',
  })
  erpEnvironment: string;

  @Column({ name: 'erp_endpoint_url', type: 'text', nullable: true })
  erpEndpointUrl: string | null;

  /** none, bearer, api-key, or basic. */
  @Column({
    name: 'erp_auth_type',
    type: 'varchar',
    length: 20,
    default: 'none',
  })
  erpAuthType: string;

  @Column({ name: 'erp_credentials', type: 'text', nullable: true })
  erpCredentials: string | null;

  /** FILE (transfer file + statement import) or DIRECT (bank adapter). */
  @Column({ name: 'bank_mode', type: 'varchar', length: 20, default: 'FILE' })
  bankMode: string;

  @Column({
    name: 'bank_provider',
    type: 'varchar',
    length: 40,
    default: 'GENERIC_REST',
  })
  bankProvider: string;

  @Column({
    name: 'bank_environment',
    type: 'varchar',
    length: 20,
    default: 'SANDBOX',
  })
  bankEnvironment: string;

  @Column({ name: 'bank_endpoint_url', type: 'text', nullable: true })
  bankEndpointUrl: string | null;

  @Column({
    name: 'bank_auth_type',
    type: 'varchar',
    length: 20,
    default: 'none',
  })
  bankAuthType: string;

  @Column({ name: 'bank_credentials', type: 'text', nullable: true })
  bankCredentials: string | null;

  /** Company account the loans are paid from, used on transfer files. */
  @Column({
    name: 'debit_account_number',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  debitAccountNumber: string | null;

  /** Transfer file layout: format, delimiter, header, and ordered columns. */
  @Column({ name: 'bank_file_template', type: 'jsonb', nullable: true })
  bankFileTemplate: Record<string, unknown> | null;

  /** Statement columns holding reference, amount, and status. */
  @Column({ name: 'bank_import_mapping', type: 'jsonb', nullable: true })
  bankImportMapping: Record<string, unknown> | null;

  /** General-ledger account codes for each posting role. */
  @Column({ name: 'gl_mapping', type: 'jsonb', nullable: true })
  glMapping: Record<string, unknown> | null;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** Every file produced and every message sent to or received from a bank or ERP. */
@Entity('employee_finance_integration_logs')
@Unique('UQ_employee_finance_integration_log_key', [
  'companyId',
  'idempotencyKey',
])
@Index('IDX_employee_finance_integration_log_status', [
  'companyId',
  'channel',
  'status',
])
export class EmployeeFinanceIntegrationLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  /** ERP or BANK. */
  @Column({ type: 'varchar', length: 10 })
  channel: string;

  @Column({ type: 'varchar', length: 40 })
  operation: string;

  /** FILE or DIRECT. */
  @Column({ type: 'varchar', length: 10 })
  mode: string;

  @Column({ type: 'varchar', length: 20 })
  environment: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey: string;

  /** SUCCESS, FAILED, or ABANDONED after the last retry. */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ name: 'attempt_count', type: 'int', default: 1 })
  attemptCount: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ name: 'file_name', type: 'varchar', length: 200, nullable: true })
  fileName: string | null;

  @Column({ name: 'record_count', type: 'int', default: 0 })
  recordCount: number;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  totalAmount: string;

  /** What was sent (or exported), kept so a failed send can be retried. */
  @Column({ name: 'request_payload', type: 'jsonb', nullable: true })
  requestPayload: Record<string, unknown> | null;

  @Column({ name: 'response_summary', type: 'jsonb', nullable: true })
  responseSummary: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
