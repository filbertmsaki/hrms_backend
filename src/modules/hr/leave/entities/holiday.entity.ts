import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';

@Entity('holidays')
@Unique('UQ_holiday_company_name_date', ['company_id', 'name', 'holiday_date'])
@Index('IDX_holiday_company', ['company_id'])
@Index('IDX_holiday_date', ['holiday_date'])
export class Holiday {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'date' })
  holiday_date: string;

  @Column({ default: false })
  is_recurring: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
