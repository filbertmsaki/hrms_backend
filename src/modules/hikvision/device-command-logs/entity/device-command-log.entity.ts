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
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { DeviceCommandHttpMethodEnum } from '../enum/device-command-http-method.enum';
import { DeviceCommandLogStatusEnum } from '../enum/device-command-log-status.enum';
import { DeviceCommandTypeEnum } from '../enum/device-command-type.enum';

@Entity('device_command_logs')
@Index('IDX_device_command_logs_company_id', ['companyId'])
@Index('IDX_device_command_logs_device_id', ['deviceId'])
@Index('IDX_device_command_logs_command_type', ['commandType'])
@Index('IDX_device_command_logs_status', ['status'])
@Index('IDX_device_command_logs_http_status', ['httpStatus'])
@Index('IDX_device_command_logs_correlation_id', ['correlationId'])
@Index('IDX_device_command_logs_started_at', ['startedAt'])
@Index('IDX_device_command_logs_created_at', ['createdAt'])
export class DeviceCommandLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({
    name: 'command_type',
    type: 'enum',
    enum: DeviceCommandTypeEnum,
    default: DeviceCommandTypeEnum.OTHER,
  })
  commandType: DeviceCommandTypeEnum;

  @Column({
    name: 'http_method',
    type: 'enum',
    enum: DeviceCommandHttpMethodEnum,
  })
  httpMethod: DeviceCommandHttpMethodEnum;

  @Column({ name: 'endpoint', type: 'varchar', length: 255 })
  endpoint: string;

  @Column({ name: 'request_body', type: 'json', nullable: true })
  requestBody: Record<string, unknown> | null;

  @Column({ name: 'response_body', type: 'json', nullable: true })
  responseBody: Record<string, unknown> | null;

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: DeviceCommandLogStatusEnum,
    default: DeviceCommandLogStatusEnum.PENDING,
  })
  status: DeviceCommandLogStatusEnum;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 120, nullable: true })
  correlationId: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'started_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  createdByCompanyUser: CompanyUser | null;
}

