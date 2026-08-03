import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('leave_number_sequences')
@Unique('UQ_leave_number_sequence_company_year', ['company_id', 'sequence_year'])
export class LeaveNumberSequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  sequence_year: number;

  @Column({ default: 1 })
  next_number: number;

  @UpdateDateColumn()
  updated_at: Date;
}
