import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { LeaveRequest } from './leave-request.entity';

@Entity('leave_audit_logs')
@Index('IDX_leave_audit_company', ['company_id'])
@Index('IDX_leave_audit_leave_request', ['leave_request_id'])
@Index('IDX_leave_audit_entity', ['entity_name', 'entity_id'])
@Index('IDX_leave_audit_action', ['action'])
export class LeaveAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  leave_request_id: number | null;

  @Column({ length: 120 })
  action: string;

  @Column({ length: 120 })
  entity_name: string;

  @Column({ type: 'int', nullable: true })
  entity_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => LeaveRequest, (leaveRequest) => leaveRequest.audit_logs, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_company_user_id' })
  actor_company_user: CompanyUser | null;
}
