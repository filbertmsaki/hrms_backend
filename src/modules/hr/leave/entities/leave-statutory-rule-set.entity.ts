import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { LeaveStatutoryRule } from './leave-statutory-rule.entity';

export type LeaveStatutoryRuleSetStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'superseded'
  | 'archived';

export type LeaveLegalReference = {
  title: string;
  citation?: string | null;
  url?: string | null;
};

/**
 * Statutory leave rules for one jurisdiction (e.g. TZ-MAINLAND), versioned
 * and effective-dated. A set applies only once activated, and activation
 * needs a recorded legal verification (test configurations excepted, and
 * only outside production).
 */
@Entity('leave_statutory_rule_sets')
@Unique('UQ_leave_statutory_set_version', [
  'company_id',
  'jurisdiction_code',
  'version_no',
])
export class LeaveStatutoryRuleSet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 32 })
  jurisdiction_code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'int', default: 1 })
  version_no: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: LeaveStatutoryRuleSetStatus;

  @Column({ type: 'date', nullable: true })
  effective_from: string | null;

  @Column({ type: 'date', nullable: true })
  effective_to: string | null;

  @Column({ type: 'text', nullable: true })
  legal_authority: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  legal_references: LeaveLegalReference[];

  @Column({ type: 'varchar', length: 20, default: 'unverified' })
  verification_status: 'unverified' | 'verified' | 'rejected';

  @Column({ type: 'int', nullable: true })
  verified_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'text', nullable: true })
  verification_notes: string | null;

  /** Test-only values for development/test environments; never production. */
  @Column({ default: false })
  is_test_configuration: boolean;

  @Column({ type: 'int', nullable: true })
  supersedes_rule_set_id: number | null;

  @Column({ type: 'text', nullable: true })
  change_reason: string | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => LeaveStatutoryRule, (rule) => rule.rule_set, {
    cascade: true,
  })
  rules: LeaveStatutoryRule[];
}
