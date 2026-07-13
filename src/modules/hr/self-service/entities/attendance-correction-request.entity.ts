import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AttendanceCorrectionRequestTypeEnum } from '../enums/attendance-correction-request-type.enum';
import { SelfServiceRequestStatusEnum } from '../enums/self-service-request-status.enum';

@Entity('attendance_correction_requests')
export class AttendanceCorrectionRequest {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'request_type', type: 'varchar', length: 50 })
  requestType: AttendanceCorrectionRequestTypeEnum;

  @Column({
    name: 'requested_check_in_at',
    type: 'timestamp',
    nullable: true,
  })
  requestedCheckInAt: Date | null;

  @Column({
    name: 'requested_check_out_at',
    type: 'timestamp',
    nullable: true,
  })
  requestedCheckOutAt: Date | null;

  @Column({
    name: 'requested_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  requestedStatus: string | null;

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

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'reviewed_by_company_user_id', type: 'int', nullable: true })
  reviewedByCompanyUserId: number | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
