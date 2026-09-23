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
import { NotificationChannelEnum } from '../enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../enums/notification-priority.enum';
import { NotificationTypeEnum } from '../enums/notification-type.enum';

@Entity('notification_rules')
@Unique('UQ_notification_rule_company_event_recipient', [
  'companyId',
  'notificationType',
  'triggerEvent',
  'recipientType',
])
@Index('IDX_notification_rules_company_enabled', ['companyId', 'enabled'])
@Index('IDX_notification_rules_type_event', [
  'notificationType',
  'triggerEvent',
])
export class NotificationRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'notification_type', type: 'varchar', length: 80 })
  notificationType: NotificationTypeEnum | string;

  @Column({ name: 'trigger_event', type: 'varchar', length: 120 })
  triggerEvent: string;

  @Column({ name: 'related_module', type: 'varchar', length: 80, nullable: true })
  relatedModule: string | null;

  @Column({ name: 'reminder_before_minutes', type: 'int', nullable: true })
  reminderBeforeMinutes: number | null;

  @Column({ name: 'reminder_after_minutes', type: 'int', nullable: true })
  reminderAfterMinutes: number | null;

  @Column({ name: 'escalation_after_minutes', type: 'int', nullable: true })
  escalationAfterMinutes: number | null;

  @Column({ name: 'repeat_interval_minutes', type: 'int', nullable: true })
  repeatIntervalMinutes: number | null;

  @Column({ name: 'recipient_type', type: 'varchar', length: 80 })
  recipientType: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  channels: NotificationChannelEnum[];

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationPriorityEnum.MEDIUM,
  })
  priority: NotificationPriorityEnum;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;
}
