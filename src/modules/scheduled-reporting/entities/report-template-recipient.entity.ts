import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Department } from '../../hr/departments/entities/department.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { Role } from '../../roles/entities/role.entity';
import { ReportRecipientChannelEnum } from '../enums/report-recipient-channel.enum';
import { ReportRecipientTypeEnum } from '../enums/report-recipient-type.enum';
import { ReportTemplate } from './report-template.entity';

/**
 * Normalized recipient target for a report template. Each row represents one
 * unique address or dynamic recipient source that can later resolve to mailboxes.
 */
@Entity('report_template_recipients')
@Index('IDX_report_template_recipients_company_id', ['companyId'])
@Index('IDX_report_template_recipients_template_id', ['templateId'])
@Index('IDX_report_template_recipients_channel', ['channel'])
@Index('IDX_report_template_recipients_type', ['recipientType'])
@Index(
  'UQ_report_template_recipients_template_target',
  ['templateId', 'targetKey'],
  {
    unique: true,
  },
)
export class ReportTemplateRecipient {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'template_id', type: 'int' })
  templateId: number;

  @Column({
    name: 'channel',
    type: 'enum',
    enum: ReportRecipientChannelEnum,
    enumName: 'report_recipient_channel_enum',
  })
  channel: ReportRecipientChannelEnum;

  @Column({
    name: 'recipient_type',
    type: 'enum',
    enum: ReportRecipientTypeEnum,
    enumName: 'report_recipient_type_enum',
  })
  recipientType: ReportRecipientTypeEnum;

  @Column({
    name: 'target_key',
    type: 'varchar',
    length: 191,
    comment:
      'Normalized uniqueness key used to prevent duplicate recipients per template.',
  })
  targetKey: string;

  @Column({
    name: 'email_address',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  emailAddress: string | null;

  @Column({ name: 'company_user_id', type: 'int', nullable: true })
  companyUserId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'role_id', type: 'int', nullable: true })
  roleId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({
    name: 'dynamic_group_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  dynamicGroupCode: string | null;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  displayName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => ReportTemplate, (template) => template.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: ReportTemplate;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_user_id' })
  companyUser: CompanyUser | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => Role, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role: Role | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;
}
