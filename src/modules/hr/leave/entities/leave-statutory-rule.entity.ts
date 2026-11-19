import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { LeaveStatutoryRuleSet } from './leave-statutory-rule-set.entity';

export type LeaveStatutoryRuleType =
  | 'annual_leave'
  | 'sick_leave'
  | 'maternity_leave'
  | 'paternity_leave'
  | 'public_holiday'
  | 'termination_settlement';

/** Settings per rule type; every value comes from the rule set's legal source. */
export type AnnualLeaveStatutorySettings = {
  /** Minimum paid annual leave per leave cycle. */
  minimum_days_per_cycle: number;
  cycle_months?: number;
  /** Months of service before the entitlement applies. */
  eligibility_months?: number;
  /** Unused days that may never be forfeited at year end. */
  protected_unused_days?: number;
};

export type SickLeavePayStage = { days: number; pay_percent: number };
export type SickLeaveStatutorySettings = {
  /** Window (months) over which sick days are counted for the stages. */
  reference_period_months: number;
  /** Ordered pay stages, e.g. N days at 100% then M days at 50%. */
  stages: SickLeavePayStage[];
  certificate_required_after_days?: number;
  eligibility_months?: number;
};

export type MaternityLeaveStatutorySettings = {
  standard_days: number;
  multiple_birth_days?: number;
  pay_percent?: number;
  eligibility_months?: number;
  /** At most this many maternity leaves within period_months. */
  max_occurrences?: number;
  period_months?: number;
};

export type PaternityLeaveStatutorySettings = {
  days: number;
  /** Must be taken within this many days of the birth. */
  within_days_of_birth?: number;
  pay_percent?: number;
  eligibility_months?: number;
};

export type PublicHolidayStatutorySettings = {
  /** Pay for hours worked on a public holiday, as % of the hourly rate. */
  premium_rate_percent: number;
  standard_hours_per_day?: number;
  /** Monthly hours used to turn monthly salary into an hourly rate. */
  monthly_hours_divisor?: number;
  compensatory_leave_allowed?: boolean;
};

export type TerminationSettlementStatutorySettings = {
  pay_unused_annual_leave: boolean;
  include_carried_forward: boolean;
  /** Monthly basic ÷ divisor = daily rate. */
  daily_rate_divisor: number;
};

/** One statutory rule (by type) inside a rule set. */
@Entity('leave_statutory_rules')
@Unique('UQ_leave_statutory_rule', ['rule_set_id', 'rule_type'])
export class LeaveStatutoryRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  rule_set_id: number;

  @Column({ type: 'varchar', length: 32 })
  rule_type: LeaveStatutoryRuleType;

  /** The company leave type this rule governs (annual, sick, maternity…). */
  @Column({ type: 'int', nullable: true })
  leave_type_id: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  legal_reference: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => LeaveStatutoryRuleSet, (set) => set.rules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rule_set_id' })
  rule_set?: LeaveStatutoryRuleSet;
}
