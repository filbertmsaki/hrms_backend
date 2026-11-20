import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_web_push_subscriptions')
@Unique('UQ_notification_web_push_endpoint_hash', ['endpointHash'])
@Index('IDX_notification_web_push_receiver', [
  'companyId',
  'companyUserId',
  'isActive',
])
export class WebPushSubscription {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'company_user_id', type: 'int' }) companyUserId: number;
  @Column({ name: 'endpoint', type: 'text' }) endpoint: string;
  @Column({ name: 'endpoint_hash', type: 'char', length: 64 })
  endpointHash: string;
  @Column({ name: 'p256dh', type: 'varchar', length: 255 }) p256dh: string;
  @Column({ name: 'auth', type: 'varchar', length: 255 }) auth: string;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
