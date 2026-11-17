import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type LeaveAllocationBackfillStatus =
  | 'PROPOSED'
  | 'NEEDS_REVIEW'
  | 'APPLIED'
  | 'REVERTED';

/**
 * Audit trail for the historical leave allocation backfill (FRS-11.4.08).
 * One row per request per batch. APPLIED rows hold the exact before/after
 * snapshot so a batch can be reverted; a partial unique index allows at most
 * one APPLIED row per leave request, so a request cannot be backfilled twice.
 */
@Entity('leave_allocation_backfill_entries')
@Index('IDX_leave_alloc_backfill_batch', ['batchId'])
@Index('UQ_leave_alloc_backfill_applied', ['leaveRequestId'], {
  unique: true,
  where: `"status" = 'APPLIED'`,
})
export class LeaveAllocationBackfillEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'leave_request_id', type: 'int' })
  leaveRequestId: number;

  @Column({ type: 'varchar', length: 20 })
  status: LeaveAllocationBackfillStatus;

  @Column({ type: 'varchar', length: 60, nullable: true })
  method: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'before_snapshot', type: 'jsonb', nullable: true })
  beforeSnapshot: Record<string, unknown> | null;

  @Column({ name: 'after_snapshot', type: 'jsonb', nullable: true })
  afterSnapshot: Record<string, unknown> | null;

  @Column({ name: 'before_allocation', type: 'jsonb' })
  beforeAllocation: Record<string, number>;

  @Column({ name: 'after_allocation', type: 'jsonb', nullable: true })
  afterAllocation: Record<string, number> | null;

  @Column({ name: 'actor', type: 'varchar', length: 120 })
  actor: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'applied_at', type: 'timestamp', nullable: true })
  appliedAt: Date | null;

  @Column({ name: 'reverted_at', type: 'timestamp', nullable: true })
  revertedAt: Date | null;
}
