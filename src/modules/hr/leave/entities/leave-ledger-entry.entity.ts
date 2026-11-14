import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type LeaveFamily =
  | 'annual'
  | 'sick'
  | 'maternity'
  | 'paternity'
  | 'compassionate'
  | 'unpaid';

export enum LeaveLedgerEntryType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  /** Sick/compassionate entitlement granted at cycle start. */
  ENTITLEMENT = 'ENTITLEMENT',
  ACCRUAL = 'ACCRUAL',
  /** Six-month early-service true-up (once per spell). */
  TRUE_UP = 'TRUE_UP',
  /** Moves a closed cycle's remainder into its own carry-over bucket (pair). */
  CARRY_OVER_OUT = 'CARRY_OVER_OUT',
  CARRY_OVER_IN = 'CARRY_OVER_IN',
  RESERVED = 'RESERVED',
  RESERVATION_RELEASED = 'RESERVATION_RELEASED',
  TAKEN = 'TAKEN',
  /** Zero-amount markers for expiry state; extension carries new expiry. */
  EXPIRY_FLAGGED = 'EXPIRY_FLAGGED',
  EXPIRY_EXTENDED = 'EXPIRY_EXTENDED',
  FORFEITED = 'FORFEITED',
  PAYOUT = 'PAYOUT',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
}

/**
 * Append-only Mainland leave ledger. Every balance is a sum of entries:
 *  - dimension 'balance' amounts change the available balance;
 *  - dimension 'reservation' amounts hold days for pending/future requests.
 * Buckets: `source_cycle_start` identifies which cycle's credit an entry
 * belongs to (oldest-first consumption). Rows are never updated or deleted
 * (database trigger); corrections are REVERSAL rows.
 */
@Entity('leave_ledger_entries')
@Index('IDX_leave_ledger_employee_family', [
  'company_id',
  'employee_id',
  'family',
  'effective_date',
])
@Index('IDX_leave_ledger_request', ['leave_request_id'])
@Unique('UQ_leave_ledger_idempotency', ['company_id', 'idempotency_key'])
export class LeaveLedgerEntry {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) employee_id: number;
  @Column({ type: 'int' }) leave_type_id: number;
  @Column({ type: 'varchar', length: 20 }) family: LeaveFamily;
  @Column({ type: 'varchar', length: 30 }) entry_type: LeaveLedgerEntryType;
  @Column({ type: 'varchar', length: 12, default: 'balance' })
  dimension: 'balance' | 'reservation';
  /** Cycle the entry is posted in. */
  @Column({ type: 'date' }) cycle_start: string;
  /** Credit bucket the amount belongs to (= cycle_start for own-cycle credit). */
  @Column({ type: 'date' }) source_cycle_start: string;
  @Column({ type: 'date', nullable: true }) bucket_expires_on: string | null;
  @Column({ type: 'date' }) effective_date: string;
  @Column({ type: 'numeric', precision: 12, scale: 4 }) amount_days: string;
  /** Sick pay tier (1, 0.5, 0) or maternity paid flag; null when n/a. */
  @Column({ type: 'numeric', precision: 5, scale: 4, nullable: true })
  pay_rate: string | null;
  @Column({ type: 'int', nullable: true }) leave_request_id: number | null;
  @Column({ type: 'int', nullable: true }) policy_revision_id: number | null;
  @Column({ type: 'int', nullable: true }) reverses_entry_id: number | null;
  @Column({ type: 'varchar', length: 200 }) idempotency_key: string;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
