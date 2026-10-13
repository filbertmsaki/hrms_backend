import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_push_devices')
@Unique('UQ_notification_push_device_token', ['expoPushToken'])
@Index('IDX_notification_push_device_receiver', [
  'companyId',
  'companyUserId',
  'isActive',
])
export class PushDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'company_user_id', type: 'int' })
  companyUserId: number;

  @Column({ name: 'expo_push_token', type: 'varchar', length: 255 })
  expoPushToken: string;

  @Column({ type: 'varchar', length: 20 })
  platform: string;

  @Column({ name: 'device_name', type: 'varchar', length: 120, nullable: true })
  deviceName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'last_registered_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastRegisteredAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
