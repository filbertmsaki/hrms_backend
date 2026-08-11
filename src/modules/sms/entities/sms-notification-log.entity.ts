import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SmsLogStatusEnum } from '../enums/sms-log-status.enum';

@Entity('sms_notification_logs')
@Index('IDX_sms_notification_logs_status_created', ['status', 'createdAt'])
@Index('IDX_sms_notification_logs_code_created', [
  'notificationCode',
  'createdAt',
])
export class SmsNotificationLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'registry_id', type: 'int', nullable: true })
  registryId: number | null;

  @Column({
    name: 'notification_code',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  notificationCode: string | null;

  @Column({
    name: 'notification_name',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  notificationName: string | null;

  @Column({ type: 'varchar', length: 80 })
  module: string;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 20 })
  recipientPhone: string;

  @Column({ name: 'recipient_company_user_id', type: 'int', nullable: true })
  recipientCompanyUserId: number | null;

  @Column({ name: 'recipient_employee_id', type: 'int', nullable: true })
  recipientEmployeeId: number | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'template_snapshot', type: 'text', nullable: true })
  templateSnapshot: string | null;

  @Column({
    name: 'related_entity_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  relatedEntityType: string | null;

  @Column({
    name: 'related_entity_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  relatedEntityId: string | null;

  @Column({
    type: 'enum',
    enum: SmsLogStatusEnum,
    default: SmsLogStatusEnum.PENDING,
  })
  status: SmsLogStatusEnum;

  @Column({
    name: 'provider_reference',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  providerReference: string | null;

  @Column({
    name: 'provider_response_code',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  providerResponseCode: string | null;

  @Column({ name: 'provider_response', type: 'text', nullable: true })
  providerResponse: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'retry_of_log_id', type: 'int', nullable: true })
  retryOfLogId: number | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
