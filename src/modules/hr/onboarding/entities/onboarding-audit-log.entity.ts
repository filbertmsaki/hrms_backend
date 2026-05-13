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
import { OnboardingRequest } from './onboarding-request.entity';

@Entity('onboarding_audit_logs')
@Index('IDX_onboarding_audit_company', ['company_id'])
@Index('IDX_onboarding_audit_request', ['onboarding_request_id'])
@Index('IDX_onboarding_audit_entity', ['entity_name', 'entity_id'])
@Index('IDX_onboarding_audit_action', ['action'])
export class OnboardingAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'int', nullable: true })
  onboarding_request_id: number | null;

  @Column({ length: 120 })
  action: string;

  @Column({ length: 120 })
  entity_name: string;

  @Column({ type: 'int', nullable: true })
  entity_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OnboardingRequest, (request) => request.audit_logs, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'onboarding_request_id' })
  onboarding_request: OnboardingRequest | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_company_user_id' })
  actor_company_user: CompanyUser | null;
}
