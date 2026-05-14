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

  @Column({ type: 'datetime', nullable: true })
  acted_at: Date | null;

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
