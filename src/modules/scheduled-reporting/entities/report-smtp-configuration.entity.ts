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
import { ReportExecution } from './report-execution.entity';
import { ReportTemplate } from './report-template.entity';
import { ReportSmtpSecurityTypeEnum } from '../enums/report-smtp-security-type.enum';
import { ReportSmtpTestStatusEnum } from '../enums/report-smtp-test-status.enum';

/**
 * Company-scoped SMTP connection profile used to authenticate scheduled report
 * deliveries without exposing plain-text credentials at rest.
 */
@Entity('report_smtp_configurations')
@Index('IDX_report_smtp_configurations_company_id', ['companyId'])
@Index('IDX_report_smtp_configurations_company_active', [
  'companyId',
  'isActive',
])
@Index('IDX_report_smtp_configurations_company_default', [
  'companyId',
  'isDefault',
])
@Index('UQ_report_smtp_configurations_company_name', ['companyId', 'name'], {
  unique: true,
})
export class ReportSmtpConfiguration {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'host', type: 'varchar', length: 255 })
  host: string;

  @Column({ name: 'port', type: 'int' })
  port: number;

  @Column({
    name: 'security_type',
    type: 'enum',
    enum: ReportSmtpSecurityTypeEnum,
    enumName: 'report_smtp_security_type_enum',
    default: ReportSmtpSecurityTypeEnum.STARTTLS,
  })
  securityType: ReportSmtpSecurityTypeEnum;

  @Column({ name: 'username', type: 'varchar', length: 255, nullable: true })
  username: string | null;

  @Column({
    name: 'encrypted_password',
    type: 'text',
    nullable: true,
    comment: 'Encrypted SMTP password. Plain-text values must never be stored.',
  })
  encryptedPassword: string | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 150, nullable: true })
  senderName: string | null;

  @Column({ name: 'sender_email', type: 'varchar', length: 255 })
  senderEmail: string;

  @Column({
    name: 'reply_to_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  replyToEmail: string | null;

  @Column({ name: 'connection_timeout_ms', type: 'int', default: 10000 })
  connectionTimeoutMs: number;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({
    name: 'last_test_status',
    type: 'enum',
    enum: ReportSmtpTestStatusEnum,
    enumName: 'report_smtp_test_status_enum',
    default: ReportSmtpTestStatusEnum.UNTESTED,
  })
  lastTestStatus: ReportSmtpTestStatusEnum;

  @Column({ name: 'last_tested_at', type: 'timestamp', nullable: true })
  lastTestedAt: Date | null;

  @Column({ name: 'last_test_error', type: 'text', nullable: true })
  lastTestError: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  createdByCompanyUser: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_company_user_id' })
  updatedByCompanyUser: CompanyUser | null;

  @OneToMany(() => ReportTemplate, (template) => template.smtpConfiguration)
  templates: ReportTemplate[];

  @OneToMany(() => ReportExecution, (execution) => execution.smtpConfiguration)
  executions: ReportExecution[];
}
