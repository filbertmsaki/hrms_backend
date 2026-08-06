import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeBankAccount } from '../../employees/entities/employee-bank-account.entity';

@Entity('employee_payroll_profiles')
@Unique('UQ_employee_payroll_profile', ['companyId', 'employeeId'])
@Unique('UQ_employee_payroll_number', ['companyId', 'payrollNumber'])
@Index('IDX_employee_payroll_profile_company_enabled', [
  'companyId',
  'payrollEnabled',
])
export class EmployeePayrollProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'payroll_number', type: 'varchar', length: 60 })
  payrollNumber: string;

  @Column({
    name: 'taxpayer_identification_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  taxpayerIdentificationNumber: string | null;

  @Column({
    name: 'social_security_scheme_code',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  socialSecuritySchemeCode: string | null;

  @Column({
    name: 'social_security_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  socialSecurityNumber: string | null;

  @Column({
    name: 'health_insurance_scheme_code',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  healthInsuranceSchemeCode: string | null;

  @Column({
    name: 'health_insurance_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  healthInsuranceNumber: string | null;

  @Column({
    name: 'tax_residency_code',
    type: 'varchar',
    length: 40,
    default: 'RESIDENT',
  })
  taxResidencyCode: string;

  @Column({
    name: 'employment_tax_category',
    type: 'varchar',
    length: 60,
    default: 'PRIMARY_EMPLOYMENT',
  })
  employmentTaxCategory: string;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 30,
    default: 'BANK_TRANSFER',
  })
  paymentMethod: string;

  @Column({ name: 'primary_bank_account_id', type: 'int', nullable: true })
  primaryBankAccountId: number | null;

  @Column({ type: 'varchar', length: 3, default: 'TZS' })
  currency: string;

  @Column({
    name: 'pay_frequency',
    type: 'varchar',
    length: 30,
    default: 'MONTHLY',
  })
  payFrequency: string;

  @Column({ name: 'payroll_enabled', default: true })
  payrollEnabled: boolean;

  @Column({ name: 'payroll_hold', default: false })
  payrollHold: boolean;

  @Column({ name: 'payroll_hold_reason', type: 'text', nullable: true })
  payrollHoldReason: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => EmployeeBankAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'primary_bank_account_id' })
  primaryBankAccount: EmployeeBankAccount | null;
}
