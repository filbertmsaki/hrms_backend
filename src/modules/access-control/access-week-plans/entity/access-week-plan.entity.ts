import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessDayOfWeekEnum } from '../enum/access-day-of-week.enum';

@Entity('access_week_plans')
@Index('IDX_access_week_plans_company_id', ['companyId'])
@Index('IDX_access_week_plans_template_id', ['scheduleTemplateId'])
@Index('IDX_access_week_plans_plan_no', ['hikvisionPlanNo'])
export class AccessWeekPlan {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'schedule_template_id', type: 'int' })
  scheduleTemplateId: number;

  @Column({ name: 'hikvision_plan_no', type: 'varchar', length: 50 })
  hikvisionPlanNo: string;

  @Column({
    name: 'day_of_week',
    type: 'enum',
    enum: AccessDayOfWeekEnum,
  })
  dayOfWeek: AccessDayOfWeekEnum;

  @Column({ name: 'start_time', type: 'varchar', length: 8 })
  startTime: string;

  @Column({ name: 'end_time', type: 'varchar', length: 8 })
  endTime: string;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => AccessScheduleTemplate, (template) => template.weekPlans, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'schedule_template_id' })
  scheduleTemplate: AccessScheduleTemplate;
}

