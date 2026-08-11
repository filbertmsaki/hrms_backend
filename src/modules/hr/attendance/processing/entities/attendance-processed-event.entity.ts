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
import { Company } from '../../../../companies/entities/company.entity';
import { Branch } from '../../../branches/entities/branch.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendanceDevice } from '../../../../access-control/attendance-devices/entities/attendance-device.entity';
import { HikvisionAttendanceLog } from '../../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceMobilePunch } from '../../mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendanceEventSourceEnum } from '../enums/attendance-event-source.enum';
import { AttendanceProcessedEventDirectionEnum } from '../enums/attendance-processed-event-direction.enum';

@Entity('attendance_processed_events')
@Index('IDX_attendance_processed_events_company_id', ['companyId'])
@Index('IDX_attendance_processed_events_employee_id', ['employeeId'])
@Index('IDX_attendance_processed_events_employee_no', ['employeeNo'])
@Index('IDX_attendance_processed_events_device_id', ['deviceId'])
@Index('IDX_attendance_processed_events_event_time', ['eventTime'])
@Index('IDX_attendance_processed_events_attendance_date', ['attendanceDate'])
@Index('IDX_attendance_processed_events_company_emp_date', [
  'companyId',
  'employeeId',
  'attendanceDate',
])
@Index('IDX_attendance_processed_events_company_device_empno', [
  'companyId',
  'deviceId',
  'employeeNo',
])
@Index('UQ_attendance_processed_event_source_key', ['sourceKey'], {
  unique: true,
})
@Index('IDX_attendance_processed_event_source', ['source', 'sourceId'])
export class AttendanceProcessedEvent {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'employee_no', type: 'varchar', length: 100, default: '' })
  employeeNo: string;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AttendanceEventSourceEnum,
    default: AttendanceEventSourceEnum.HIKVISION,
  })
  source: AttendanceEventSourceEnum;

  @Column({ name: 'source_id', type: 'int' })
  sourceId: number;

  @Column({ name: 'source_key', type: 'varchar', length: 200, unique: true })
  sourceKey: string;

  @Column({ name: 'raw_log_id', type: 'int', nullable: true })
  rawLogId: number | null;

  @Column({ name: 'mobile_punch_id', type: 'int', nullable: true })
  mobilePunchId: number | null;

  @Column({ name: 'event_time', type: 'timestamp' })
  eventTime: Date;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({
    name: 'direction',
    type: 'enum',
    enum: AttendanceProcessedEventDirectionEnum,
    default: AttendanceProcessedEventDirectionEnum.UNKNOWN,
  })
  direction: AttendanceProcessedEventDirectionEnum;

  @Column({ name: 'event_type', type: 'varchar', length: 120, nullable: true })
  eventType: string | null;

  @Column({ name: 'verify_mode', type: 'varchar', length: 100, nullable: true })
  verifyMode: string | null;

  @Column({ name: 'is_valid', type: 'boolean', default: true })
  isValid: boolean;

  @Column({
    name: 'processing_status',
    type: 'varchar',
    length: 80,
    default: 'PROCESSED',
  })
  processingStatus: string;

  @Column({
    name: 'processing_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  processingReason: string | null;

  @Column({ name: 'raw_payload_snapshot', type: 'json', nullable: true })
  rawPayloadSnapshot: Record<string, unknown> | null;

  @Column({
    name: 'payload_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  payloadHash: string | null;

  @Column({
    name: 'received_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  receivedAt: Date;

  @Column({ name: 'processing_version', type: 'int', default: 1 })
  processingVersion: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;

  @ManyToOne(() => HikvisionAttendanceLog, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'raw_log_id' })
  rawLog: HikvisionAttendanceLog | null;

  @ManyToOne(() => AttendanceMobilePunch, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'mobile_punch_id' })
  mobilePunch: AttendanceMobilePunch | null;
}
