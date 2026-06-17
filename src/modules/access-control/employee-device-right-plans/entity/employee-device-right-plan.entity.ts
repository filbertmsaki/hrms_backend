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
import { AccessDoor } from '../../access-doors/entity/access-door.entity';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';

@Entity('employee_device_right_plans')
@Index('IDX_employee_device_right_plans_assignment_id', [
  'employeeDeviceAssignmentId',
])
@Index('IDX_employee_device_right_plans_employee_no', ['employeeNo'])
@Index('IDX_employee_device_right_plans_device_id', ['deviceId'])
@Index('IDX_employee_device_right_plans_door_id', ['doorId'])
@Index('IDX_employee_device_right_plans_schedule_template_id', [
  'scheduleTemplateId',
])
@Index('IDX_employee_device_right_plans_is_active', ['isActive'])
@Unique('UQ_employee_device_right_plans_assignment_door_template', [
  'employeeDeviceAssignmentId',
  'doorNo',
  'hikvisionTemplateNo',
])
export class EmployeeDeviceRightPlan {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'employee_device_assignment_id', type: 'int' })
  employeeDeviceAssignmentId: number;

  @Column({ name: 'employee_no', type: 'varchar', length: 100 })
  employeeNo: string;

  @Column({ name: 'device_id', type: 'int' })
  deviceId: number;

  @Column({ name: 'door_id', type: 'int', nullable: true })
  doorId: number | null;

  @Column({ name: 'door_no', type: 'int' })
  doorNo: number;

  @Column({ name: 'schedule_template_id', type: 'int', nullable: true })
  scheduleTemplateId: number | null;

  @Column({ name: 'hikvision_template_no', type: 'varchar', length: 50 })
  hikvisionTemplateNo: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(
    () => EmployeeDeviceAssignment,
    (assignment) => assignment.rightPlans,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'employee_device_assignment_id' })
  assignment: EmployeeDeviceAssignment;

  @ManyToOne(() => AccessDoor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'door_id' })
  door: AccessDoor | null;

  @ManyToOne(() => AccessScheduleTemplate, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'schedule_template_id' })
  scheduleTemplate: AccessScheduleTemplate | null;
}
