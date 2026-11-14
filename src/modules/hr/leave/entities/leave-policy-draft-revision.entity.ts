import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A stored draft only. No request or balance engine reads these revisions. */
@Entity('leave_policy_draft_revisions')
@Index('IDX_leave_policy_draft_company_policy', [
  'company_id',
  'policy_id',
  'id',
])
export class LeavePolicyDraftRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  policy_id: number;

  @Column({ type: 'date' })
  proposed_effective_date: string;

  @Column({ type: 'jsonb' })
  rules: Record<string, unknown>;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'int' })
  created_by_company_user_id: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
