import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { Branch } from '../../../branches/entities/branch.entity';
import { AttendanceDevice } from '../../devices/entities/attendance-device.entity';

const payloadColumnType = (process.env.DB_TYPE ?? process.env.TYPEORM_CONNECTION) === 'postgres'
  ? 'jsonb'
  : 'json';

@Entity('hikvision_attendance_logs')
@Index('IDX_hikvision_attendance_logs_company_id', ['companyId'])
@Index('IDX_hikvision_attendance_logs_branch_id', ['branchId'])
@Index('IDX_hikvision_attendance_logs_device_id', ['deviceId'])
@Index('IDX_hikvision_attendance_logs_employee_no', ['employeeNo'])
@Index('IDX_hikvision_attendance_logs_event_time', ['eventTime'])
@Index('IDX_hikvision_attendance_logs_company_event_time', ['companyId', 'eventTime'])
@Unique('UQ_hikvision_attendance_log_device_emp_time_major_minor', [
  'deviceId',
  'employeeNo',
  'eventTime',
  'major',
  'minor',
])
export class AttendanceLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @Column({ name: 'employee_no', type: 'varchar', length: 100, default: '' })
  employeeNo: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 200, nullable: true })
  employeeName: string | null;

  @Column({ name: 'card_no', type: 'varchar', length: 100, nullable: true })
  cardNo: string | null;

  @Column({ name: 'event_time', type: 'timestamp' })
  eventTime: Date;

  @Column({ name: 'major', type: 'int' })
  major: number;

  @Column({ name: 'minor', type: 'int' })
  minor: number;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: string;

  @Column({ name: 'attendance_status', type: 'varchar', length: 50 })
  attendanceStatus: string;

  @Column({ name: 'verify_mode', type: 'varchar', length: 100, nullable: true })
  verifyMode: string | null;

  @Column({ name: 'door_no', type: 'int', nullable: true })
  doorNo: number | null;

  @Column({ name: 'serial_no', type: 'varchar', length: 120, nullable: true })
  serialNo: string | null;

  @Column({ name: 'device_time', type: 'timestamp', nullable: true })
  deviceTime: Date | null;

  @Column({ name: 'raw_payload', type: payloadColumnType as 'json' | 'jsonb' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => AttendanceDevice, (device) => device.hikvisionAttendanceLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice;
}
