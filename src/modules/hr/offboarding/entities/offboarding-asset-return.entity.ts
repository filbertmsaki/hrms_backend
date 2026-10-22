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
import { EmployeeAsset } from '../../employees/entities/employee-asset.entity';

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

  @Column({ type: 'int', nullable: true })
  employee_asset_id: number | null;

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

  @Column({ type: 'varchar', length: 50, nullable: true })
  condition_at_return: string | null;

  @Column({ type: 'int', nullable: true })
  return_evidence_document_id: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  liability_amount: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  liability_currency: string | null;

  @Column({ default: false })
  liability_acknowledged: boolean;

  @Column({ type: 'int', nullable: true })
  verified_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

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

  @ManyToOne(() => EmployeeAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_asset_id' })
  employee_asset: EmployeeAsset | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_company_user_id' })
  owner_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'received_by_company_user_id' })
  received_by_company_user: CompanyUser | null;
}
