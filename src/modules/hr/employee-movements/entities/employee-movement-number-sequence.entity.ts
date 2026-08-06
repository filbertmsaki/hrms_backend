import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('employee_movement_number_sequences')
@Unique('UQ_movement_sequence_company_year', ['companyId', 'sequenceYear'])
export class EmployeeMovementNumberSequence {
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
