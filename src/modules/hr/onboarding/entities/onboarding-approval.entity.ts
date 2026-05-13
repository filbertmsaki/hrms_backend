import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
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

  @Column({ type: 'datetime', nullable: true })
  acted_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

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
