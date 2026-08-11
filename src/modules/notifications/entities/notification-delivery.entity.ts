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
import { NotificationChannelEnum } from '../enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from '../enums/notification-delivery-status.enum';
import { AppNotification } from './app-notification.entity';

@Entity('notification_deliveries')
@Unique('UQ_notification_delivery_channel', ['notificationId', 'channel'])
@Index('IDX_notification_delivery_status_retry', ['status', 'nextRetryAt'])
export class NotificationDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'notification_id' })
  notificationId: number;

  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannelEnum;

  @Column({
    type: 'varchar',
    length: 30,
    default: NotificationDeliveryStatusEnum.PENDING,
  })
  status: NotificationDeliveryStatusEnum;

  @Column({
    name: 'recipient_address',
    type: 'varchar',
    length: 320,
    nullable: true,
  })
  recipientAddress: string | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => AppNotification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification: AppNotification;
}
