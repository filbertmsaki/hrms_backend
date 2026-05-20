import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { AttendanceDeviceSyncLogStatusEnum } from '../enums/attendance-device-sync-log-status.enum';
import { AttendanceDeviceSyncLogTypeEnum } from '../enums/attendance-device-sync-log-type.enum';
import { AttendanceDevice } from '../../devices/entities/attendance-device.entity';

@Entity('attendance_device_sync_logs')
@Index('IDX_attendance_device_sync_logs_company_id', ['companyId'])
@Index('IDX_attendance_device_sync_logs_device_id', ['deviceId'])
@Index('IDX_attendance_device_sync_logs_status', ['status'])
@Index('IDX_attendance_device_sync_logs_started_at', ['startedAt'])
@Index('IDX_attendance_device_sync_logs_company_device_started', [
  'companyId',
  'deviceId',
  'startedAt',
])
export class AttendanceDeviceSyncLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @Column({
    name: 'sync_type',
    type: 'enum',
    enum: AttendanceDeviceSyncLogTypeEnum,
  })
  syncType: AttendanceDeviceSyncLogTypeEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceDeviceSyncLogStatusEnum,
  })
  status: AttendanceDeviceSyncLogStatusEnum;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'records_received', type: 'int', default: 0 })
  recordsReceived: number;

  @Column({ name: 'records_processed', type: 'int', default: 0 })
  recordsProcessed: number;

  @Column({ name: 'failed_records', type: 'int', default: 0 })
  failedRecords: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => AttendanceDevice, (device) => device.syncLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice;
}




