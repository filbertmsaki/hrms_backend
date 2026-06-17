import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { Company } from '../../companies/entities/company.entity';
import { HikvisionAttendanceSyncJobStatusEnum } from '../enums/hikvision-attendance-sync-job-status.enum';

@Entity('hikvision_attendance_sync_jobs')
@Index('IDX_hikvision_att_sync_jobs_company_id', ['companyId'])
@Index('IDX_hikvision_att_sync_jobs_device_id', ['deviceId'])
@Index('IDX_hikvision_att_sync_jobs_status', ['status'])
@Index('IDX_hikvision_att_sync_jobs_created_at', ['createdAt'])
@Index('IDX_hikvision_att_sync_jobs_company_device_created', [
  'companyId',
  'deviceId',
  'createdAt',
])
@Index('UQ_hikvision_att_sync_jobs_queue_job_id', ['queueJobId'], {
  unique: true,
})
@Index('UQ_hikvision_att_sync_jobs_active_job_key', ['activeJobKey'], {
  unique: true,
})
export class HikvisionAttendanceSyncJob {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @Column({
    name: 'queue_job_id',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  queueJobId: string | null;

  @Column({
    name: 'active_job_key',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  activeJobKey: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: HikvisionAttendanceSyncJobStatusEnum,
    default: HikvisionAttendanceSyncJobStatusEnum.PENDING,
  })
  status: HikvisionAttendanceSyncJobStatusEnum;

  @Column({
    name: 'result_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  resultStatus: string | null;

  @Column({ name: 'sync_start_time', type: 'varchar', length: 40 })
  syncStartTime: string;

  @Column({ name: 'sync_end_time', type: 'varchar', length: 40 })
  syncEndTime: string;

  @Column({ name: 'requested_by_user_id', type: 'int', nullable: true })
  requestedByUserId: number | null;

  @Column({ name: 'requested_by_company_user_id', type: 'int', nullable: true })
  requestedByCompanyUserId: number | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'total_records_pulled', type: 'int', default: 0 })
  totalRecordsPulled: number;

  @Column({ name: 'total_records_saved', type: 'int', default: 0 })
  totalRecordsSaved: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => AttendanceDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice;
}
