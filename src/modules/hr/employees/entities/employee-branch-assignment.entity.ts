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
import { Branch } from '../../branches/entities/branch.entity';
import { EmployeeAssignmentHistoryStatusEnum } from '../enums/employee-assignment-history-status.enum';
import { Employee } from './employee.entity';

@Entity('employee_branch_assignments')
@Index('IDX_employee_branch_assignment_employee', ['employee_id'])
@Index('IDX_employee_branch_assignment_branch', ['branch_id'])
@Index('IDX_employee_branch_assignment_company', ['company_id'])
export class EmployeeBranchAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  branch_id: number;

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

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;
}
