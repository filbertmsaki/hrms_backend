import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('probation_number_sequences')
@Unique('UQ_probation_number_company_year', ['companyId', 'sequenceYear'])
export class ProbationNumberSequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'sequence_year' })
  sequenceYear: number;

  @Column({ name: 'next_number', default: 1 })
  nextNumber: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
