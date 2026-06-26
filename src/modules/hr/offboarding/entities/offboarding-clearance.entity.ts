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
  cleared_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  cleared_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OffboardingRequest, (request) => request.clearances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cleared_by_company_user_id' })
  cleared_by_company_user: CompanyUser | null;
}
