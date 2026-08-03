import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SecurityEventOutcome } from '../enums/security-event-outcome.enum';
import { SecurityEventType } from '../enums/security-event-type.enum';

@Entity('security_events')
@Index('IDX_security_event_company', ['company_id'])
@Index('IDX_security_event_actor', ['actor_user_id'])
@Index('IDX_security_event_target', ['target_user_id'])
@Index('IDX_security_event_type', ['event_type'])
@Index('IDX_security_event_occurred', ['occurred_at'])
export class SecurityEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  event_type: SecurityEventType;

  @Column({ type: 'varchar', length: 20 })
  outcome: SecurityEventOutcome;

  @Column({ type: 'int', nullable: true })
  company_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  target_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  target_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  role_id: number | null;

  @Column({ type: 'int', nullable: true })
  permission_id: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource_type: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  request_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  session_id: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  old_values: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  new_values: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  occurred_at: Date;
}
