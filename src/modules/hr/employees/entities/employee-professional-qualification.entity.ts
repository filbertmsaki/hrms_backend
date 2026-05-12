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

@Entity('employee_professional_qualifications')
@Index('IDX_employee_professional_qualification_employee', ['employee_id'])
export class EmployeeProfessionalQualification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 100 })
  country_of_residence: string;

  @Column({ type: 'varchar', length: 150 })
  institution_name: string;

  @Column({ type: 'varchar', length: 150 })
  programme_name: string;

  @Column({ type: 'varchar', length: 150 })
  issuing_organization: string;

  @Column({ type: 'date' })
  issue_date: string;

  @Column({ type: 'date', nullable: true })
  expiry_date: string | null;

  @Column({ type: 'text' })
  professional_certificate_document_url: string;

  @Column({ type: 'int', nullable: true })
  uploaded_by_company_user_id: number | null;

  @CreateDateColumn()
  uploaded_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(
    () => Employee,
    (employee) => employee.professional_qualifications,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploaded_by: CompanyUser | null;
}
