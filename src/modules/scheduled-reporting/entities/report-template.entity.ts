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
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportTemplateDateRangeStrategyEnum } from '../enums/report-template-date-range-strategy.enum';
import { ReportDefinition } from './report-definition.entity';
import { ReportExecution } from './report-execution.entity';
import { ReportSchedule } from './report-schedule.entity';
import { ReportSmtpConfiguration } from './report-smtp-configuration.entity';
import { ReportTemplateRecipient } from './report-template-recipient.entity';

/**
 * Company-owned reusable reporting template that binds a report definition,
 * output preferences, mail content, and recipient rules.
 */
@Entity('report_templates')
@Index('IDX_report_templates_company_id', ['companyId'])
@Index('IDX_report_templates_definition_id', ['reportDefinitionId'])
@Index('IDX_report_templates_smtp_configuration_id', ['smtpConfigurationId'])
@Index('IDX_report_templates_company_active', ['companyId', 'isActive'])
@Index('UQ_report_templates_company_name', ['companyId', 'name'], {
  unique: true,
})
export class ReportTemplate {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'report_definition_id', type: 'int' })
  reportDefinitionId: number;

  @Column({ name: 'smtp_configuration_id', type: 'int', nullable: true })
  smtpConfigurationId: number | null;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'output_format',
    type: 'enum',
    enum: ReportOutputFormatEnum,
    enumName: 'report_output_format_enum',
    nullable: true,
  })
  outputFormat: ReportOutputFormatEnum | null;

  @Column({
    name: 'filename_pattern',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  filenamePattern: string | null;

  @Column({
    name: 'email_subject_template',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  emailSubjectTemplate: string | null;

  @Column({ name: 'email_body_template', type: 'text', nullable: true })
  emailBodyTemplate: string | null;

  @Column({
    name: 'date_range_strategy',
    type: 'enum',
    enum: ReportTemplateDateRangeStrategyEnum,
    enumName: 'report_template_date_range_strategy_enum',
    nullable: true,
  })
  dateRangeStrategy: ReportTemplateDateRangeStrategyEnum | null;

  @Column({
    name: 'date_range_config',
    type: 'jsonb',
    nullable: true,
    comment:
      'Optional structured date-range parameters for custom or relative windows.',
  })
  dateRangeConfig: Record<string, unknown> | null;

  @Column({
    name: 'report_filters',
    type: 'jsonb',
    nullable: true,
    comment: 'Validated report filter payload stored with the template.',
  })
  reportFilters: Record<string, unknown> | null;

  @Column({ name: 'attach_report', type: 'boolean', default: true })
  attachReport: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

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

  @ManyToOne(() => ReportDefinition, (definition) => definition.templates, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'report_definition_id' })
  reportDefinition: ReportDefinition;

  @ManyToOne(
    () => ReportSmtpConfiguration,
    (smtpConfiguration) => smtpConfiguration.templates,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'smtp_configuration_id' })
  smtpConfiguration: ReportSmtpConfiguration | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  createdByCompanyUser: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_company_user_id' })
  updatedByCompanyUser: CompanyUser | null;

  @OneToMany(() => ReportTemplateRecipient, (recipient) => recipient.template)
  recipients: ReportTemplateRecipient[];

  @OneToMany(() => ReportSchedule, (schedule) => schedule.template)
  schedules: ReportSchedule[];

  @OneToMany(() => ReportExecution, (execution) => execution.template)
  executions: ReportExecution[];
}
