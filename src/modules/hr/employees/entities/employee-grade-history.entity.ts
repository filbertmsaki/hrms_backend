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
import { EmployeeGrade } from '../../grades/entities/employee-grade.entity';
import { EmployeeAssignmentHistoryStatusEnum } from '../enums/employee-assignment-history-status.enum';
import { Employee } from './employee.entity';

@Entity('employee_grade_histories')
@Index('IDX_employee_grade_history_employee', ['employee_id'])
@Index('IDX_employee_grade_history_company', ['company_id'])
export class EmployeeGradeHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  grade_id: number;

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

  @Column({ type: 'varchar', length: 40, nullable: true })
  source_type: string | null;

  @Column({ type: 'int', nullable: true })
  source_id: number | null;

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

  @ManyToOne(() => EmployeeGrade, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'grade_id' })
  grade: EmployeeGrade;
}
