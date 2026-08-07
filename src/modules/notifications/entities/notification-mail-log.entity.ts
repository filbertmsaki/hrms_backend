import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationMailLogStatusEnum } from '../enums/notification-mail-log-status.enum';

@Entity('notification_mail_logs')
@Index('IDX_notification_mail_logs_company_status_created', [
  'companyId',
  'status',
  'createdAt',
])
@Index('IDX_notification_mail_logs_company_method_created', [
  'companyId',
  'method',
  'createdAt',
])
export class NotificationMailLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 160 })
  method: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 320, nullable: true })
  recipientEmail: string | null;

  @Column({ type: 'jsonb', nullable: true })
  args: unknown[] | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: NotificationMailLogStatusEnum.PENDING,
  })
  status: NotificationMailLogStatusEnum;

  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerMessageId: string | null;

  @Column({ name: 'provider_response', type: 'text', nullable: true })
  providerResponse: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'retry_of_log_id', type: 'int', nullable: true })
  retryOfLogId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
