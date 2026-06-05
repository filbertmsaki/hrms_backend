import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { AttendanceDevice } from '../../access-control/attendance-devices/entities/attendance-device.entity';
import { Branch } from '../../hr/branches/entities/branch.entity';

@Entity('hikvision_attendance_logs')
@Index('IDX_hikvision_attendance_logs_company_id', ['companyId'])
@Index('IDX_hikvision_attendance_logs_branch_id', ['branchId'])
@Index('IDX_hikvision_attendance_logs_device_id', ['deviceId'])
@Index('IDX_hikvision_attendance_logs_employee_no', ['employeeNo'])
@Index('IDX_hikvision_attendance_logs_event_time', ['eventTime'])
@Index('IDX_hikvision_attendance_logs_major', ['major'])
@Index('IDX_hikvision_attendance_logs_minor', ['minor'])
@Index('IDX_hikvision_attendance_logs_door_no', ['doorNo'])
@Index('IDX_hikvision_attendance_logs_serial_no', ['serialNo'])
@Unique('UQ_hikvision_attendance_logs_device_serial_no', ['deviceId', 'serialNo'])
@Unique('UQ_hikvision_attendance_logs_device_emp_time_major_minor_door', [
  'deviceId',
  'employeeNo',
  'eventTime',
  'major',
  'minor',
  'doorNo',
])
export class HikvisionAttendanceLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

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

  @Column({ name: 'event_type', type: 'varchar', length: 120, nullable: true })
  eventType: string | null;

  @Column({ name: 'attendance_status', type: 'varchar', length: 100, nullable: true })
  attendanceStatus: string | null;

  @Column({ name: 'verify_mode', type: 'varchar', length: 100, nullable: true })
  verifyMode: string | null;

  @Column({ name: 'door_no', type: 'int', nullable: true })
  doorNo: number | null;

  @Column({ name: 'card_reader_no', type: 'int', nullable: true })
  cardReaderNo: number | null;

  @Column({ name: 'serial_no', type: 'varchar', length: 120, nullable: true })
  serialNo: string | null;

  @Column({ name: 'device_time', type: 'timestamp', nullable: true })
  deviceTime: Date | null;

  @Column({ name: 'remote_host_addr', type: 'varchar', length: 100, nullable: true })
  remoteHostAddr: string | null;

  @Column({ name: 'net_user', type: 'varchar', length: 120, nullable: true })
  netUser: string | null;

  @Column({ name: 'user_type', type: 'varchar', length: 50, nullable: true })
  userType: string | null;

  @Column({ name: 'status_value', type: 'int', nullable: true })
  statusValue: number | null;

  @Column({ name: 'raw_payload', type: 'json' })
  rawPayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;
}

