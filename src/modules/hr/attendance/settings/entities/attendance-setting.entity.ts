import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';

@Entity('attendance_settings')
@Index('IDX_attendance_settings_company_id', ['companyId'])
@Index('UQ_attendance_settings_company_name', ['companyId', 'name'], {
  unique: true,
})
export class AttendanceSetting {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'overtime_start_after_minutes', type: 'int', default: 0 })
  overtimeStartAfterMinutes: number;

  @Column({ name: 'max_overtime_minutes_per_day', type: 'int', default: 0 })
  maxOvertimeMinutesPerDay: number;

  @Column({ name: 'max_overtime_minutes_per_month', type: 'int', default: 0 })
  maxOvertimeMinutesPerMonth: number;

  @Column({
    name: 'overtime_rate_multiplier',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1,
  })
  overtimeRateMultiplier: string;

  @Column({
    name: 'holiday_overtime_multiplier',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1,
  })
  holidayOvertimeMultiplier: string;

  @Column({
    name: 'weekend_overtime_multiplier',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1,
  })
  weekendOvertimeMultiplier: string;

  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval: boolean;

  @Column({ name: 'auto_calculate', type: 'boolean', default: true })
  autoCalculate: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}




