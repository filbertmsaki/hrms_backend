import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ActionItemStatusEnum } from '../enums/action-item-status.enum';
import { ActionItemTypeEnum } from '../enums/action-item-type.enum';

@Entity('action_items')
@Unique('UQ_action_item_assignee_source', [
  'companyId',
  'assigneeCompanyUserId',
  'sourceKey',
])
@Index('IDX_action_item_assignee_status', [
  'companyId',
  'assigneeCompanyUserId',
  'status',
])
@Index('IDX_action_item_due', ['status', 'dueAt'])
export class ActionItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'assignee_company_user_id' })
  assigneeCompanyUserId: number;

  @Column({ name: 'assignee_employee_id', type: 'int', nullable: true })
  assigneeEmployeeId: number | null;

  @Column({ name: 'action_type', type: 'varchar', length: 40 })
  actionType: ActionItemTypeEnum;

  @Column({ name: 'source_module', type: 'varchar', length: 80 })
  sourceModule: string;

  @Column({ name: 'source_entity_type', type: 'varchar', length: 100 })
  sourceEntityType: string;

  @Column({ name: 'source_entity_id', type: 'varchar', length: 100 })
  sourceEntityId: string;

  @Column({ name: 'source_key', type: 'varchar', length: 220 })
  sourceKey: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'MEDIUM' })
  priority: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: ActionItemStatusEnum.OPEN,
  })
  status: ActionItemStatusEnum;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({
    name: 'action_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  actionUrl: string | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({
    name: 'opened_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  openedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
