import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('attendance_correction_documents')
@Index('IDX_attendance_correction_document_request', ['companyId', 'requestId'])
export class AttendanceCorrectionDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'request_id', type: 'int' })
  requestId: number;

  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ name: 'file_name', type: 'varchar', length: 180 })
  fileName: string;

  @Column({ name: 'file_type', type: 'varchar', length: 80 })
  fileType: string;

  @Column({ name: 'uploaded_by_company_user_id', type: 'int', nullable: true })
  uploadedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'uploaded_at' })
  uploadedAt: Date;
}
