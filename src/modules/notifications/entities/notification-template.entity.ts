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
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { NotificationTemplateStatusEnum } from '../enums/notification-template-status.enum';

@Entity('notification_templates')
@Unique('UQ_notification_template_company_code', [
  'companyId',
  'templateCode',
])
@Index('IDX_notification_templates_company_status', ['companyId', 'status'])
@Index('IDX_notification_templates_code', ['templateCode'])
export class NotificationTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'template_code', type: 'varchar', length: 120 })
  templateCode: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ name: 'email_subject', type: 'varchar', length: 220, nullable: true })
  emailSubject: string | null;

  @Column({ name: 'system_message', type: 'text' })
  systemMessage: string;

  @Column({ name: 'email_body', type: 'text', nullable: true })
  emailBody: string | null;

  @Column({ name: 'mobile_message', type: 'text', nullable: true })
  mobileMessage: string | null;

  @Column({ name: 'available_variables', type: 'jsonb', default: () => "'[]'" })
  availableVariables: string[];

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationTemplateStatusEnum.ACTIVE,
  })
  status: NotificationTemplateStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;
}
