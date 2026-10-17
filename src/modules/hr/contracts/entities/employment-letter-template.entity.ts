import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum EmploymentLetterType {
  OFFER = 'OFFER',
  APPOINTMENT = 'APPOINTMENT',
}

@Entity('employment_letter_templates')
@Unique('UQ_employment_letter_template_company_type', [
  'companyId',
  'letterType',
])
export class EmploymentLetterTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'letter_type', type: 'varchar', length: 20 })
  letterType: EmploymentLetterType;

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

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
