import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('letter_templates')
@Index('IDX_letter_templates_company_type', ['company_id', 'letter_type'])
export class LetterTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'varchar', length: 40 })
  letter_type: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 240 })
  subject: string;

  @Column({
    type: 'varchar',
    length: 120,
    default: 'Dear {{employee_first_name}},',
  })
  salutation: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 160, default: 'Yours sincerely,' })
  closing: string;

  @Column({ type: 'int', nullable: true })
  signatory_id: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  signatory_name: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  signatory_title: string | null;

  @Column({ type: 'boolean', default: false })
  requires_approval: boolean;

  @Column({ type: 'boolean', default: false })
  include_acknowledgement: boolean;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_default: boolean;

  @Column({ type: 'int', default: 1 })
  current_version: number;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  updated_by_company_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at: Date | null;
}
