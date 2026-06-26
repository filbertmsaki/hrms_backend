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
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeBiometricCaptureStatusEnum } from '../enum/employee-biometric-capture-status.enum';
import { EmployeeBiometricCaptureTypeEnum } from '../enum/employee-biometric-capture-type.enum';

@Entity('employee_biometric_capture_sessions')
@Index('IDX_employee_biometric_capture_sessions_company_id', ['companyId'])
@Index('IDX_employee_biometric_capture_sessions_device_id', ['deviceId'])
@Index('IDX_employee_biometric_capture_sessions_employee_id', ['employeeId'])
@Index('IDX_employee_biometric_capture_sessions_employee_no', ['employeeNo'])
@Index('IDX_employee_biometric_capture_sessions_capture_type', ['captureType'])
@Index('IDX_employee_biometric_capture_sessions_status', ['status'])
@Index('IDX_employee_biometric_capture_sessions_created_at', ['createdAt'])
export class EmployeeBiometricCaptureSession {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({
    name: 'employee_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  employeeName: string | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({
    name: 'capture_type',
    type: 'enum',
    enum: EmployeeBiometricCaptureTypeEnum,
  })
  captureType: EmployeeBiometricCaptureTypeEnum;

  @Column({
    name: 'fingerprint_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  fingerprintId: string | null;

  @Column({ name: 'face_id', type: 'varchar', length: 100, nullable: true })
  faceId: string | null;

  @Column({ name: 'card_reader_no', type: 'int', nullable: true })
  cardReaderNo: number | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmployeeBiometricCaptureStatusEnum,
    default: EmployeeBiometricCaptureStatusEnum.PENDING,
  })
  status: EmployeeBiometricCaptureStatusEnum;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'capture_request_payload', type: 'json', nullable: true })
  captureRequestPayload: Record<string, unknown> | null;

  @Column({ name: 'capture_response_payload', type: 'json', nullable: true })
  captureResponsePayload: Record<string, unknown> | null;

  @Column({ name: 'setup_request_payload', type: 'json', nullable: true })
  setupRequestPayload: Record<string, unknown> | null;

  @Column({ name: 'setup_response_payload', type: 'json', nullable: true })
  setupResponsePayload: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'performed_by_company_user_id', type: 'int', nullable: true })
  performedByCompanyUserId: number | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

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

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performed_by_company_user_id' })
  performedByCompanyUser: CompanyUser | null;
}
