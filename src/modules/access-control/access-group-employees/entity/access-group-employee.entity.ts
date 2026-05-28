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
import { AttendanceDevice } from '../../../hr/attendance/devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { AccessOrganization } from '../../access-organizations/entity/access-organization.entity';
import { AccessGroupEmployeeSourceEnum } from '../enum/access-group-employee-source.enum';
import { AccessGroupEmployeeStatusEnum } from '../enum/access-group-employee-status.enum';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';

@Entity('access_group_employees')
@Index('IDX_access_group_employees_group_id', ['accessGroupId'])
@Index('IDX_access_group_employees_employee_id', ['employeeId'])
@Index('IDX_access_group_employees_employee_no', ['employeeNo'])
@Index('IDX_access_group_employees_device_id', ['deviceId'])
@Unique('UQ_access_group_employees_group_employee_no_device', ['accessGroupId', 'employeeNo', 'deviceId'])
export class AccessGroupEmployee {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'access_group_id', type: 'int' })
  accessGroupId: number;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 200, nullable: true })
  employeeName: string | null;

  @Column({ name: 'organization_id', type: 'int', nullable: true })
  organizationId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AccessGroupEmployeeStatusEnum,
    default: AccessGroupEmployeeStatusEnum.ACTIVE,
  })
  status: AccessGroupEmployeeStatusEnum;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AccessGroupEmployeeSourceEnum,
    default: AccessGroupEmployeeSourceEnum.MANUAL,
  })
  source: AccessGroupEmployeeSourceEnum;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'removed_at', type: 'timestamp', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => AccessGroup, (group) => group.employees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'access_group_id' })
  accessGroup: AccessGroup;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => AccessOrganization, (organization) => organization.groupEmployees, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: AccessOrganization | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;
}
