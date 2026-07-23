import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { OffboardingExitInterviewStatusEnum } from '../enums/offboarding-exit-interview-status.enum';
import { OffboardingKnowledgeTransferStatusEnum } from '../enums/offboarding-knowledge-transfer-status.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_exit_interviews')
@Index('IDX_offboarding_exit_interview_request', ['offboarding_request_id'], {
  unique: true,
})
export class OffboardingExitInterview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  offboarding_request_id: number;

  @Column({ type: 'int', nullable: true })
  conducted_by_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingExitInterviewStatusEnum,
    default: OffboardingExitInterviewStatusEnum.DRAFT,
  })
  status: OffboardingExitInterviewStatusEnum;

  @Column({ type: 'varchar', length: 120, nullable: true })
  exit_reason_category: string | null;

  @Column({ type: 'text', nullable: true })
  employee_feedback: string | null;

  @Column({ type: 'text', nullable: true })
  manager_feedback: string | null;

  @Column({ type: 'boolean', nullable: true })
  rehire_eligible: boolean | null;

  @Column({
    type: 'enum',
    enum: OffboardingKnowledgeTransferStatusEnum,
    default: OffboardingKnowledgeTransferStatusEnum.NOT_STARTED,
  })
  knowledge_transfer_status: OffboardingKnowledgeTransferStatusEnum;

  @Column({ type: 'text', nullable: true })
  handover_notes: string | null;

  @Column({ type: 'text', nullable: true })
  final_notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => OffboardingRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'conducted_by_company_user_id' })
  conducted_by_company_user: CompanyUser | null;
}
