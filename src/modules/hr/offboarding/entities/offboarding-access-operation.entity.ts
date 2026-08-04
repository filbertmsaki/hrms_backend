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
import { OffboardingAccessOperationStatusEnum } from '../enums/offboarding-access-operation-status.enum';
import { OffboardingAccessOperationTypeEnum } from '../enums/offboarding-access-operation-type.enum';
import { OffboardingRequest } from './offboarding-request.entity';

@Entity('offboarding_access_operations')
@Index('IDX_offboarding_access_operation_request', ['offboarding_request_id'])
@Index('IDX_offboarding_access_operation_status', ['status'])
@Index('IDX_offboarding_access_operation_due', ['scheduled_at'])
export class OffboardingAccessOperation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  offboarding_request_id: number;

  @Column({
    type: 'enum',
    enum: OffboardingAccessOperationTypeEnum,
  })
  operation_type: OffboardingAccessOperationTypeEnum;

  @Column({
    type: 'enum',
    enum: OffboardingAccessOperationStatusEnum,
    default: OffboardingAccessOperationStatusEnum.PENDING,
  })
  status: OffboardingAccessOperationStatusEnum;

  @Column({ type: 'timestamptz', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  failed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  attempt_count: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => OffboardingRequest, (request) => request.access_operations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;
}
