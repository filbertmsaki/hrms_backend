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
import { Designation } from '../../designations/entities/designation.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDepartment } from '../../employees/entities/employee-department.entity';
import { Position } from '../../positions/entities/position.entity';

@Entity('departments')
@Index('IDX_department_company', ['company_id'])
@Index('IDX_department_branch', ['branch_id'])
@Unique('UQ_department_code_company', ['company_id', 'code'])
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  parent_id: number | null;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

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

  @ManyToOne(() => Branch, (branch) => branch.departments, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Department, (department) => department.children, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Department | null;

  @OneToMany(() => Department, (department) => department.parent)
  children: Department[];

  @OneToMany(
    () => EmployeeDepartment,
    (employeeDepartment) => employeeDepartment.department,
  )
  employee_assignments: EmployeeDepartment[];

  @OneToMany(() => Employee, (employee) => employee.primary_department)
  primary_employees: Employee[];

  @OneToMany(() => Designation, (designation) => designation.department)
  designations: Designation[];

  @OneToMany(() => Position, (position) => position.department)
  positions: Position[];
}
