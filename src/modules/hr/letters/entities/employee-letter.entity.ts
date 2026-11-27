import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { LetterStatusEnum } from '../letter-catalogue';

@Entity('employee_letters')
@Unique('UQ_employee_letters_reference', ['company_id', 'reference_no'])
@Index('IDX_employee_letters_status', ['company_id', 'status'])
@Index('IDX_employee_letters_employee', ['company_id', 'employee_id'])
@Index('IDX_employee_letters_type', ['company_id', 'letter_type'])
export class EmployeeLetter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'varchar', length: 40 })
  reference_no: string;

  @Column({ type: 'varchar', length: 40 })
  letter_type: string;

  @Column({ type: 'int', nullable: true })
  template_id: number | null;

  @Column({ type: 'int', nullable: true })
  template_version: number | null;

  @Column({ type: 'int', nullable: true })
  employee_id: number | null;

  @Column({ type: 'int', nullable: true })
  candidate_id: number | null;

  @Column({ type: 'varchar', length: 200 })
  recipient_name: string;

  @Column({ type: 'text', nullable: true })
  recipient_address: string | null;

  @Column({ type: 'varchar', length: 240 })
  subject: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  salutation: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 160, default: '' })
  closing: string;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  extra_values: Record<string, string>;

  /** Resolved placeholder values, frozen at submit. */
  @Column({ type: 'jsonb', nullable: true })
  values: Record<string, string> | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  signatory_name: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  signatory_title: string | null;

  @Column({ type: 'boolean', default: false })
  requires_approval: boolean;

  @Column({ type: 'boolean', default: false })
  include_acknowledgement: boolean;

  @Column({ type: 'varchar', length: 24, default: LetterStatusEnum.DRAFT })
  status: LetterStatusEnum;

  @Column({ type: 'int', nullable: true })
  submitted_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'int', nullable: true })
  rejected_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejected_at: Date | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'int', nullable: true })
  issued_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  issued_at: Date | null;

  @Column({ type: 'int', nullable: true })
  cancelled_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'text', nullable: true })
  cancellation_reason: string | null;

  @Column({ type: 'int', nullable: true })
  revision_of_letter_id: number | null;

  @Column({ type: 'int', nullable: true })
  superseded_by_letter_id: number | null;

  @Column({ type: 'int', nullable: true })
  document_id: number | null;

  /** Never selected by default; read explicitly by verification and issue. */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    unique: true,
    select: false,
  })
  verification_token: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verification_revoked_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailed_at: Date | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
