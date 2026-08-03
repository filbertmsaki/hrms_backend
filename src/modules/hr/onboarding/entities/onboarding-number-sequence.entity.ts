import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('onboarding_number_sequences')
@Unique('UQ_onboarding_number_company_year', ['company_id', 'sequence_year'])
export class OnboardingNumberSequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int' })
  sequence_year: number;

  @Column({ type: 'int', default: 1 })
  next_number: number;

  @UpdateDateColumn()
  updated_at: Date;
}
