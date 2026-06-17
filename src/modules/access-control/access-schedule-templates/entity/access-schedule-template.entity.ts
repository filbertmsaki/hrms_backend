import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessWeekPlan } from '../../access-week-plans/entity/access-week-plan.entity';
import { AccessScheduleTemplateSourceEnum } from '../enum/access-schedule-template-source.enum';
import { AccessScheduleTemplateStatusEnum } from '../enum/access-schedule-template-status.enum';
import { AccessScheduleTemplateTypeEnum } from '../enum/access-schedule-template-type.enum';

@Entity('access_schedule_templates')
@Index('IDX_access_schedule_templates_company_id', ['companyId'])
@Index('IDX_access_schedule_templates_branch_id', ['branchId'])
@Index('IDX_access_schedule_templates_device_id', ['deviceId'])
@Index('IDX_access_schedule_templates_week_plan_id', ['weekPlanId'])
@Index('IDX_access_schedule_templates_template_no', ['hikvisionTemplateNo'])
@Unique('UQ_access_schedule_templates_device_template_no', [
  'deviceId',
  'hikvisionTemplateNo',
])
export class AccessScheduleTemplate {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'hikvision_template_no', type: 'varchar', length: 50 })
  hikvisionTemplateNo: string;

  @Column({ name: 'template_name', type: 'varchar', length: 150 })
  templateName: string;

  @Column({ name: 'name', type: 'varchar', length: 150, nullable: true })
  name: string | null;

  @Column({ name: 'week_plan_id', type: 'int' })
  weekPlanId: number;

  @Column({ name: 'hikvision_week_plan_no', type: 'varchar', length: 50 })
  hikvisionWeekPlanNo: string;

  @Column({
    name: 'holiday_group_no',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  holidayGroupNo: string | null;

  @Column({ name: 'enable', type: 'boolean', default: true })
  enable: boolean;

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

  @Column({
    name: 'source',
    type: 'enum',
    enum: AccessScheduleTemplateSourceEnum,
    default: AccessScheduleTemplateSourceEnum.MANUAL,
  })
  source: AccessScheduleTemplateSourceEnum;

  @Column({ name: 'is_system_default', type: 'boolean', default: false })
  isSystemDefault: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

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

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;

  @ManyToOne(() => AccessWeekPlan, (weekPlan) => weekPlan.templates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'week_plan_id' })
  weekPlan: AccessWeekPlan;
}
