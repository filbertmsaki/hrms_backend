import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { ReportScheduleMisfireHandlingEnum } from '../enums/report-schedule-misfire-handling.enum';
import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportExecution } from './report-execution.entity';
import { ReportScheduleWeekday } from './report-schedule-weekday.entity';
import { ReportTemplate } from './report-template.entity';

/**
 * Structured schedule configuration for a report template. Recurrence details
 * are stored as data, with cron or queue expressions generated internally later.
 */
@Entity('report_schedules')
@Index('IDX_report_schedules_company_id', ['companyId'])
@Index('IDX_report_schedules_template_id', ['templateId'])
@Index('IDX_report_schedules_type', ['scheduleType'])
@Index('IDX_report_schedules_next_run_at', ['nextRunAt'])
@Index('IDX_report_schedules_company_active_next_run', [
  'companyId',
  'isActive',
  'nextRunAt',
])
@Index('UQ_report_schedules_company_name', ['companyId', 'name'], {
  unique: true,
})
export class ReportSchedule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'template_id', type: 'int' })
  templateId: number;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({
    name: 'schedule_type',
    type: 'enum',
    enum: ReportScheduleTypeEnum,
    enumName: 'report_schedule_type_enum',
  })
  scheduleType: ReportScheduleTypeEnum;

  @Column({ name: 'execution_time', type: 'time', nullable: true })
  executionTime: string | null;

  @Column({ name: 'day_of_month', type: 'int', nullable: true })
  dayOfMonth: number | null;

  @Column({
    name: 'timezone',
    type: 'varchar',
    length: 100,
    default: 'Africa/Dar_es_Salaam',
  })
  timezone: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'one_time_run_at', type: 'timestamp', nullable: true })
  oneTimeRunAt: Date | null;

  @Column({
    name: 'cron_expression',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  cronExpression: string | null;

  @Column({
    name: 'misfire_handling',
    type: 'enum',
    enum: ReportScheduleMisfireHandlingEnum,
    enumName: 'report_schedule_misfire_handling_enum',
    default: ReportScheduleMisfireHandlingEnum.SKIP,
  })
  misfireHandling: ReportScheduleMisfireHandlingEnum;

  @Column({ name: 'max_retry_attempts', type: 'int', default: 3 })
  maxRetryAttempts: number;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ name: 'paused_at', type: 'timestamp', nullable: true })
  pausedAt: Date | null;

  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ name: 'next_run_at', type: 'timestamp', nullable: true })
  nextRunAt: Date | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => ReportTemplate, (template) => template.schedules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: ReportTemplate;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  createdByCompanyUser: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_company_user_id' })
  updatedByCompanyUser: CompanyUser | null;

  @OneToMany(() => ReportScheduleWeekday, (weekday) => weekday.schedule)
  weekdays: ReportScheduleWeekday[];

  @OneToMany(() => ReportExecution, (execution) => execution.schedule)
  executions: ReportExecution[];
}
