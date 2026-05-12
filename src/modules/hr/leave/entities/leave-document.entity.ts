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
import { LeaveRequest } from './leave-request.entity';

@Entity('leave_documents')
@Index('IDX_leave_document_leave_request', ['leave_request_id'])
export class LeaveDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  leave_request_id: number;

  @Column({ type: 'text' })
  file_url: string;

  @Column({ type: 'varchar', length: 180 })
  file_name: string;

  @Column({ type: 'varchar', length: 80 })
  file_type: string;

  @Column({ type: 'int', nullable: true })
  uploaded_by_company_user_id: number | null;

  @CreateDateColumn()
  uploaded_at: Date;

  @ManyToOne(() => LeaveRequest, (leaveRequest) => leaveRequest.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploaded_by: CompanyUser | null;
}
