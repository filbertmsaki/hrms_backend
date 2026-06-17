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
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { EmployeeDeviceAccessActionEnum } from '../enum/employee-device-access-action.enum';
import { EmployeeDeviceAccessAuditStatusEnum } from '../enum/employee-device-access-audit-status.enum';

@Entity('employee_device_access_audit_logs')
@Index('IDX_employee_device_access_audit_logs_company_id', ['companyId'])
@Index('IDX_employee_device_access_audit_logs_device_id', ['deviceId'])
@Index('IDX_employee_device_access_audit_logs_employee_id', ['employeeId'])
@Index('IDX_employee_device_access_audit_logs_employee_no', ['employeeNo'])
@Index('IDX_employee_device_access_audit_logs_action', ['action'])
@Index('IDX_employee_device_access_audit_logs_status', ['status'])
@Index('IDX_employee_device_access_audit_logs_created_at', ['createdAt'])
export class EmployeeDeviceAccessAuditLog {
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
    name: 'action',
    type: 'enum',
    enum: EmployeeDeviceAccessActionEnum,
  })
  action: EmployeeDeviceAccessActionEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmployeeDeviceAccessAuditStatusEnum,
    default: EmployeeDeviceAccessAuditStatusEnum.PENDING,
  })
  status: EmployeeDeviceAccessAuditStatusEnum;

  @Column({ name: 'request_payload', type: 'json', nullable: true })
  requestPayload: Record<string, unknown> | null;

  @Column({ name: 'response_payload', type: 'json', nullable: true })
  responsePayload: Record<string, unknown> | null;

  @Column({ name: 'old_values', type: 'json', nullable: true })
  oldValues: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'json', nullable: true })
  newValues: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'performed_by_company_user_id', type: 'int', nullable: true })
  performedByCompanyUserId: number | null;

  @Column({ name: 'performed_by_user_id', type: 'int', nullable: true })
  performedByUserId: number | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

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
