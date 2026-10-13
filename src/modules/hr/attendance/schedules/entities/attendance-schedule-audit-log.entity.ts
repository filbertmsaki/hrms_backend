import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('attendance_schedule_audit_logs')
@Index('IDX_attendance_schedule_audit_company_entity', [
  'companyId',
  'entityType',
  'entityId',
])
export class AttendanceScheduleAuditLog {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'entity_type', type: 'varchar', length: 40 })
  entityType: string;
  @Column({ name: 'entity_id', type: 'int' }) entityId: number;
  @Column({ type: 'varchar', length: 24 }) action: string;
  @Column({ name: 'actor_user_id', type: 'int', nullable: true }) actorUserId:
    | number
    | null;
  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;
  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
