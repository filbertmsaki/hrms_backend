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
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../../hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AccessScheduleTemplate } from '../../access-schedule-templates/entity/access-schedule-template.entity';
import { AccessWeekPlanSourceEnum } from '../enum/access-week-plan-source.enum';
import { AccessWeekPlanSegment } from '../../access-week-plan-segments/entity/access-week-plan-segment.entity';

@Entity('access_week_plans')
@Index('IDX_access_week_plans_company_id', ['companyId'])
@Index('IDX_access_week_plans_branch_id', ['branchId'])
@Index('IDX_access_week_plans_device_id', ['deviceId'])
@Index('IDX_access_week_plans_plan_no', ['hikvisionPlanNo'])
@Unique('UQ_access_week_plans_device_plan_no', ['deviceId', 'hikvisionPlanNo'])
export class AccessWeekPlan {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'hikvision_plan_no', type: 'varchar', length: 50 })
  hikvisionPlanNo: string;

  @Column({ name: 'name', type: 'varchar', length: 150, nullable: true })
  name: string | null;

  @Column({ name: 'enable', type: 'boolean', default: true })
  enable: boolean;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AccessWeekPlanSourceEnum,
    default: AccessWeekPlanSourceEnum.MANUAL,
  })
  source: AccessWeekPlanSourceEnum;

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

  @OneToMany(() => AccessScheduleTemplate, (template) => template.weekPlan)
  templates: AccessScheduleTemplate[];

  @OneToMany(() => AccessWeekPlanSegment, (segment) => segment.weekPlan)
  segments: AccessWeekPlanSegment[];
}
