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
