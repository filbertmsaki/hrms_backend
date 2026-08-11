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
import { Department } from '../../departments/entities/department.entity';
import { EmployeeAssignmentHistoryStatusEnum } from '../enums/employee-assignment-history-status.enum';
import { Employee } from './employee.entity';

@Entity('employee_department_assignment_history')
@Index('IDX_employee_department_history_employee', ['employee_id'])
@Index('IDX_employee_department_history_department', ['department_id'])
export class EmployeeDepartmentAssignmentHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  department_id: number;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ type: 'date' })
  effective_from: string;

  @Column({ type: 'date', nullable: true })
  effective_to: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: EmployeeAssignmentHistoryStatusEnum.ACTIVE,
  })
  status: EmployeeAssignmentHistoryStatusEnum;

  @Column({ type: 'text', nullable: true })
  assignment_reason: string | null;

  @Column({ type: 'int', nullable: true })
  assigned_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  ended_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department: Department;
}
