import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from './employee.entity';

@Entity('employee_documents')
export class EmployeeDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employee_id: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  type: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  file_url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  original_file_name: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  mime_type: string | null;

  @Column({ type: 'bigint', nullable: true })
  file_size: string | null;

  @Column({ type: 'varchar', length: 30, default: 'PRIVATE' })
  classification: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  retention_until: Date | null;

  @Column({ type: 'int', nullable: true })
  uploaded_by_company_user_id: number | null;

  @Column({ type: 'int', default: 0 })
  download_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_downloaded_at: Date | null;

  @Column({ type: 'int', nullable: true })
  last_downloaded_by_company_user_id: number | null;

  @CreateDateColumn()
  uploaded_at: Date;

  @ManyToOne(() => Employee, (employee) => employee.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploaded_by: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_downloaded_by_company_user_id' })
  last_downloaded_by: CompanyUser | null;
}
