import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { OffboardingActionStatusEnum } from '../enums/offboarding-action-status.enum';
import { OffboardingActionTypeEnum } from '../enums/offboarding-action-type.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_actions')
@Index('IDX_offboarding_action_company', ['company_id'])
@Index('IDX_offboarding_action_request', ['offboarding_request_id'])
@Index('IDX_offboarding_action_status', ['status'])
@Index('IDX_offboarding_action_owner', ['owner_company_user_id'])
export class OffboardingAction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  offboarding_request_id: number;

  @Column({
    type: 'enum',
    enum: OffboardingActionTypeEnum,
  })
  action_type: OffboardingActionTypeEnum;

  @Column({ type: 'varchar', length: 150, nullable: true })
  system_name: string | null;

  @Column({ type: 'int', nullable: true })
  owner_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingActionStatusEnum,
    default: OffboardingActionStatusEnum.PENDING,
  })
  status: OffboardingActionStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  requested_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'varchar', length: 191, nullable: true })
  external_reference: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => OffboardingRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_company_user_id' })
  owner_company_user: CompanyUser | null;
}
