import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EmploymentLetterType {
  OFFER = 'OFFER',
  APPOINTMENT = 'APPOINTMENT',
  JOINING_FORM = 'JOINING_FORM',
  OTHER = 'OTHER',
  /** Contract-of-employment template (one per contract type). */
  CONTRACT = 'CONTRACT',
}

export type TemplateSection = { id: string; heading: string; body: string };

/** Letters: one per (company, type). Contracts: one per (company, contract type). */
@Entity('employment_letter_templates')
@Index(
  'UQ_employment_letter_template_company_type',
  ['companyId', 'letterType'],
  {
    unique: true,
    where: '"contract_type" IS NULL',
  },
)
@Index(
  'UQ_employment_letter_template_contract_type',
  ['companyId', 'letterType', 'contractType'],
  { unique: true, where: '"contract_type" IS NOT NULL' },
)
export class EmploymentLetterTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'letter_type', type: 'varchar', length: 20 })
  letterType: EmploymentLetterType;

  @Column({
    name: 'contract_type',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  contractType: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  sections: TemplateSection[];

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'signatory_name', type: 'varchar', length: 160 })
  signatoryName: string;

  @Column({ name: 'signatory_title', type: 'varchar', length: 160 })
  signatoryTitle: string;

  @Column({ name: 'updated_by_company_user_id', type: 'int' })
  updatedByCompanyUserId: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
