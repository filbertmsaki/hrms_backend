import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Position } from '../../positions/entities/position.entity';
import { EmployeeDepartment } from './employee-department.entity';
import { EmployeeDocument } from './employee-document.entity';

@Entity('employees')
@Unique('UQ_employee_company_user', ['company_user_id'])
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_user_id: number;

  @Column({ length: 50 })
  employee_no: string;

  @Column({ length: 100 })
  first_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  middle_name: string | null;

  @Column({ length: 100 })
  last_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  preferred_name: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'date', nullable: true })
  date_of_birth: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  marital_status: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  national_id_no: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  passport_no: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tax_id_no: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  social_security_no: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  work_email: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  personal_email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  alternate_phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line_1: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line_2: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  postal_code: string | null;

  @Column({ type: 'text', nullable: true })
  profile_photo_url: string | null;

  @Column({ type: 'int', nullable: true })
  primary_branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  primary_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  position_id: number | null;

  @Column({ default: 'onboarding', length: 30 })
  employment_status: string;

  @Column({ default: 'full_time', length: 30 })
  employment_type: string;

  @Column({ type: 'date', nullable: true })
  hire_date: string | null;

  @Column({ type: 'date', nullable: true })
  probation_end_date: string | null;

  @Column({ type: 'date', nullable: true })
  confirmation_date: string | null;

  @Column({ type: 'date', nullable: true })
  exit_date: string | null;

  @Column({ type: 'int', nullable: true })
  reports_to: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  emergency_contact_name: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  emergency_contact_phone: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  emergency_contact_relationship: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  bank_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bank_account_no: string | null;

  @Column({ type: 'text', nullable: true })
  exit_reason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => CompanyUser, (companyUser) => companyUser.employee, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_user_id' })
  company_user: CompanyUser;

  @ManyToOne(() => Branch, (branch) => branch.primary_employees, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'primary_branch_id' })
  primary_branch: Branch | null;

  @ManyToOne(() => Department, (department) => department.primary_employees, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'primary_department_id' })
  primary_department: Department | null;

  @ManyToOne(() => Position, (position) => position.employees, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'position_id' })
  position: Position | null;

  @ManyToOne(() => Employee, (employee) => employee.direct_reports, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'reports_to' })
  manager: Employee | null;

  @OneToMany(() => Employee, (employee) => employee.manager)
  direct_reports: Employee[];

  @OneToMany(
    () => EmployeeDepartment,
    (employeeDepartment) => employeeDepartment.employee,
    {
      cascade: true,
    },
  )
  department_assignments: EmployeeDepartment[];

  @OneToMany(
    () => EmployeeDocument,
    (employeeDocument) => employeeDocument.employee,
    {
      cascade: true,
    },
  )
  documents: EmployeeDocument[];
}
