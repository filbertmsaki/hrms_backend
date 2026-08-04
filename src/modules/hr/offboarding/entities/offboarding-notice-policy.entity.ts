import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('offboarding_notice_policies')
@Unique('UQ_offboarding_notice_policy_company_code', ['company_id', 'code'])
@Index('IDX_offboarding_notice_policy_company', ['company_id'])
export class OffboardingNoticePolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  employment_type: string | null;

  @Column({ type: 'int', nullable: true })
  grade_id: number | null;

  @Column({ type: 'int', nullable: true })
  position_id: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  confirmation_status: string | null;

  @Column({ type: 'int' })
  notice_days: number;

  @Column({ default: true })
  allow_waiver: boolean;

  @Column({ default: true })
  calculate_calendar_days: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
