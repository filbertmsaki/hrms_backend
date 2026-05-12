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
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from './employee.entity';

@Entity('employee_academic_qualifications')
@Index('IDX_employee_academic_qualification_employee', ['employee_id'])
export class EmployeeAcademicQualification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 100 })
  country_of_residence: string;

  @Column({ type: 'varchar', length: 100 })
  education_level: string;

  @Column({ type: 'varchar', length: 150 })
  institution_name: string;

  @Column({ type: 'varchar', length: 150 })
  degree_or_certificate: string;

  @Column({ type: 'varchar', length: 150 })
  field_of_study: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'text' })
  academic_certificate_document_url: string;

  @Column({ type: 'int', nullable: true })
  uploaded_by_company_user_id: number | null;

  @CreateDateColumn()
  uploaded_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.academic_qualifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploaded_by: CompanyUser | null;
}
