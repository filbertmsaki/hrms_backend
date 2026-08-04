import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notification_outbox_events')
@Index('IDX_notification_outbox_status_created', ['status', 'createdAt'])
export class NotificationOutboxEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'notification_id' })
  notificationId: number;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
