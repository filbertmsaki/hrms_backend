import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingRequest } from './onboarding-request.entity';
import { OnboardingWorkflowStep } from './onboarding-workflow-step.entity';

@Entity('onboarding_approvals')
@Index('IDX_onboarding_approval_request', ['onboarding_request_id'])
@Index('IDX_onboarding_approval_status', ['status'])
@Index('IDX_onboarding_approval_actor', ['approver_company_user_id'])
export class OnboardingApproval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  onboarding_request_id: number;

  @Column({ type: 'int', nullable: true })
  workflow_step_id: number | null;

  @Column({ type: 'int' })
  approval_level: number;

  @Column({ type: 'int', nullable: true })
  approver_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  original_approver_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  delegated_from_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OnboardingApprovalStatusEnum,
    default: OnboardingApprovalStatusEnum.PENDING,
  })
  status: OnboardingApprovalStatusEnum;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'text', nullable: true })
  signature_url: string | null;

  @Column({ type: 'timestamp', nullable: true })
  acted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  delegated_at: Date | null;

  @Column({ type: 'text', nullable: true })
  delegation_reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  due_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'timestamp', nullable: true })
  last_escalated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_count: number;

  @CreateDateColumn()
  created_at: Date;

  @VersionColumn()
  version: number;

  @ManyToOne(() => OnboardingRequest, (request) => request.approvals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'onboarding_request_id' })
  onboarding_request: OnboardingRequest;

  @ManyToOne(() => OnboardingWorkflowStep, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_step_id' })
  workflow_step: OnboardingWorkflowStep | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_company_user_id' })
  approver: CompanyUser | null;
}
