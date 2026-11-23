import { Column, Entity, PrimaryColumn } from 'typeorm';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';

@Entity('notification_company_channel_settings')
export class NotificationCompanyChannelSetting {
  @PrimaryColumn({ name: 'company_id', type: 'int' }) companyId: number;
  @PrimaryColumn({ type: 'varchar', length: 20 })
  channel: NotificationChannelEnum;
  // An empty code is the company-wide channel switch. Event codes are nonempty.
  @PrimaryColumn({ type: 'varchar', length: 160 }) code: string;
  @Column({ name: 'is_enabled', type: 'boolean', nullable: true }) isEnabled:
    | boolean
    | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
}
