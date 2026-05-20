import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { Branch } from '../../../branches/entities/branch.entity';
import { AttendanceDeviceStatusEnum } from '../enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../enums/attendance-device-sync-mode.enum';
import { AttendanceCheckpoint } from '../../checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceDeviceSyncLog } from '../../sync-logs/entities/attendance-device-sync-log.entity';

@Entity('attendance_devices')
@Index('IDX_attendance_devices_company_id', ['companyId'])
@Index('IDX_attendance_devices_branch_id', ['branchId'])
@Index('IDX_attendance_devices_device_code', ['deviceCode'], { unique: true })
@Index('IDX_attendance_devices_status', ['status'])
@Index('IDX_attendance_devices_company_status', ['companyId', 'status'])
export class AttendanceDevice {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_name', type: 'varchar', length: 150 })
  deviceName: string;

  @Column({ name: 'device_code', type: 'varchar', length: 100, unique: true })
  deviceCode: string;

  @Column({ name: 'device_serial_number', type: 'varchar', length: 150 })
  deviceSerialNumber: string;

  @Column({ name: 'device_model', type: 'varchar', length: 120 })
  deviceModel: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 64 })
  ipAddress: string;

  @Column({ name: 'port', type: 'int' })
  port: number;

  @Column({ name: 'protocol', type: 'varchar', length: 20 })
  protocol: string;

  @Column({ name: 'api_username', type: 'varchar', length: 120 })
  apiUsername: string;

  @Column({ name: 'api_password', type: 'text' })
  apiPassword: string;

  @Column({
    name: 'sync_mode',
    type: 'enum',
    enum: AttendanceDeviceSyncModeEnum,
    default: AttendanceDeviceSyncModeEnum.PULL,
  })
  syncMode: AttendanceDeviceSyncModeEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceDeviceStatusEnum,
    default: AttendanceDeviceStatusEnum.INACTIVE,
  })
  status: AttendanceDeviceStatusEnum;

  @Column({ name: 'last_sync_at', type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamp', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ name: 'timezone', type: 'varchar', length: 100 })
  timezone: string;

  @Column({ name: 'location_description', type: 'varchar', length: 255, nullable: true })
  locationDescription: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @OneToMany(() => AttendanceDeviceSyncLog, (syncLog) => syncLog.device)
  syncLogs: AttendanceDeviceSyncLog[];

  @OneToMany(() => AttendanceCheckpoint, (checkpoint) => checkpoint.device)
  checkpoints: AttendanceCheckpoint[];
}




