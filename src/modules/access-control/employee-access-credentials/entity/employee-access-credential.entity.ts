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
import { Employee } from '../../../hr/employees/entities/employee.entity';

@Entity('employee_access_credentials')
@Index('IDX_employee_access_credentials_company_id', ['companyId'])
@Index('IDX_employee_access_credentials_employee_id', ['employeeId'])
@Index('IDX_employee_access_credentials_card_no', ['cardNo'])
export class EmployeeAccessCredential {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'card_no', type: 'varchar', length: 100, nullable: true })
  cardNo: string | null;

  @Column({ name: 'pin_password', type: 'varchar', length: 50, nullable: true })
  pinPassword: string | null;

  @Column({ name: 'fingerprint_count', type: 'int', default: 0 })
  fingerprintCount: number;

  @Column({ name: 'face_count', type: 'int', default: 0 })
  faceCount: number;

  @Column({ name: 'has_fingerprint', type: 'boolean', default: false })
  hasFingerprint: boolean;

  @Column({ name: 'has_face', type: 'boolean', default: false })
  hasFace: boolean;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
