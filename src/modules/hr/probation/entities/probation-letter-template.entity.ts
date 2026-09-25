import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { ProbationLetterTypeEnum } from '../enums/probation-letter-type.enum';

@Entity('probation_letter_templates')
@Unique('UQ_probation_letter_template_company_type', ['companyId', 'letterType'])
export class ProbationLetterTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'letter_type', type: 'varchar', length: 30 })
  letterType: ProbationLetterTypeEnum;

  @Column({ name: 'letterhead', type: 'text' })
  letterhead: string;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'signatory_name', type: 'varchar', length: 160 })
  signatoryName: string;

  @Column({ name: 'signatory_title', type: 'varchar', length: 160 })
  signatoryTitle: string;

  @Column({ name: 'updated_by_company_user_id', type: 'int' })
  updatedByCompanyUserId: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
