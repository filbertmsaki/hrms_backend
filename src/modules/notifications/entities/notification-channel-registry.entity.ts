import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';

@Entity('notification_channel_registry')
@Unique('UQ_notification_channel_registry_channel_code', ['channel', 'code'])
@Index('IDX_notification_channel_registry_channel_module', ['channel', 'module'])
export class NotificationChannelRegistry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannelEnum;

  @Column({ type: 'varchar', length: 160 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 80 })
  module: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
