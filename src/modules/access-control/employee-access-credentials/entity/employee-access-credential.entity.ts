import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeAccessCredentialSourceEnum } from '../enum/employee-access-credential-source.enum';
import { EmployeeAccessCredentialStatusEnum } from '../enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../enum/employee-access-credential-type.enum';

@Entity('employee_access_credentials')
@Index('IDX_employee_access_credentials_company_id', ['companyId'])
@Index('IDX_employee_access_credentials_employee_id', ['employeeId'])
@Index('IDX_employee_access_credentials_employee_no', ['employeeNo'])
@Index('IDX_employee_access_credentials_device_id', ['deviceId'])
@Index('IDX_employee_access_credentials_card_no', ['cardNo'])
@Unique('UQ_employee_access_credentials_emp_no_device_type_credential', [
  'employeeNo',
  'deviceId',
  'credentialType',
  'credentialNo',
])
export class EmployeeAccessCredential {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({
    name: 'credential_type',
    type: 'enum',
    enum: EmployeeAccessCredentialTypeEnum,
  })
  credentialType: EmployeeAccessCredentialTypeEnum;

  @Column({ name: 'credential_no', type: 'varchar', length: 120, nullable: true })
  credentialNo: string | null;

  @Column({ name: 'pin_password', type: 'varchar', length: 50, nullable: true })
  pinPassword: string | null;

  @Column({ name: 'card_no', type: 'varchar', length: 100, nullable: true })
  cardNo: string | null;

  @Column({ name: 'fingerprint_id', type: 'varchar', length: 100, nullable: true })
  fingerprintId: string | null;

  @Column({ name: 'face_id', type: 'varchar', length: 100, nullable: true })
  faceId: string | null;

  @Column({ name: 'fingerprint_count', type: 'int', default: 0 })
  fingerprintCount: number;

  @Column({ name: 'face_count', type: 'int', default: 0 })
  faceCount: number;

  @Column({ name: 'has_fingerprint', type: 'boolean', default: false })
  hasFingerprint: boolean;

  @Column({ name: 'has_face', type: 'boolean', default: false })
  hasFace: boolean;

  @Column({ name: 'password_set', type: 'boolean', default: false })
  passwordSet: boolean;

  @Column({
    name: 'credential_status',
    type: 'enum',
    enum: EmployeeAccessCredentialStatusEnum,
    default: EmployeeAccessCredentialStatusEnum.ACTIVE,
  })
  credentialStatus: EmployeeAccessCredentialStatusEnum;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({
    name: 'source',
    type: 'enum',
    enum: EmployeeAccessCredentialSourceEnum,
    default: EmployeeAccessCredentialSourceEnum.MANUAL,
  })
  source: EmployeeAccessCredentialSourceEnum;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @ManyToOne(() => Company, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;
}
