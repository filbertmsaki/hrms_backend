import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileChangeRequestAuditActionEnum } from '../enums/profile-change-request-audit-action.enum';
import { ProfileChangeRequestStatusEnum } from '../enums/profile-change-request-status.enum';
import { ProfileChangeRequest } from './profile-change-request.entity';

@Entity('profile_change_request_audits')
@Index('IDX_profile_change_request_audits_request', ['request_id'])
@Index('IDX_profile_change_request_audits_employee', ['employee_id'])
@Index('IDX_profile_change_request_audits_company', ['company_id'])
export class ProfileChangeRequestAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  request_id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int', nullable: true })
  branch_id: number | null;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestAuditActionEnum,
  })
  action: ProfileChangeRequestAuditActionEnum;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestStatusEnum,
    nullable: true,
  })
  previous_status: ProfileChangeRequestStatusEnum | null;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestStatusEnum,
    nullable: true,
  })
  new_status: ProfileChangeRequestStatusEnum | null;

  @Column({ type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  actor_employee_id: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actor_role: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  request_id_header: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ProfileChangeRequest, (request) => request.audits, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: ProfileChangeRequest;
}
