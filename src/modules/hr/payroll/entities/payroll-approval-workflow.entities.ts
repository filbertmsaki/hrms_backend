import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayrollApprovalStageEnum } from '../payroll.enums';

export type PayrollApprovalWorkflowStage = {
  stage: PayrollApprovalStageEnum;
  label?: string | null;
  /** When set, only these company users (or their active delegates) may decide. */
  approver_company_user_ids?: number[] | null;
  /** Largest net pay total this stage may approve; above it the stage refuses. */
  max_net_pay_total?: string | null;
};

export type PayrollApprovalDelegation = {
  from_company_user_id: number;
  to_company_user_id: number;
  starts_on: string;
  ends_on: string;
};

export enum PayrollApprovalWorkflowScopeEnum {
  COMPANY = 'COMPANY',
  BRANCH = 'BRANCH',
  PAYROLL_GROUP = 'PAYROLL_GROUP',
}

/**
 * Payroll approval sequence for a company, branch or payroll group. Rows are
 * versioned: a change creates a new ACTIVE row and retires the old one, and a
 * run copies the resolved workflow when it is calculated, so editing the
 * configuration never alters a run already in approval.
 */
@Entity('payroll_approval_workflows')
@Index('IDX_payroll_approval_workflow_scope', ['companyId', 'scope', 'status'])
export class PayrollApprovalWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 20 })
  scope: PayrollApprovalWorkflowScopeEnum;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'payroll_group_id', type: 'int', nullable: true })
  payrollGroupId: number | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'jsonb' })
  stages: PayrollApprovalWorkflowStage[];

  @Column({ type: 'jsonb', nullable: true })
  delegations: PayrollApprovalDelegation[] | null;

  @Column({ name: 'version_number', type: 'int', default: 1 })
  versionNumber: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: 'ACTIVE' | 'RETIRED';

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
