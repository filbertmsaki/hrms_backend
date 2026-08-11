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

@Entity('notification_channel_global_settings')
@Unique('UQ_notification_channel_global_settings_channel', ['channel'])
@Index('IDX_notification_channel_global_settings_channel', ['channel'])
export class NotificationChannelGlobalSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannelEnum;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
