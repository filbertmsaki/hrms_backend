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
import { OffboardingAssetStatusEnum } from '../enums/offboarding-asset-status.enum';
import { OffboardingAssetTypeEnum } from '../enums/offboarding-asset-type.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_asset_returns')
@Index('IDX_offboarding_asset_return_company', ['company_id'])
@Index('IDX_offboarding_asset_return_request', ['offboarding_request_id'])
@Index('IDX_offboarding_asset_return_status', ['status'])
@Index('IDX_offboarding_asset_return_owner', ['owner_company_user_id'])
export class OffboardingAssetReturn {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  offboarding_request_id: number;

  @Column({
    type: 'enum',
    enum: OffboardingAssetTypeEnum,
  })
  asset_type: OffboardingAssetTypeEnum;

  @Column({ type: 'varchar', length: 180 })
  asset_label: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  asset_identifier: string | null;

  @Column({ type: 'int', nullable: true })
  owner_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingAssetStatusEnum,
    default: OffboardingAssetStatusEnum.PENDING,
  })
  status: OffboardingAssetStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  returned_at: Date | null;

  @Column({ type: 'int', nullable: true })
  received_by_company_user_id: number | null;

  @Column({ type: 'text', nullable: true })
  condition_notes: string | null;

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

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'received_by_company_user_id' })
  received_by_company_user: CompanyUser | null;
}
