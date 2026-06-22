import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SelfServiceRequestStatusEnum } from '../enums/self-service-request-status.enum';

@Entity('employee_profile_update_requests')
export class EmployeeProfileUpdateRequest {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'field_name', type: 'varchar', length: 100 })
  fieldName: string;

  @Column({ name: 'current_value', type: 'text', nullable: true })
  currentValue: string | null;

  @Column({ name: 'requested_value', type: 'text' })
  requestedValue: string;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: SelfServiceRequestStatusEnum.DRAFT,
  })
  status: SelfServiceRequestStatusEnum;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'reviewed_by_user_id', type: 'int', nullable: true })
  reviewedByUserId: number | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewer_notes', type: 'text', nullable: true })
  reviewerNotes: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
