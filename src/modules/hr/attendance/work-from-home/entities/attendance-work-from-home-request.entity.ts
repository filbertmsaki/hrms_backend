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
import { AttendanceWorkFromHomeStatusEnum } from '../enums/attendance-work-from-home-status.enum';

@Entity('attendance_work_from_home_requests')
@Index('IDX_attendance_wfh_company_employee_dates', [
  'companyId',
  'employeeId',
  'startDate',
  'endDate',
])
@Index('IDX_attendance_wfh_company_status', ['companyId', 'status'])
export class AttendanceWorkFromHomeRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: AttendanceWorkFromHomeStatusEnum,
    default: AttendanceWorkFromHomeStatusEnum.PENDING,
  })
  status: AttendanceWorkFromHomeStatusEnum;

  @Column({ name: 'reviewed_by_company_user_id', type: 'int', nullable: true })
  reviewedByCompanyUserId: number | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_company_user_id' })
  reviewedBy: CompanyUser | null;
}
