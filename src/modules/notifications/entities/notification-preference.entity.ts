import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationTypeEnum } from '../enums/notification-type.enum';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';

@Entity('notification_preferences')
@Unique('UQ_notification_preference_scope', [
  'companyMembershipId',
  'notificationType',
  'channel',
])
@Index('IDX_notification_preference_membership', ['companyMembershipId'])
export class NotificationPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_membership_id' })
  companyMembershipId: number;

  @Column({ name: 'notification_type', type: 'varchar', length: 60 })
  notificationType: NotificationTypeEnum;

  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannelEnum;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
