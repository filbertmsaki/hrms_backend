import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { LeaveRequest } from './leave-request.entity';

@Entity('leave_medical_details')
@Unique('UQ_leave_medical_detail_leave_request', ['leave_request_id'])
export class LeaveMedicalDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  leave_request_id: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  sickness_nature: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  doctor_name: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  doctor_phone: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  hospital_name: string | null;

  @Column({ type: 'date', nullable: true })
  treatment_start_date: string | null;

  @Column({ type: 'date', nullable: true })
  treatment_end_date: string | null;

  @Column({ type: 'text', nullable: true })
  attachment_url: string | null;

  @CreateDateColumn()
  created_at: Date;

  @OneToOne(() => LeaveRequest, (leaveRequest) => leaveRequest.medical_detail, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest;
}
