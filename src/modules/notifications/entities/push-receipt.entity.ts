import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_push_receipts')
@Unique('UQ_notification_push_receipt_ticket', ['ticketId'])
@Index('IDX_notification_push_receipt_pending', ['status', 'createdAt'])
export class PushReceipt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ticket_id', type: 'varchar', length: 80 })
  ticketId: string;

  @Column({ name: 'push_device_id', type: 'int' })
  pushDeviceId: number;

  @Column({ name: 'notification_delivery_id', type: 'int' })
  notificationDeliveryId: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    name: 'provider_error',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerError: string | null;

  @Column({ type: 'jsonb', nullable: true })
  response: Record<string, unknown> | null;

  @Column({ name: 'checked_at', type: 'timestamptz', nullable: true })
  checkedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
