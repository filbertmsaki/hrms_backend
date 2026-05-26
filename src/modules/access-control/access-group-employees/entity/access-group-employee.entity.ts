import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';

@Entity('access_group_employees')
@Index('IDX_access_group_employees_group_id', ['accessGroupId'])
@Index('IDX_access_group_employees_employee_id', ['employeeId'])
@Unique('UQ_access_group_employees_group_employee', ['accessGroupId', 'employeeId'])
export class AccessGroupEmployee {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'access_group_id', type: 'int' })
  accessGroupId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => AccessGroup, (group) => group.employees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'access_group_id' })
  accessGroup: AccessGroup;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}

