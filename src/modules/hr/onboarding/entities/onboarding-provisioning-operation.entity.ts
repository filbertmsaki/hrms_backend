import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { OnboardingProvisioningOperationStatusEnum } from '../enums/onboarding-provisioning-operation-status.enum';
import { OnboardingProvisioningOperationTypeEnum } from '../enums/onboarding-provisioning-operation-type.enum';
import { OnboardingRequest } from './onboarding-request.entity';

@Entity('onboarding_provisioning_operations')
@Unique('UQ_onboarding_provisioning_operation', [
  'onboarding_request_id',
  'operation_type',
  'resource_key',
])
@Index('IDX_onboarding_provisioning_request', ['onboarding_request_id'])
@Index('IDX_onboarding_provisioning_status', ['status'])
export class OnboardingProvisioningOperation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  onboarding_request_id: number;

  @Column({
    type: 'enum',
    enum: OnboardingProvisioningOperationTypeEnum,
  })
  operation_type: OnboardingProvisioningOperationTypeEnum;

  @Column({ type: 'varchar', length: 200 })
  resource_key: string;

  @Column({
    type: 'enum',
    enum: OnboardingProvisioningOperationStatusEnum,
    default: OnboardingProvisioningOperationStatusEnum.PENDING,
  })
  status: OnboardingProvisioningOperationStatusEnum;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0 })
  attempt_count: number;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  failed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'timestamp', nullable: true })
  next_retry_at: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => OnboardingRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'onboarding_request_id' })
  onboarding_request: OnboardingRequest;
}
