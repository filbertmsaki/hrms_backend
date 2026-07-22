import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { ReportEmailDeliveryStatusEnum } from '../enums/report-email-delivery-status.enum';
import { ReportExecutionSourceEnum } from '../enums/report-execution-source.enum';
import { ReportExecutionStatusEnum } from '../enums/report-execution-status.enum';
import { ReportDefinition } from './report-definition.entity';
import { ReportExecutionAttempt } from './report-execution-attempt.entity';
import { ReportExecutionRecipient } from './report-execution-recipient.entity';
import { ReportSchedule } from './report-schedule.entity';
import { ReportSmtpConfiguration } from './report-smtp-configuration.entity';
import { ReportTemplate } from './report-template.entity';

/**
 * Durable execution ledger for every scheduled or manual report run, including
 * report window, generated artifact metadata, delivery status, and retry state.
 */
@Entity('report_executions')
@Index('IDX_report_executions_company_id', ['companyId'])
@Index('IDX_report_executions_template_id', ['templateId'])
@Index('IDX_report_executions_schedule_id', ['scheduleId'])
@Index('IDX_report_executions_status', ['status'])
@Index('IDX_report_executions_delivery_status', ['emailDeliveryStatus'])
@Index('IDX_report_executions_created_at', ['createdAt'])
@Index('IDX_report_executions_company_status_created', [
  'companyId',
  'status',
  'createdAt',
])
@Index('UQ_report_executions_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('UQ_report_executions_queue_job_id', ['queueJobId'], { unique: true })
export class ReportExecution {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'template_id', type: 'int' })
  templateId: number;

  @Column({ name: 'schedule_id', type: 'int', nullable: true })
  scheduleId: number | null;

  @Column({ name: 'report_definition_id', type: 'int', nullable: true })
  reportDefinitionId: number | null;

  @Column({ name: 'smtp_configuration_id', type: 'int', nullable: true })
  smtpConfigurationId: number | null;

  @Column({
    name: 'source',
    type: 'enum',
    enum: ReportExecutionSourceEnum,
    enumName: 'report_execution_source_enum',
  })
  source: ReportExecutionSourceEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReportExecutionStatusEnum,
    enumName: 'report_execution_status_enum',
    default: ReportExecutionStatusEnum.PENDING,
  })
  status: ReportExecutionStatusEnum;

  @Column({
    name: 'email_delivery_status',
    type: 'enum',
    enum: ReportEmailDeliveryStatusEnum,
    enumName: 'report_email_delivery_status_enum',
    default: ReportEmailDeliveryStatusEnum.PENDING,
  })
  emailDeliveryStatus: ReportEmailDeliveryStatusEnum;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 191 })
  idempotencyKey: string;

  @Column({
    name: 'queue_job_id',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  queueJobId: string | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'report_date_from', type: 'date', nullable: true })
  reportDateFrom: string | null;

  @Column({ name: 'report_date_to', type: 'date', nullable: true })
  reportDateTo: string | null;

  @Column({
    name: 'applied_filters',
    type: 'jsonb',
    nullable: true,
    comment: 'Resolved runtime filter payload applied during execution.',
  })
  appliedFilters: Record<string, unknown> | null;

  @Column({
    name: 'execution_metadata',
    type: 'jsonb',
    nullable: true,
    comment:
      'Structured generation and delivery metadata for diagnostics and auditing.',
  })
  executionMetadata: Record<string, unknown> | null;

  @Column({
    name: 'generated_filename',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  generatedFilename: string | null;

  @Column({ name: 'generated_file_path', type: 'text', nullable: true })
  generatedFilePath: string | null;

  @Column({
    name: 'generated_file_mime_type',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  generatedFileMimeType: string | null;

  @Column({ name: 'generated_file_size', type: 'bigint', nullable: true })
  generatedFileSize: string | null;

  @Column({ name: 'record_count', type: 'int', default: 0 })
  recordCount: number;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retry_attempts', type: 'int', default: 0 })
  maxRetryAttempts: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'technical_details', type: 'text', nullable: true })
  technicalDetails: string | null;

  @Column({ name: 'triggered_by_company_user_id', type: 'int', nullable: true })
  triggeredByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => ReportTemplate, (template) => template.executions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'template_id' })
  template: ReportTemplate;

  @ManyToOne(() => ReportSchedule, (schedule) => schedule.executions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'schedule_id' })
  schedule: ReportSchedule | null;

  @ManyToOne(() => ReportDefinition, (definition) => definition.executions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'report_definition_id' })
  reportDefinition: ReportDefinition | null;

  @ManyToOne(
    () => ReportSmtpConfiguration,
    (smtpConfiguration) => smtpConfiguration.executions,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'smtp_configuration_id' })
  smtpConfiguration: ReportSmtpConfiguration | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'triggered_by_company_user_id' })
  triggeredByCompanyUser: CompanyUser | null;

  @OneToMany(() => ReportExecutionRecipient, (recipient) => recipient.execution)
  resolvedRecipients: ReportExecutionRecipient[];

  @OneToMany(() => ReportExecutionAttempt, (attempt) => attempt.execution)
  attempts: ReportExecutionAttempt[];
}
