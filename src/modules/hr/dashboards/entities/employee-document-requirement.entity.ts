import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';

@Entity('employee_document_requirements')
@Index(
  'UQ_employee_document_requirement_company_code',
  ['company_id', 'document_type_code'],
  {
    unique: true,
  },
)
@Index('IDX_employee_document_requirement_company_active', [
  'company_id',
  'is_active',
])
export class EmployeeDocumentRequirement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'varchar', length: 100 })
  document_type_code: string;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  /** Empty or omitted filters mean the requirement applies to all active employees. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  applicability: {
    branch_ids?: number[];
    department_ids?: number[];
    employment_types?: string[];
  };

  @Column({ type: 'date', nullable: true })
  effective_from: string | null;

  @Column({ type: 'date', nullable: true })
  effective_to: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
