import {
  Column,
  CreateDateColumn,
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
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Designation } from '../../designations/entities/designation.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeePosition } from '../../employees/entities/employee-position.entity';

@Entity('positions')
@Index('IDX_position_company', ['company_id'])
@Index('IDX_position_branch', ['branch_id'])
@Index('IDX_position_department', ['department_id'])
@Index('IDX_position_designation', ['designation_id'])
@Index('IDX_position_reports_to', ['reports_to_position_id'])
@Index('IDX_position_status', ['status'])
@Unique('UQ_position_code_company', ['company_id', 'code'])
export class Position {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ type: 'int', nullable: true })
  designation_id: number | null;

  @Column({ type: 'int', nullable: true })
  reports_to_position_id: number | null;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'int', nullable: true })
  level: number | null;

  @Column({ default: false })
  is_manager: boolean;

  @Column({ type: 'int', default: 1 })
  headcount: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: 'active', length: 20 })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, (branch) => branch.positions, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Department, (department) => department.positions, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @ManyToOne(() => Designation, (designation) => designation.positions, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'designation_id' })
  designation: Designation | null;

  @ManyToOne(() => Position, (position) => position.subordinate_positions, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'reports_to_position_id' })
  reports_to_position: Position | null;

  @OneToMany(() => Position, (position) => position.reports_to_position)
  subordinate_positions: Position[];

  @OneToMany(() => Employee, (employee) => employee.primary_position)
  primary_employees: Employee[];

  @OneToMany(
    () => EmployeePosition,
    (employeePosition) => employeePosition.position,
  )
  employee_assignments: EmployeePosition[];
}
