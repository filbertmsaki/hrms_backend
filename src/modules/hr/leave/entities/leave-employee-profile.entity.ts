import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type LeaveEmploymentPeriod = { start_date: string; end_date: string };

@Entity('leave_employee_profiles')
@Index('IDX_leave_employee_profile_effective', [
  'company_id',
  'employee_id',
  'effective_date',
  'id',
])
export class LeaveEmployeeProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @Column({ type: 'date' })
  effective_date: string;

  @Column({ type: 'varchar', length: 20 })
  jurisdiction: 'mainland' | 'zanzibar';

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  fte: string;

  @Column({ type: 'date', nullable: true })
  cycle_anchor_date: string | null;

  @Column({ type: 'jsonb' })
  previous_employment_periods: LeaveEmploymentPeriod[];

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'int' })
  created_by_company_user_id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
