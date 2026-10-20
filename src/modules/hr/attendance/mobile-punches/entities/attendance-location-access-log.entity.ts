import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('attendance_location_access_logs')
@Index('IDX_attendance_location_access_company_time', [
  'companyId',
  'accessedAt',
])
export class AttendanceLocationAccessLog {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'actor_company_user_id', type: 'int' })
  actorCompanyUserId: number;
  @Column({ name: 'employee_id', type: 'int', nullable: true }) employeeId:
    | number
    | null;
  @Column({ name: 'access_type', type: 'varchar', length: 40 })
  accessType: string;
  @Column({ name: 'record_id', type: 'int', nullable: true }) recordId:
    | number
    | null;
  @Column({ name: 'record_count', type: 'int', default: 0 })
  recordCount: number;
  @Column({ name: 'date_from', type: 'date', nullable: true }) dateFrom:
    | string
    | null;
  @Column({ name: 'date_to', type: 'date', nullable: true }) dateTo:
    | string
    | null;
  @Column({ type: 'text' }) purpose: string;
  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId: string | null;
  @Column({ name: 'ip_address', type: 'varchar', length: 100, nullable: true })
  ipAddress: string | null;
  @Column({ name: 'user_agent', type: 'text', nullable: true }) userAgent:
    | string
    | null;
  @CreateDateColumn({ name: 'accessed_at', type: 'timestamptz' })
  accessedAt: Date;
}
