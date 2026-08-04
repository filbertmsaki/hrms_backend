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
import { OffboardingClearanceStatusEnum } from '../enums/offboarding-clearance-status.enum';
import { OffboardingClearanceTypeEnum } from '../enums/offboarding-clearance-type.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_clearances')
@Index('IDX_offboarding_clearance_request', ['offboarding_request_id'])
@Index('IDX_offboarding_clearance_status', ['status'])
@Index('IDX_offboarding_clearance_owner', ['owner_company_user_id'])
export class OffboardingClearance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  offboarding_request_id: number;

  @Column({
    type: 'enum',
    enum: OffboardingClearanceTypeEnum,
  })
  clearance_type: OffboardingClearanceTypeEnum;

  @Column({
    type: 'enum',
    enum: OffboardingClearanceStatusEnum,
    default: OffboardingClearanceStatusEnum.PENDING,
  })
  status: OffboardingClearanceStatusEnum;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'int', nullable: true })
  owner_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'int', nullable: true })
  cleared_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  cleared_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_escalated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_count: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OffboardingRequest, (request) => request.clearances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_company_user_id' })
  owner_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cleared_by_company_user_id' })
  cleared_by_company_user: CompanyUser | null;
}
