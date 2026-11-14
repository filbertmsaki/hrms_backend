import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Approved, immutable rule set for a policy. The database rejects updates to
 * the rules/effective date; a future-dated revision may only be withdrawn
 * before it takes effect. Calculations pick the latest non-withdrawn revision
 * with effective_date <= the relevant date.
 */
@Entity('leave_policy_revisions')
@Index('IDX_leave_policy_revision_effective', [
  'company_id',
  'policy_id',
  'effective_date',
])
@Index(
  'UQ_leave_policy_revision_active_date',
  ['policy_id', 'effective_date'],
  {
    unique: true,
    where: '"withdrawn_at" IS NULL',
  },
)
export class LeavePolicyRevision {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) policy_id: number;
  @Column({ type: 'varchar', length: 20 }) jurisdiction:
    | 'mainland'
    | 'zanzibar';
  @Column({ type: 'date' }) effective_date: string;
  @Column({ type: 'jsonb' }) rules: Record<string, unknown>;
  @Column({ type: 'varchar', length: 64 }) rules_sha256: string;
  @Column({ type: 'int' }) source_draft_revision_id: number;
  @Column({ type: 'int' }) approved_by_company_user_id: number;
  @Column({ type: 'text' }) approval_reason: string;
  @CreateDateColumn({ type: 'timestamptz' }) approved_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) withdrawn_at: Date | null;
  @Column({ type: 'int', nullable: true })
  withdrawn_by_company_user_id: number | null;
  @Column({ type: 'text', nullable: true }) withdrawal_reason: string | null;
}

/** Effective-dated assignment of an employee to a leave policy (append-only). */
@Entity('leave_policy_assignments')
@Index('IDX_leave_policy_assignment_effective', [
  'company_id',
  'employee_id',
  'effective_date',
  'id',
])
export class LeavePolicyAssignment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) employee_id: number;
  @Column({ type: 'int' }) policy_id: number;
  @Column({ type: 'date' }) effective_date: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'int', nullable: true }) cutover_snapshot_id: number | null;
  @Column({ type: 'int' }) created_by_company_user_id: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
