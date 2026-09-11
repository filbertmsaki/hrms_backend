import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ProfileChangeRequestStatusEnum } from '../enums/profile-change-request-status.enum';
import { ProfileChangeRequestTypeEnum } from '../enums/profile-change-request-type.enum';
import { ProfileChangeRequestItem } from './profile-change-request-item.entity';
import { ProfileChangeRequestFile } from './profile-change-request-file.entity';
import { ProfileChangeRequestAudit } from './profile-change-request-audit.entity';

@Entity('profile_change_requests')
@Index('IDX_profile_change_requests_company_status', ['company_id', 'status'])
@Index('IDX_profile_change_requests_employee_created', [
  'employee_id',
  'created_at',
])
@Index('IDX_profile_change_requests_type', ['request_type'])
@Index('IDX_profile_change_requests_submitted', ['submitted_at'])
@Index('IDX_profile_change_requests_reference', ['reference_number'], {
  unique: true,
})
export class ProfileChangeRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  reference_number: string;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @Column({ type: 'int' })
  requested_by_user_id: number;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestTypeEnum,
  })
  request_type: ProfileChangeRequestTypeEnum;

  @Column({
    type: 'enum',
    enum: ProfileChangeRequestStatusEnum,
    default: ProfileChangeRequestStatusEnum.DRAFT,
  })
  status: ProfileChangeRequestStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  review_started_at: Date | null;

  @Column({ type: 'int', nullable: true })
  reviewed_by_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rejected_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  correction_requested_at: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  review_comment: string | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'text', nullable: true })
  correction_instructions: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @DeleteDateColumn({ nullable: true })
  deleted_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requested_by_user: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewed_by_user: User | null;

  @OneToMany(() => ProfileChangeRequestItem, (item) => item.request, {
    cascade: true,
  })
  items: ProfileChangeRequestItem[];

  @OneToMany(() => ProfileChangeRequestFile, (file) => file.request, {
    cascade: true,
  })
  files: ProfileChangeRequestFile[];

  // Audit rows are append-only and are always written explicitly by the
  // service. Cascading them from a request save risks detaching existing
  // history rows and nulling their required request_id foreign key.
  @OneToMany(() => ProfileChangeRequestAudit, (audit) => audit.request)
  audits: ProfileChangeRequestAudit[];
}
