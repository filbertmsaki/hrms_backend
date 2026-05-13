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
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDesignation } from '../../employees/entities/employee-designation.entity';
import { EmployeePosition } from '../../employees/entities/employee-position.entity';
import { Position } from '../../positions/entities/position.entity';

@Entity('designations')
@Index('IDX_designation_company', ['company_id'])
@Index('IDX_designation_department', ['department_id'])
@Index('IDX_designation_status', ['status'])
@Unique('UQ_designation_code_company', ['company_id', 'code'])
export class Designation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'int', nullable: true })
  hierarchy_level: number | null;

  @Column({ type: 'int', nullable: true })
  grade_level: number | null;

  @Column({ default: false })
  is_managerial: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Department, (department) => department.designations, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @OneToMany(() => Position, (position) => position.designation)
  positions: Position[];

  @OneToMany(() => Employee, (employee) => employee.primary_designation)
  primary_employees: Employee[];

  @OneToMany(
    () => EmployeePosition,
    (employeePosition) => employeePosition.designation,
  )
  employee_positions: EmployeePosition[];

  @OneToMany(
    () => EmployeeDesignation,
    (employeeDesignation) => employeeDesignation.designation,
  )
  employee_designations: EmployeeDesignation[];
}
