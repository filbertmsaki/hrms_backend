import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
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
import { Designation } from '../../designations/entities/designation.entity';
import { Department } from '../../departments/entities/department.entity';
import { Position } from '../../positions/entities/position.entity';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';
import { EmploymentTypeEnum } from '../enums/employment-type.enum';
import { EmployeeAddress } from './employee-address.entity';
import { EmployeeBankAccount } from './employee-bank-account.entity';
import { EmployeeContact } from './employee-contact.entity';
import { EmployeeDesignation } from './employee-designation.entity';
import { EmployeeDepartment } from './employee-department.entity';
import { EmployeeDocument } from './employee-document.entity';
import { EmployeePosition } from './employee-position.entity';
import { EmployeeExperience } from './employee-experience.entity';
import { EmployeeIdentification } from './employee-identification.entity';
import { EmployeeAcademicQualification } from './employee-academic-qualification.entity';
import { EmployeeProfessionalQualification } from './employee-professional-qualification.entity';
import { EmployeeRelative } from './employee-relative.entity';

// NAMING CONVENTION: This entity uses snake_case TypeScript property names that map
// directly to snake_case DB columns (no explicit @Column({ name }) mapping needed).
// Newer entities (Shift, AttendanceDailySummary, AccessGroup, etc.) use camelCase
// properties with explicit @Column({ name: 'snake_case' }) mappings. Both patterns
// work correctly with TypeORM. New entities should follow the camelCase pattern.
@Entity('employees')
@Index('IDX_employee_employee_no', ['employee_no'])
@Index('IDX_employee_employment_status', ['employment_status'])
@Index('IDX_employee_primary_branch', ['primary_branch_id'])
@Index('IDX_employee_primary_department', ['primary_department_id'])
@Index('IDX_employee_primary_position', ['primary_position_id'])
@Index('IDX_employee_primary_designation', ['primary_designation_id'])
@Index('IDX_employee_reports_to', ['reports_to'])
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

  @Column({ type: 'varchar', length: 20 })
  gender: string;

  @Column({ type: 'date', nullable: true })
  date_of_birth: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  marital_status: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nationality: string | null;

  @Column({ type: 'text', nullable: true })
  profile_photo_url: string | null;

  @Column({ type: 'int', nullable: true })
  primary_branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  primary_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  primary_position_id: number | null;

  @Column({ type: 'int', nullable: true })
  primary_designation_id: number | null;

  @Column({
    type: 'enum',
    enum: EmploymentStatusEnum,
    default: EmploymentStatusEnum.ONBOARDING,
  })
  employment_status: EmploymentStatusEnum;

  @Column({
    type: 'enum',
    enum: EmploymentTypeEnum,
    default: EmploymentTypeEnum.FULL_TIME,
  })
  employment_type: EmploymentTypeEnum;

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

  @ManyToOne(() => Position, (position) => position.primary_employees, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'primary_position_id' })
  primary_position: Position | null;

  @ManyToOne(
    () => Designation,
    (designation) => designation.primary_employees,
    {
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'primary_designation_id' })
  primary_designation: Designation | null;

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
    () => EmployeePosition,
    (employeePosition) => employeePosition.employee,
    {
      cascade: true,
    },
  )
  position_assignments: EmployeePosition[];

  @OneToMany(
    () => EmployeeDesignation,
    (employeeDesignation) => employeeDesignation.employee,
    {
      cascade: true,
    },
  )
  designation_assignments: EmployeeDesignation[];

  @OneToMany(
    () => EmployeeContact,
    (employeeContact) => employeeContact.employee,
    {
      cascade: true,
    },
  )
  contacts: EmployeeContact[];

  @OneToMany(
    () => EmployeeAddress,
    (employeeAddress) => employeeAddress.employee,
    {
      cascade: true,
    },
  )
  addresses: EmployeeAddress[];

  @OneToMany(
    () => EmployeeRelative,
    (employeeRelative) => employeeRelative.employee,
    {
      cascade: true,
    },
  )
  relatives: EmployeeRelative[];

  @OneToMany(
    () => EmployeeIdentification,
    (employeeIdentification) => employeeIdentification.employee,
    {
      cascade: true,
    },
  )
  identifications: EmployeeIdentification[];

  @OneToMany(
    () => EmployeeBankAccount,
    (employeeBankAccount) => employeeBankAccount.employee,
    {
      cascade: true,
    },
  )
  bank_accounts: EmployeeBankAccount[];

  @OneToMany(
    () => EmployeeDocument,
    (employeeDocument) => employeeDocument.employee,
    {
      cascade: true,
    },
  )
  documents: EmployeeDocument[];

  @OneToMany(
    () => EmployeeAcademicQualification,
    (academicQualification) => academicQualification.employee,
    {
      cascade: true,
    },
  )
  academic_qualifications: EmployeeAcademicQualification[];

  @OneToMany(
    () => EmployeeProfessionalQualification,
    (professionalQualification) => professionalQualification.employee,
    {
      cascade: true,
    },
  )
  professional_qualifications: EmployeeProfessionalQualification[];

  @OneToMany(
    () => EmployeeExperience,
    (experienceDetail) => experienceDetail.employee,
    {
      cascade: true,
    },
  )
  experience_details: EmployeeExperience[];
}
