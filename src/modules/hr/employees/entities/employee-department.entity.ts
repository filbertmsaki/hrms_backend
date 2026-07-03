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
import { Department } from '../../departments/entities/department.entity';
import { Employee } from './employee.entity';

@Entity('employee_departments')
@Index('IDX_employee_department_department', ['department_id'])
@Unique('UQ_employee_department', ['employee_id', 'department_id'])
export class EmployeeDepartment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column()
  department_id: number;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.department_assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(
    () => Department,
    (department) => department.employee_assignments,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'department_id' })
  department: Department;
}
