import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from './user.entity';

@Entity('user_two_factor_audit_logs')
@Index('IDX_user_2fa_audit_company', ['company_id'])
@Index('IDX_user_2fa_audit_target_user', ['target_user_id'])
@Index('IDX_user_2fa_audit_action', ['action'])
export class UserTwoFactorAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  target_user_id: number;

  @Column({ length: 100 })
  target_user_email: string;

  @Column({ type: 'boolean' })
  previous_status: boolean;

  @Column({ type: 'boolean' })
  new_status: boolean;

  @Column({ length: 120 })
  action: string;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'text', nullable: true })
  disable_reason: string | null;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_user_id' })
  target_user: User | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_company_user_id' })
  actor_company_user: CompanyUser | null;
}
