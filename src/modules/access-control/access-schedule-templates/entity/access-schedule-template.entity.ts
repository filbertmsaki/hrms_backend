import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { AccessGroup } from '../../access-groups/entity/access-group.entity';
import { AccessWeekPlan } from '../../access-week-plans/entity/access-week-plan.entity';
import { AccessScheduleTemplateStatusEnum } from '../enum/access-schedule-template-status.enum';
import { AccessScheduleTemplateTypeEnum } from '../enum/access-schedule-template-type.enum';

@Entity('access_schedule_templates')
@Index('IDX_access_schedule_templates_company_id', ['companyId'])
@Index('IDX_access_schedule_templates_template_no', ['hikvisionTemplateNo'])
export class AccessScheduleTemplate {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'hikvision_template_no', type: 'varchar', length: 50 })
  hikvisionTemplateNo: string;

  @Column({
    name: 'schedule_type',
    type: 'enum',
    enum: AccessScheduleTemplateTypeEnum,
    default: AccessScheduleTemplateTypeEnum.DOOR,
  })
  scheduleType: AccessScheduleTemplateTypeEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AccessScheduleTemplateStatusEnum,
    default: AccessScheduleTemplateStatusEnum.ACTIVE,
  })
  status: AccessScheduleTemplateStatusEnum;

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

  @OneToMany(() => AccessWeekPlan, (weekPlan) => weekPlan.scheduleTemplate)
  weekPlans: AccessWeekPlan[];

  @OneToMany(() => AccessGroup, (group) => group.scheduleTemplate)
  groups: AccessGroup[];
}

