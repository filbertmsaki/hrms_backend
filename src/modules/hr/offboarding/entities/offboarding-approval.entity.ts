import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';
import { OffboardingRequest } from './offboarding-request.entity';
import { OffboardingWorkflowStep } from './offboarding-workflow-step.entity';

@Entity('offboarding_approvals')
@Index('IDX_offboarding_approval_request', ['offboarding_request_id'])
@Index('IDX_offboarding_approval_status', ['status'])
@Index('IDX_offboarding_approval_actor', ['approver_company_user_id'])
export class OffboardingApproval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  offboarding_request_id: number;

  @Column({ type: 'int', nullable: true })
  workflow_step_id: number | null;

  @Column({ type: 'int', nullable: true })
  approver_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingApprovalStatusEnum,
    default: OffboardingApprovalStatusEnum.PENDING,
  })
  status: OffboardingApprovalStatusEnum;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'timestamp', nullable: true })
  acted_at: Date | null;

  @Column({ type: 'int', nullable: true })
  original_approver_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  delegated_from_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  delegated_at: Date | null;

  @Column({ type: 'text', nullable: true })
  delegation_reason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_escalated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => OffboardingRequest, (request) => request.approvals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;

  @ManyToOne(() => OffboardingWorkflowStep, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_step_id' })
  workflow_step: OffboardingWorkflowStep | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_company_user_id' })
  approver_company_user: CompanyUser | null;
}
