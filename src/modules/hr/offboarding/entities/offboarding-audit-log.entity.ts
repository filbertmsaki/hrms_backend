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
import { OffboardingAuditActionEnum } from '../enums/offboarding-audit-action.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_audit_logs')
@Index('IDX_offboarding_audit_request', ['offboarding_request_id'])
@Index('IDX_offboarding_audit_action', ['action'])
export class OffboardingAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  offboarding_request_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingAuditActionEnum,
  })
  action: OffboardingAuditActionEnum;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true })
  old_values: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  new_values: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OffboardingRequest, (request) => request.audit_logs, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_company_user_id' })
  actor_company_user: CompanyUser | null;
}
