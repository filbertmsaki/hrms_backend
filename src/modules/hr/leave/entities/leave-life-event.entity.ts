import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type LeaveLifeEventType =
  | 'birth'
  | 'expected_birth'
  | 'child_death'
  | 'child_sickness'
  | 'spouse_death'
  | 'parent_death'
  | 'grandparent_death'
  | 'grandchild_death'
  | 'sibling_death';

/**
 * Evidence-backed life events that drive maternity, paternity and
 * compassionate entitlements. Documents are stored as leave documents and
 * referenced by id (protected by the existing leave document access checks).
 */
@Entity('leave_life_events')
@Index('IDX_leave_life_event_employee', ['company_id', 'employee_id', 'event_date'])
export class LeaveLifeEvent {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) employee_id: number;
  @Column({ type: 'varchar', length: 30 }) event_type: LeaveLifeEventType;
  /** Actual date (birth/death/diagnosis); for expected_birth the expected date. */
  @Column({ type: 'date' }) event_date: string;
  /** Links a child_death to its birth event. */
  @Column({ type: 'int', nullable: true }) related_event_id: number | null;
  @Column({ default: false }) multiple_birth: boolean;
  /** Births before this system (any spell) that used a paid maternity term. */
  @Column({ default: false }) historical_paid_maternity_term: boolean;
  @Column({ type: 'varchar', length: 100, nullable: true })
  nssf_reference: string | null;
  @Column({ type: 'int', nullable: true }) document_id: number | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'int' }) created_by_company_user_id: number;
  @Column({ type: 'int', nullable: true }) verified_by_company_user_id: number | null;
  @Column({ type: 'timestamptz', nullable: true }) verified_at: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}

/** Reasoned HR override of a specific rule finding (append-only). */
@Entity('leave_rule_overrides')
@Index('IDX_leave_rule_override_target', ['company_id', 'employee_id', 'rule_code'])
export class LeaveRuleOverride {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) employee_id: number;
  @Column({ type: 'int', nullable: true }) leave_request_id: number | null;
  /** e.g. SICK_CERTIFICATE, MATERNITY_EARLY_START, RETURN_TO_WORK, ANNUAL_ADVANCE */
  @Column({ type: 'varchar', length: 60 }) rule_code: string;
  /** For RETURN_TO_WORK: the date the override covers. */
  @Column({ type: 'date', nullable: true }) applies_on: string | null;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'int', nullable: true }) certificate_document_id: number | null;
  @Column({ type: 'int' }) created_by_company_user_id: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
