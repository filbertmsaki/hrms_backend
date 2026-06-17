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
import { Company } from '../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendanceProcessingJobStatusEnum } from '../enums/attendance-processing-job-status.enum';

@Entity('attendance_recalculation_jobs')
@Index('IDX_attendance_recalculation_jobs_company_id', ['companyId'])
@Index('IDX_attendance_recalculation_jobs_employee_id', ['employeeId'])
@Index('IDX_attendance_recalculation_jobs_status', ['status'])
@Index('IDX_attendance_recalculation_jobs_company_status_created', [
  'companyId',
  'status',
  'createdAt',
])
export class AttendanceRecalculationJob {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'date_from', type: 'date' })
  dateFrom: string;

  @Column({ name: 'date_to', type: 'date' })
  dateTo: string;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceProcessingJobStatusEnum,
    default: AttendanceProcessingJobStatusEnum.PENDING,
  })
  status: AttendanceProcessingJobStatusEnum;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'requested_by_company_user_id', type: 'int', nullable: true })
  requestedByCompanyUserId: number | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by_company_user_id' })
  requestedByCompanyUser: CompanyUser | null;
}
