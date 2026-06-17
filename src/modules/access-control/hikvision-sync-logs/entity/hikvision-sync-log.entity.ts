import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { HikvisionSyncLogDirectionEnum } from '../enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../enum/hikvision-sync-log-type.enum';

@Entity('hikvision_sync_logs')
@Index('IDX_hikvision_sync_logs_company_id', ['companyId'])
@Index('IDX_hikvision_sync_logs_device_id', ['deviceId'])
@Index('IDX_hikvision_sync_logs_sync_type', ['syncType'])
@Index('IDX_hikvision_sync_logs_status', ['status'])
@Index('IDX_hikvision_sync_logs_started_at', ['startedAt'])
@Index('IDX_hikvision_sync_logs_company_device_type_started', [
  'companyId',
  'deviceId',
  'syncType',
  'startedAt',
])
export class HikvisionSyncLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'sync_type', type: 'enum', enum: HikvisionSyncLogTypeEnum })
  syncType: HikvisionSyncLogTypeEnum;

  @Column({
    name: 'direction',
    type: 'enum',
    enum: HikvisionSyncLogDirectionEnum,
  })
  direction: HikvisionSyncLogDirectionEnum;

  @Column({ name: 'status', type: 'enum', enum: HikvisionSyncLogStatusEnum })
  status: HikvisionSyncLogStatusEnum;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'records_received', type: 'int', default: 0 })
  recordsReceived: number;

  @Column({ name: 'records_processed', type: 'int', default: 0 })
  recordsProcessed: number;

  @Column({ name: 'records_created', type: 'int', default: 0 })
  recordsCreated: number;

  @Column({ name: 'records_updated', type: 'int', default: 0 })
  recordsUpdated: number;

  @Column({ name: 'records_failed', type: 'int', default: 0 })
  recordsFailed: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;
}
