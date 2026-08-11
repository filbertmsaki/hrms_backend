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
import { ProbationAuditActionEnum } from '../enums/probation-audit-action.enum';
import { ProbationCase } from './probation-case.entity';

@Entity('probation_audit_logs')
@Index('IDX_probation_audit_case', ['probation_case_id'])
@Index('IDX_probation_audit_action', ['action'])
export class ProbationAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  probation_case_id: number | null;

  @Column({ type: 'int', nullable: true })
  review_cycle_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_company_user_id: number | null;

  @Column({ type: 'varchar', length: 80 })
  action: ProbationAuditActionEnum;

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

  @ManyToOne(() => ProbationCase, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'probation_case_id' })
  probation_case: ProbationCase | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_company_user_id' })
  actor_company_user: CompanyUser | null;
}
