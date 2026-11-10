import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SelfServiceRequestKind = 'attendance_correction' | 'profile_update';

export type SelfServiceApprovalStage = 'employee' | 'manager' | 'hr';

export type SelfServiceApprovalAction =
  | 'submitted'
  | 'resubmitted'
  | 'approved'
  | 'rejected'
  | 'returned_for_correction'
  | 'cancelled';

/** Append-only decision history for attendance correction and profile update requests. */
@Entity('self_service_request_approvals')
@Index('IDX_self_service_request_approval_request', [
  'companyId',
  'requestKind',
  'requestId',
])
export class SelfServiceRequestApproval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'request_kind', type: 'varchar', length: 40 })
  requestKind: SelfServiceRequestKind;

  @Column({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'stage', type: 'varchar', length: 20 })
  stage: SelfServiceApprovalStage;

  @Column({ name: 'action', type: 'varchar', length: 40 })
  action: SelfServiceApprovalAction;

  @Column({ name: 'from_status', type: 'varchar', length: 30, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 30 })
  toStatus: string;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ name: 'actor_employee_id', type: 'int', nullable: true })
  actorEmployeeId: number | null;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
