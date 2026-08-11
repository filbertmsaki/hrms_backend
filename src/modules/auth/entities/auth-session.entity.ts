import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  AuthScope,
  UserType,
} from '../../../common/interfaces/authenticated-user.interface';

@Entity('auth_sessions')
@Index('IDX_auth_session_user', ['user_id'])
@Index('IDX_auth_session_company', ['company_id'])
@Index('IDX_auth_session_user_active', ['user_id', 'revoked_at'])
@Index('IDX_auth_session_refresh_expires', ['refresh_expires_at'])
export class AuthSession {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int', nullable: true })
  company_id: number | null;

  @Column({ type: 'varchar', length: 20 })
  scope: AuthScope;

  @Column({ type: 'varchar', length: 20 })
  user_type: UserType;

  @Column({ type: 'varchar', length: 30, default: 'web' })
  device_type: string;

  @Column({ type: 'varchar', length: 120 })
  device_name: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  last_activity_at: Date;

  @Column({ type: 'varchar', length: 45, nullable: true })
  last_activity_ip: string | null;

  @Column({ type: 'timestamptz' })
  refresh_expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ type: 'text', nullable: true })
  revocation_reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
