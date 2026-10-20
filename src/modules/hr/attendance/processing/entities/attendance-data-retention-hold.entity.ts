import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AttendanceRetentionCategory =
  | 'RAW_HIKVISION_LOG'
  | 'MOBILE_SELFIE'
  | 'ATTENDANCE_LOCATION'
  | 'FIELD_VISIT_LOCATION';

@Entity('attendance_data_retention_holds')
@Index('IDX_attendance_retention_holds_company_category_record_active', [
  'companyId',
  'category',
  'recordId',
  'active',
])
export class AttendanceDataRetentionHold {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 32 })
  category: AttendanceRetentionCategory;

  @Column({ name: 'record_id', type: 'int' })
  recordId: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'released_by_company_user_id', type: 'int', nullable: true })
  releasedByCompanyUserId: number | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'release_reason', type: 'text', nullable: true })
  releaseReason: string | null;
}
