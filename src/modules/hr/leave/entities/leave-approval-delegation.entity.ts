import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * While active, leave approvals assigned to the delegator go to the delegate.
 * Applied when approvers are assigned, not to approvals already pending.
 */
@Entity('leave_approval_delegations')
@Index('IDX_leave_delegation_delegator', [
  'company_id',
  'delegator_company_user_id',
  'status',
])
export class LeaveApprovalDelegation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  delegator_company_user_id: number;

  @Column()
  delegate_company_user_id: number;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  /** active | cancelled */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
