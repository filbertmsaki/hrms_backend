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
import { Company } from '../../../../companies/entities/company.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendancePolicy } from '../../policies/entities/attendance-policy.entity';
import { AttendanceGeofence } from '../../geofences/entities/attendance-geofence.entity';
import { AttendanceWifiNetwork } from '../../wifi-networks/entities/attendance-wifi-network.entity';
import { AttendancePunchTypeEnum } from '../enums/attendance-punch-type.enum';
import { AttendancePunchSourceEnum } from '../enums/attendance-punch-source.enum';
import { AttendancePunchValidationStatusEnum } from '../enums/attendance-punch-validation-status.enum';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { Branch } from '../../../branches/entities/branch.entity';

@Entity('attendance_mobile_punches')
@Index('IDX_attendance_mobile_punches_company_id', ['companyId'])
@Index('IDX_attendance_mobile_punches_branch_id', ['branchId'])
@Index('IDX_attendance_mobile_punches_employee_id', ['employeeId'])
@Index('IDX_attendance_mobile_punches_policy_set_id', ['policySetId'])
@Index('IDX_attendance_mobile_punches_geofence_id', ['geofenceId'])
@Index('IDX_attendance_mobile_punches_wifi_network_id', ['wifiNetworkId'])
@Index('IDX_attendance_mobile_punches_punch_time', ['punchTime'])
@Index('IDX_attendance_mobile_punches_attendance_date', ['attendanceDate'])
@Index('IDX_attendance_mobile_punches_punch_type', ['punchType'])
@Index('IDX_attendance_mobile_punches_validation_status', ['validationStatus'])
@Index('IDX_attendance_mobile_punches_employee_date', [
  'employeeId',
  'attendanceDate',
])
@Unique('UQ_attendance_mobile_punch_client_request', [
  'companyId',
  'employeeId',
  'clientRequestId',
])
export class AttendanceMobilePunch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'policy_set_id', type: 'int', nullable: true })
  policySetId: number | null;

  @Column({ name: 'geofence_id', type: 'int', nullable: true })
  geofenceId: number | null;

  @Column({ name: 'wifi_network_id', type: 'int', nullable: true })
  wifiNetworkId: number | null;

  @Column({
    name: 'punch_type',
    type: 'enum',
    enum: AttendancePunchTypeEnum,
  })
  punchType: AttendancePunchTypeEnum;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AttendancePunchSourceEnum,
    default: AttendancePunchSourceEnum.MOBILE,
  })
  source: AttendancePunchSourceEnum;

  @Column({ name: 'punch_time', type: 'timestamp' })
  punchTime: Date;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'client_request_id', type: 'uuid' })
  clientRequestId: string;

  @Column({ name: 'client_captured_at', type: 'timestamptz', nullable: true })
  clientCapturedAt: Date | null;

  @Column({
    name: 'received_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  receivedAt: Date;

  @Column({
    name: 'latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitude: string | null;

  @Column({
    name: 'longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  longitude: string | null;

  @Column({
    name: 'accuracy_meters',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  accuracyMeters: string | null;

  @Column({
    name: 'distance_from_geofence_meters',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  distanceFromGeofenceMeters: string | null;

  @Column({ name: 'wifi_ssid', type: 'varchar', length: 255, nullable: true })
  wifiSsid: string | null;

  @Column({ name: 'wifi_bssid', type: 'varchar', length: 100, nullable: true })
  wifiBssid: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 100, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({
    name: 'device_identifier',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  deviceIdentifier: string | null;

  @Column({
    name: 'validation_status',
    type: 'enum',
    enum: AttendancePunchValidationStatusEnum,
    default: AttendancePunchValidationStatusEnum.REJECTED,
  })
  validationStatus: AttendancePunchValidationStatusEnum;

  @Column({ name: 'validation_message', type: 'text', nullable: true })
  validationMessage: string | null;

  @Column({ name: 'geofence_validation_result', type: 'jsonb', nullable: true })
  geofenceValidationResult: Record<string, any> | null;

  @Column({ name: 'wifi_validation_result', type: 'jsonb', nullable: true })
  wifiValidationResult: Record<string, any> | null;

  @Column({ name: 'is_override_requested', type: 'boolean', default: false })
  isOverrideRequested: boolean;

  @Column({ name: 'override_reason', type: 'text', nullable: true })
  overrideReason: string | null;

  @Column({ name: 'override_reviewed_by', type: 'int', nullable: true })
  overrideReviewedBy: number | null;

  @Column({ name: 'override_reviewed_at', type: 'timestamp', nullable: true })
  overrideReviewedAt: Date | null;

  @Column({ name: 'override_review_note', type: 'text', nullable: true })
  overrideReviewNote: string | null;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo: Record<string, any> | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, any> | null;

  @Column({ name: 'payload_hash', type: 'varchar', length: 128 })
  payloadHash: string;

  /**
   * Later, when connected to attendance_processed_events,
   * this prevents reprocessing the same mobile punch.
   */
  @Column({ name: 'is_processed', type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ name: 'processed_event_id', type: 'int', nullable: true })
  processedEventId: number | null;

  @Column({ name: 'processing_attempts', type: 'int', default: 0 })
  processingAttempts: number;

  @Column({ name: 'last_processing_error', type: 'text', nullable: true })
  lastProcessingError: string | null;

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

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => AttendancePolicy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'policy_set_id' })
  policySet: AttendancePolicy | null;

  @ManyToOne(() => AttendanceGeofence, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'geofence_id' })
  geofence: AttendanceGeofence | null;

  @ManyToOne(() => AttendanceWifiNetwork, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'wifi_network_id' })
  wifiNetwork: AttendanceWifiNetwork | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'override_reviewed_by' })
  overrideReviewer: CompanyUser | null;
}
