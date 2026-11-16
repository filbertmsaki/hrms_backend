import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LeaveRequest } from './leave-request.entity';

/**
 * A leave PDF verification code that HR withdrew. Kept so scanning an old
 * printout shows "revoked" instead of "not recognised".
 */
@Entity('leave_verification_revocations')
@Index('IDX_leave_verification_revocation_request', ['leave_request_id'])
export class LeaveVerificationRevocation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  leave_request_id: number;

  @Index('UQ_leave_verification_revocation_token', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  token: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'int', nullable: true })
  revoked_by_user_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  revoked_at: Date;

  @ManyToOne(() => LeaveRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest;
}
