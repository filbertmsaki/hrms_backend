import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { OnboardingRecordStatusEnum } from '../enums/onboarding-record-status.enum';
import { OnboardingRequest } from './onboarding-request.entity';
import { OnboardingWorkflowStep } from './onboarding-workflow-step.entity';

@Entity('onboarding_workflows')
@Index('IDX_onboarding_workflow_company', ['company_id'])
@Index('IDX_onboarding_workflow_status', ['status'])
export class OnboardingWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'int', nullable: true })
  root_workflow_id: number | null;

  @Column({ default: false })
  is_default: boolean;

  @Column({ default: false })
  is_locked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  locked_at: Date | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OnboardingRecordStatusEnum,
    default: OnboardingRecordStatusEnum.ACTIVE,
  })
  status: OnboardingRecordStatusEnum;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => OnboardingWorkflowStep, (step) => step.workflow, {
    cascade: true,
  })
  steps: OnboardingWorkflowStep[];

  @OneToMany(() => OnboardingRequest, (request) => request.workflow)
  onboarding_requests: OnboardingRequest[];
}
