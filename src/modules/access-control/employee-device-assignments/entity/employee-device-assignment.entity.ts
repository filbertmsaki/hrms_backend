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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { AccessOrganization } from '../../access-organizations/entity/access-organization.entity';
import { EmployeeDeviceRightPlan } from '../../employee-device-right-plans/entity/employee-device-right-plan.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../enum/employee-device-assignment-sync-status.enum';

@Entity('employee_device_assignments')
@Index('IDX_employee_device_assignments_company_id', ['companyId'])
@Index('IDX_employee_device_assignments_employee_id', ['employeeId'])
@Index('IDX_employee_device_assignments_employee_no', ['employeeNo'])
@Index('IDX_employee_device_assignments_device_id', ['deviceId'])
@Index('IDX_employee_device_assignments_organization_id', ['organizationId'])
@Index('IDX_employee_device_assignments_sync_status', ['syncStatus'])
@Unique('UQ_employee_device_assignments_device_employee_no', ['deviceId', 'employeeNo'])
@Unique('UQ_employee_device_assignments_employee_device', ['employeeId', 'deviceId'])
export class EmployeeDeviceAssignment {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 200, nullable: true })
  employeeName: string | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'organization_id', type: 'int', nullable: true })
  organizationId: number | null;

  @Column({ name: 'hikvision_user_type', type: 'varchar', length: 50, nullable: true })
  hikvisionUserType: string | null;

  @Column({ name: 'user_verify_mode', type: 'varchar', length: 120, nullable: true })
  userVerifyMode: string | null;

  @Column({ name: 'valid_begin_time', type: 'timestamp', nullable: true })
  validBeginTime: Date | null;

  @Column({ name: 'valid_end_time', type: 'timestamp', nullable: true })
  validEndTime: Date | null;

  @Column({ name: 'valid_enabled', type: 'boolean', default: true })
  validEnabled: boolean;

  @Column({ name: 'door_right', type: 'varchar', length: 255, nullable: true })
  doorRight: string | null;

  @Column({ name: 'local_ui_right', type: 'boolean', default: false })
  localUiRight: boolean;

  @Column({ name: 'close_delay_enabled', type: 'boolean', default: false })
  closeDelayEnabled: boolean;

  @Column({ name: 'max_open_door_time', type: 'int', default: 0 })
  maxOpenDoorTime: number;

  @Column({ name: 'open_door_time', type: 'int', default: 0 })
  openDoorTime: number;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: EmployeeDeviceAssignmentSyncStatusEnum,
    default: EmployeeDeviceAssignmentSyncStatusEnum.PENDING,
  })
  syncStatus: EmployeeDeviceAssignmentSyncStatusEnum;

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

  @ManyToOne(() => AccessOrganization, (organization) => organization.employeeDeviceAssignments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: AccessOrganization | null;

  @OneToMany(() => EmployeeDeviceRightPlan, (rightPlan) => rightPlan.assignment)
  rightPlans: EmployeeDeviceRightPlan[];
}
