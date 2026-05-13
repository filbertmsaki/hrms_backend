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
import { Company } from '../../../companies/entities/company.entity';
import { Designation } from '../../designations/entities/designation.entity';
import { Employee } from './employee.entity';

@Entity('employee_designations')
@Index('IDX_employee_designation_company', ['company_id'])
@Index('IDX_employee_designation_employee', ['employee_id'])
@Index('IDX_employee_designation_designation', ['designation_id'])
@Index('IDX_employee_designation_is_current', ['is_current'])
export class EmployeeDesignation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  designation_id: number;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ default: true })
  is_current: boolean;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, (employee) => employee.designation_assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(
    () => Designation,
    (designation) => designation.employee_designations,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'designation_id' })
  designation: Designation;
}
