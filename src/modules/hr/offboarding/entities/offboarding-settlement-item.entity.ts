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
import { OffboardingSettlementItemTypeEnum } from '../enums/offboarding-settlement-item-type.enum';
import { OffboardingSettlementSourceEnum } from '../enums/offboarding-settlement-source.enum';
import { OffboardingSettlementStatusEnum } from '../enums/offboarding-settlement-status.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_settlement_items')
@Index('IDX_offboarding_settlement_company', ['company_id'])
@Index('IDX_offboarding_settlement_request', ['offboarding_request_id'])
@Index('IDX_offboarding_settlement_status', ['status'])
@Index('IDX_offboarding_settlement_owner', ['owner_company_user_id'])
export class OffboardingSettlementItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  offboarding_request_id: number;

  @Column({
    type: 'enum',
    enum: OffboardingSettlementItemTypeEnum,
  })
  item_type: OffboardingSettlementItemTypeEnum;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'int', nullable: true })
  owner_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingSettlementStatusEnum,
    default: OffboardingSettlementStatusEnum.PENDING,
  })
  status: OffboardingSettlementStatusEnum;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency: string | null;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({
    type: 'enum',
    enum: OffboardingSettlementSourceEnum,
    default: OffboardingSettlementSourceEnum.MANUAL,
  })
  source_type: OffboardingSettlementSourceEnum;

  @Column({ type: 'varchar', length: 150, nullable: true })
  source_reference: string | null;

  @Column({ type: 'jsonb', nullable: true })
  calculation_snapshot: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  verified_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  payment_reference: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_escalated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_count: number;

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
