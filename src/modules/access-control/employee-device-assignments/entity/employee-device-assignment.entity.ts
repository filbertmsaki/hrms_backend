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
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../enum/employee-device-assignment-sync-status.enum';

@Entity('employee_device_assignments')
@Index('IDX_employee_device_assignments_employee_id', ['employeeId'])
@Index('IDX_employee_device_assignments_device_id', ['deviceId'])
@Index('IDX_employee_device_assignments_sync_status', ['syncStatus'])
@Unique('UQ_employee_device_assignments_employee_device', ['employeeId', 'deviceId'])
export class EmployeeDeviceAssignment {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

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

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => AttendanceDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice;
}
