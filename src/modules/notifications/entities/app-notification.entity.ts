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
import { NotificationCategoryEnum } from '../enums/notification-category.enum';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from '../enums/notification-delivery-status.enum';
import { NotificationPriorityEnum } from '../enums/notification-priority.enum';
import { NotificationStatusEnum } from '../enums/notification-status.enum';
import { NotificationTypeEnum } from '../enums/notification-type.enum';

@Entity('notifications')
@Index('IDX_notifications_company_receiver', [
  'company_id',
  'receiver_company_user_id',
])
@Index('IDX_notifications_company_receiver_archived', [
  'company_id',
  'receiver_company_user_id',
  'archived_at',
])
@Index('IDX_notifications_status', ['status'])
@Index('IDX_notifications_type', ['type'])
@Index('IDX_notifications_category', ['category'])
@Index('IDX_notifications_priority', ['priority'])
@Index('IDX_notifications_entity', ['entity_type', 'entity_id'])
@Index('IDX_notifications_dedupe_key', ['dedupe_key'])
export class AppNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  sender_company_user_id: number | null;

  @Column()
  receiver_company_user_id: number;

  @Column({
    type: 'varchar',
    length: 80,
    default: NotificationTypeEnum.GENERAL,
  })
  type: NotificationTypeEnum;

  @Column({
    type: 'varchar',
    length: 80,
    default: NotificationCategoryEnum.GENERAL,
  })
  category: NotificationCategoryEnum;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationPriorityEnum.MEDIUM,
  })
  priority: NotificationPriorityEnum;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  related_module: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entity_type: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entity_id: string | null;

  @Column({ type: 'int', nullable: true })
  branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  action_url: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationStatusEnum.UNREAD,
  })
  status: NotificationStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  seen_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  read_at: Date | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationChannelEnum.IN_APP,
  })
  delivery_channel: NotificationChannelEnum;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationDeliveryStatusEnum.DELIVERED,
  })
  delivery_status: NotificationDeliveryStatusEnum;

  @Column({ type: 'varchar', length: 180, nullable: true })
  dedupe_key: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  archived_at: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  event_key: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  template_code: string | null;

  @Column({ type: 'boolean', default: false })
  is_mandatory: boolean;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_company_user_id' })
  sender_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receiver_company_user_id' })
  receiver_company_user: CompanyUser;
}
