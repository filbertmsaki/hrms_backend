import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PayrollObligationStatusEnum {
  /** Claimed by a calculated (not yet fully paid) run. Still blocks others. */
  RESERVED = 'RESERVED',
  /** Employee's net pay for the run was confirmed paid. */
  SETTLED = 'SETTLED',
  /** Run cancelled, reversed or recalculated: no longer claimed. */
  RELEASED = 'RELEASED',
}

/**
 * One earning a payroll run pays to an employee for an earning period. All
 * run types write here, so the same salary obligation can never be paid by two
 * runs (regular, supplementary, bonus, off-cycle or correction):
 * - recurring salary (BASIC and salary-structure components) is checked by
 *   amount against the period entitlement;
 * - one-off items (inputs, bonus schemes, corrections) are keyed by their
 *   source and can be claimed once.
 */
@Entity('payroll_payment_obligations')
@Index('IDX_payroll_obligation_employee_period', [
  'companyId',
  'employeeId',
  'payrollPeriodId',
  'componentCode',
])
@Index('IDX_payroll_obligation_run', ['payrollRunId'])
@Index(
  'UQ_payroll_obligation_one_off_live',
  ['companyId', 'employeeId', 'payrollPeriodId', 'componentCode', 'sourceKey'],
  {
    unique: true,
    where: `"obligation_kind" = 'ONE_OFF' AND "status" <> 'RELEASED'`,
  },
)
export class PayrollPaymentObligation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  /** Earning period the amount belongs to (not the period it is paid in). */
  @Column({ name: 'payroll_period_id' })
  payrollPeriodId: number;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  /** RECURRING (amount-checked) or ONE_OFF (source-keyed). */
  @Column({ name: 'obligation_kind', type: 'varchar', length: 20 })
  obligationKind: 'RECURRING' | 'ONE_OFF';

  /** e.g. COMPENSATION, SALARY_STRUCTURE, INPUT:123, BONUS_SCHEME:BS1. */
  @Column({ name: 'source_key', type: 'varchar', length: 160 })
  sourceKey: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  /** Period entitlement for recurring salary (regular calculation). */
  @Column({
    name: 'entitlement_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  entitlementAmount: string | null;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'run_type', type: 'varchar', length: 30 })
  runType: string;

  @Column({ type: 'varchar', length: 20 })
  status: PayrollObligationStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
