import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { SessionPolicyDto } from '../dtos/session-policy.dto';

@Entity('auth_policy')
export class AuthPolicy {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ type: 'jsonb' })
  policy: SessionPolicyDto;
}
