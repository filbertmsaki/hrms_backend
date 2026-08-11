import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';

@Entity('employee_number_sequences')
@Unique('UQ_employee_number_sequence_company', ['company_id'])
export class EmployeeNumberSequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 20 })
  prefix: string;

  @Column({ type: 'smallint', default: 3 })
  padding: number;

  @Column({ type: 'integer', default: 1 })
  next_number: number;

  @Column({ type: 'int', nullable: true })
  updated_by_company_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
